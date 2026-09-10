# CI/CD: Artifact Registry and Cloud Run

The repository deploys its Go API and generation worker to Google Cloud Run. Every push to `main` builds versioned container images, pushes them to Artifact Registry, runs database migrations, and rolls the "latest iteration" of both services onto Cloud Run as a new revision.

## Flow

1. GitHub Actions builds four image targets from `apps/api/Dockerfile` using Docker BuildKit. The Dockerfile also provides Linux/amd64 defaults for `BUILDPLATFORM`, `TARGETOS`, and `TARGETARCH`, so plain Docker builds (including Google Cloud Build's Docker builder) do not expand the platform to an empty value:
   - `api` (web server, port 8000) -> Cloud Run **service** `api`
   - `worker` (River queue consumer with a health server, port 8080) -> Cloud Run **service** `worker`
   - `preview` (LibreOffice preview renderer with a health server, port 8080) -> Cloud Run **service** `preview-worker`
   - `migrate` (Goose + River migrations, one-shot) -> Cloud Run **job** `slidesage-migrate`
2. Each image is tagged with the full git commit SHA (e.g. `api:a1b2c3d...`) plus `latest` and pushed to Artifact Registry.
3. `terraform apply -target=google_cloud_run_v2_job.migrate` updates the migration job to the new image, then `gcloud run jobs execute` runs it against the database and waits.
4. A fresh full plan and `terraform apply` point the `api`, `worker`, and `preview-worker` Cloud Run services at the SHA-tagged image. Cloud Run creates a new revision and routes 100% of traffic to it, which is the "latest iteration" seen by users. Previous revisions remain available by SHA for rollback.

After this testing bookmark is merged through dev into main and the documented bootstrap is complete, Terraform will own the Cloud Run services, the job, the load balancer, and supporting IAM. The currently deployed services were created with gcloud; no adoption has been applied from this bookmark. The workflow supplies only the image references, through `TF_VAR_api_image`, `TF_VAR_worker_image`, `TF_VAR_preview_image`, and `TF_VAR_migrate_image`. It needs the `TF_STATE_BUCKET`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` repository secrets alongside the existing workload-identity secrets. See [Production infrastructure](PRODUCTION_INFRASTRUCTURE.md).

Trigger: a push to `main` after the dev-to-main PR is merged, or a manual dispatch on `main`. Both jobs explicitly reject other refs, so dispatching from the testing bookmark cannot publish images or change production. All production runs share one concurrency group.

A complete plan runs before the targeted migration update. Missing secrets, missing Cloudflare DNS permissions, or invalid import IDs stop deployment before any Terraform apply. The first deployment also needs the state bucket, credentials, and imports described in [Production infrastructure](PRODUCTION_INFRASTRUCTURE.md).

## Artifact Registry layout

Location is `asia-south1`, repository `slidesage`.

```text
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/api:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/api:latest
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/worker:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/worker:latest
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/preview:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/preview:latest
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/migrate:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/migrate:latest
```

Cloud Run runs in `asia-south1`. Change `RUN_REGION` and `REGISTRY_LOCATION` in `.github/workflows/deploy.yml` if you move regions.

The production API is served at `https://api.slidesage.app` through a global external HTTPS load balancer. Its reserved IPv4 address is `34.107.143.198`; the Cloudflare `api` record must be a DNS-only `A` record pointing to that address. Cloud Run custom domain mappings are unavailable in `asia-south1`, so the load balancer connects to the `api` service through the `slidesage-api-neg` serverless NEG.

Cloudflare Pages runs `bun install --frozen-lockfile && bun run build` from `apps/web`. Vite bundles the React application into `apps/web/dist`, handles route-level code splitting, processes Tailwind through `@tailwindcss/vite`, and copies static files from `apps/web/public`.

The Pages deployment copies `apps/web/public/_headers` into the build and sends `Cache-Control: no-cache` for the application and its assets. Do not add a Cloudflare Browser TTL or Cache Everything rule for `slidesage.app`. Pages manages its own CDN cache, and an extra zone cache can keep HTML from one deployment while its hashed JavaScript chunks come from another. The web entry point also listens for Vite's `vite:preloadError` event. If an open tab requests a chunk removed by a newer deployment, it reloads once to fetch the current HTML and then leaves any repeated failure to the route error page instead of entering a reload loop.

## One-time GCP bootstrap

Run these once with the account that owns the project. Set `PROJECT_ID` to `slidesage-504414` and `PROJECT_NUMBER` to the project number (see `gcloud projects describe $PROJECT_ID`).

```bash
PROJECT_ID=slidesage-504414
PROJECT_NUMBER=94621805506
REPO_URL=SINGH-RAJVEER/slidesage

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud config set project $PROJECT_ID

gcloud artifacts repositories create slidesage \
  --repository-format=docker \
  --location=asia-south1 \
  --project=$PROJECT_ID

gcloud iam service-accounts create slidesage-deploy \
  --display-name="SlideSage CI deploy" \
  --project=$PROJECT_ID

gcloud iam workload-identity-pools create slidesage \
  --location=global \
  --display-name="SlideSage CI pool" \
  --project=$PROJECT_ID

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=slidesage \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --attribute-condition="attribute.repository == '$REPO_URL'" \
  --project=$PROJECT_ID

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:slidesage-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.writer

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:slidesage-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/run.admin

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:slidesage-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

gcloud iam service-accounts add-iam-policy-binding \
  slidesage-deploy@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/slidesage/attribute.repository/$REPO_URL"
```

The workflow signs in to GCP through Workload Identity Federation using short-lived OIDC tokens from GitHub, so no long-lived service account keys are stored anywhere.

The commands above describe the existing image-build and Cloud Run identity bootstrap. They are not a complete Terraform permission setup. Before adoption, authorize the CI identity to manage the resources in `infra/prod`, including Compute load balancing, Cloud SQL, Artifact Registry, service accounts, project services/IAM, Secret Manager IAM, and storage buckets/IAM. It also needs object access to the Terraform state bucket. Grant permissions at the narrowest supported scope through a separately approved IAM change; no permissions are granted by editing this repository.

Do not reduce the identity to the old service-scoped Cloud Run roles while expecting it to manage the full Terraform stack. Runtime service accounts remain separate from the deployment identity.

## GitHub repository setup

Create secrets in Settings -> Secrets and variables -> Actions:

| Secret                | Value                                                       |
| --------------------- | ----------------------------------------------------------- |
| `GCP_PROJECT_ID`      | `slidesage-504414`                                          |
| `GCP_WIF_PROVIDER`    | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/slidesage/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `slidesage-deploy@slidesage-504414.iam.gserviceaccount.com` |
| `TF_STATE_BUCKET` | `slidesage-504414-tfstate`, after the versioned bucket exists |
| `CLOUDFLARE_ACCOUNT_ID` | `1f4b64abf5ce89626a42b88a12d71cdc` |
| `CLOUDFLARE_API_TOKEN` | Token with Zone Read, DNS Read/Edit, and Pages Read/Edit |

API invocation policy is defined by `google_cloud_run_v2_service_iam_member.api_public_invoker`. The old `API_AUTH_FLAG` variable is no longer used. Application authentication still protects private routes.

## Secret Manager

`DATABASE_URL`, `AUTH_SECRET`, `RATE_LIMIT_HASH_SECRET`, OAuth credentials, `EXA_API_KEY`, `OPEN_ROUTER_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `CDN_SIGNING_KEY_SECRET` are referenced by the pipeline and must exist as Secret Manager secrets (secret name + `:latest` version):

```bash
printf "postgresql://user:pass@.../slidesage" | \
  gcloud secrets create DATABASE_URL --data-file=- --project=$PROJECT_ID
printf "<32+ char random secret>" | \
  gcloud secrets create AUTH_SECRET --data-file=- --project=$PROJECT_ID
printf "<independent random secret>" | \
  gcloud secrets create RATE_LIMIT_HASH_SECRET --data-file=- --project=$PROJECT_ID
printf "<Google OAuth client ID>" | \
  gcloud secrets create GOOGLE_CLIENT_ID --data-file=- --project=$PROJECT_ID
printf "<Google OAuth client secret>" | \
  gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=- --project=$PROJECT_ID
printf "<GitHub OAuth client ID>" | \
  gcloud secrets create GITHUB_CLIENT_ID --data-file=- --project=$PROJECT_ID
printf "<GitHub OAuth client secret>" | \
  gcloud secrets create GITHUB_CLIENT_SECRET --data-file=- --project=$PROJECT_ID
printf "<Exa API key>" | \
  gcloud secrets create EXA_API_KEY --data-file=- --project=$PROJECT_ID
printf "<OpenRouter API key>" | \
  gcloud secrets create OPEN_ROUTER_API_KEY --data-file=- --project=$PROJECT_ID
printf "<Resend API key>" | \
  gcloud secrets create RESEND_API_KEY --data-file=- --project=$PROJECT_ID
printf "<verified SlideSage sender on slidesage.app>" | \
  gcloud secrets create RESEND_FROM_EMAIL --data-file=- --project=$PROJECT_ID
```

Billing additionally needs the three Razorpay secrets. `terraform plan` fails with a "secret not found" error until all three exist:

```bash
printf "<Razorpay key ID>" | \
  gcloud secrets create RAZORPAY_KEY_ID --data-file=- --project=$PROJECT_ID
printf "<Razorpay key secret>" | \
  gcloud secrets create RAZORPAY_KEY_SECRET --data-file=- --project=$PROJECT_ID
printf "<Razorpay webhook signing secret>" | \
  gcloud secrets create RAZORPAY_WEBHOOK_SECRET --data-file=- --project=$PROJECT_ID
```

Payments are not optional. Terraform lists these secrets unconditionally, and the API refuses to start if any value is absent. This prevents a deployment from booting with dead checkout or webhook endpoints.

Do not generate the Cloud CDN key independently from `CDN_SIGNING_KEY_SECRET`. Create one random 16-byte key, add its base64url value to the `templates` backend bucket under the configured `CDN_SIGNING_KEY_NAME`, then store that same value as a Secret Manager version. Google does not return the value after the CDN key is added. The current production key name is `templates-key-v2`.

The API deployment sets `BASE_URL=https://api.slidesage.app` and trusts `https://slidesage.app`, `https://www.slidesage.app`, and `https://slide-sage.pages.dev` for browser authentication callbacks. Configure the provider callback URLs as `https://api.slidesage.app/auth/callback/google` and `https://api.slidesage.app/auth/callback/github`.

`PRESENTATION_GCS_BUCKET`, `CDN_URL`, `CDN_SIGNING_KEY_NAME`, and `CDN_SIGNED_URL_TTL_SECONDS` reach the API and worker from `infra/prod/main.tf`. Change them there, not with `gcloud run deploy`: a direct deploy replaces the whole container specification and the next Terraform plan reverts it.

The Cloud SQL socket mount and the `roles/cloudsql.client` grant on the runtime service account are declared in `infra/prod`.

## Cloud Run service settings

| Service | Port | Instances     | Concurrency | Notes                       |
| ------- | ---- | ------------- | ----------- | --------------------------- |
| `api`   | 8000 | min 0, max 10 | 80          | Scales from zero on traffic |
| `worker` | 8080 | min 1, max 10 | 1           | Polls River and performs OpenRouter generation using `OPEN_ROUTER_API_KEY`. |
| `preview-worker` | 8080 | min 1, max 4 | 1 | Polls River and renders committed PPTX revisions with LibreOffice. |

Both queue services keep at least one instance running with CPU available between requests (`cpu_idle = false`). API-to-worker coordination uses PostgreSQL only; queued work cannot wake a Cloud Run service from zero instances. River uses row-level `SKIP LOCKED`, so concurrent workers can claim jobs safely. Monitor queue latency and size worker capacity explicitly; Cloud Run does not scale on PostgreSQL queue depth.

### Ingress and invocation

The deployment workflow pins each service's ingress instead of inheriting a mutable Cloud Run default:

| Resource            | Ingress                             | Invocation policy                                                                                                                                                                                                     |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`               | `internal-and-cloud-load-balancing` | Public at the Cloud Run IAM layer by default because browsers and external webhooks call it; application authentication protects private routes. Internet traffic must pass through the external HTTPS load balancer. |
| `worker`            | `internal`                          | Private. It polls PostgreSQL and has no Pub/Sub, Cloud Tasks, Eventarc, or API invoker, so it needs no `roles/run.invoker` binding.                                                                                   |
| `slidesage-migrate` | Not applicable                      | Cloud Run Job executed by the authenticated CI/CD identity. Jobs do not have service ingress settings.                                                                                                                |

The API ingress setting blocks direct internet requests to its `run.app` URL. It also makes the external load balancer the enforcement point for any attached Cloud Armor policy. Do not change the API to `ingress=all` while the load balancer is the documented production entry point.

After deployment, the workflow verifies both ingress values and fails if the worker has an `allUsers` invoker binding.

To bring existing services in line with the workflow without waiting for another deployment, run:

```bash
gcloud run services update api \
  --project=slidesage-504414 \
  --region=asia-south1 \
  --ingress=internal-and-cloud-load-balancing

gcloud run services update worker \
  --project=slidesage-504414 \
  --region=asia-south1 \
  --ingress=internal \
  --invoker-iam-check
```

The historical gcloud equivalent below is for manual recovery only. Normal releases update the job through Terraform and execute it with `gcloud run jobs execute`:

```bash
gcloud run jobs deploy slidesage-migrate \
  --project=slidesage-504414 \
  --image="$REGISTRY_LOCATION-docker.pkg.dev/$PROJECT_ID/$REGISTRY_REPOSITORY/migrate:$IMAGE_VERSION" \
  --region=asia-south1 \
	--service-account="slidesage-runtime@$PROJECT_ID.iam.gserviceaccount.com" \
	--set-cloudsql-instances="$PROJECT_ID:$RUN_REGION:slidesage-postgres" \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --execute-now \
  --wait
```

The CI identity needs both job update and execution permissions, alongside the Terraform permissions described above.

## Rollback

Every deploy is a Cloud Run revision pinned to an immutable SHA image, so rollback is instant:

```bash
gcloud run services update-traffic api \
  --region=asia-south1 \
  --to-revisions=api-20260810-1200=100

gcloud run services update-traffic worker \
  --region=asia-south1 \
  --to-revisions=worker-20260810-1200=100
```

or atomically in the console: Cloud Run -> service -> Revisions -> select revision -> Manage traffic.

## Manual equivalents

```bash
gcloud auth configure-docker asia-south1-docker.pkg.dev

docker build --target api --file apps/api/Dockerfile --tag asia-south1-docker.pkg.dev/slidesage-504414/slidesage/api:dev .
docker push asia-south1-docker.pkg.dev/slidesage-504414/slidesage/api:dev
```

## Troubleshooting

- `403` pushing to Artifact Registry: re-run `gcloud auth configure-docker asia-south1-docker.pkg.dev` and confirm the service account has `roles/artifactregistry.writer`.
- `Permission 'iam.serviceAccounts.actAs' denied` during deploy: re-apply the `roles/iam.serviceAccountUser` binding.
- WIF auth step fails: confirm `GCP_WIF_PROVIDER`/`GCP_SERVICE_ACCOUNT` match the pool that was created and that the binding uses the same `REPO_URL` casing as the repository.
- `error loading dynamically imported module` after a web deploy: confirm the failed `/assets/*.js` URL belongs to an older build, then check Cloudflare Cache Rules for a custom Browser TTL or Cache Everything rule and remove it. Pages should return `Cache-Control: no-cache` from `public/_headers`. Purge the zone cache once after removing the rule so cached SPA HTML is not served for missing asset URLs.

## Migration cutover

Every production release takes an on-demand Cloud SQL backup before running migrations. Terraform then sets the existing API and queue services to manual scaling with zero instances, preserving their previous images for this phase. This stops new submissions and queue processing while schema changes run. The API is temporarily unavailable during the cutover.

The full release apply restores automatic scaling with the new images. Generation and preview workers retain at least one instance so database queues continue processing. If migration or release apply fails, services remain paused; inspect the failure before retrying rather than restarting an old binary against a changed schema.

Migration 25 deletes presentations without a committed PPTX revision, as required by the canonical-only transition. The backup preserves the pre-release database for recovery; it does not make the deletion reversible through a schema downgrade.
