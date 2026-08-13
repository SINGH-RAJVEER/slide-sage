# CI/CD: Artifact Registry and Cloud Run

The repository deploys its Go API and generation worker to Google Cloud Run. Every push to `main` builds versioned container images, pushes them to Artifact Registry, runs database migrations, and rolls the "latest iteration" of both services onto Cloud Run as a new revision.

## Flow

1. GitHub Actions builds three image targets from `docker/Dockerfile.api` using Docker BuildKit:
   - `api` (web server, port 8000) -> Cloud Run **service** `api`
   - `worker` (River queue consumer with a health server, port 8080) -> Cloud Run **service** `worker`
   - `migrate` (Goose + River migrations, one-shot) -> Cloud Run **job** `slidesage-migrate`
2. Each image is tagged with the full git commit SHA (e.g. `api:a1b2c3d...`) plus `latest` and pushed to Artifact Registry.
3. The `migrate` job is deployed and executed against the database first.
4. `gcloud run deploy` points the `api` and `worker` Cloud Run services at the SHA-tagged image. Cloud Run creates a new revision and routes 100% of traffic to it, which is the "latest iteration" seen by users. Previous revisions remain available by SHA for rollback.

Trigger: `git push origin main` (or `workflow_dispatch` for a manual run). Concurrency is locked per branch so two pushes never race a deploy.

## Artifact Registry layout

Location is `asia-south1`, repository `slidesage`.

```text
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/api:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/api:latest
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/worker:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/worker:latest
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/migrate:<sha>
asia-south1-docker.pkg.dev/<PROJECT_ID>/slidesage/migrate:latest
```

Cloud Run runs in `asia-south1`. Change `RUN_REGION` and `REGISTRY_LOCATION` in `.github/workflows/deploy.yml` if you move regions.

The production API is served at `https://api.slidesage.app` through a global external HTTPS load balancer. Its reserved IPv4 address is `34.107.143.198`; the Cloudflare `api` record must be a DNS-only `A` record pointing to that address. Cloud Run custom domain mappings are unavailable in `asia-south1`, so the load balancer connects to the `api` service through the `slidesage-api-neg` serverless NEG.

Cloudflare Pages runs `bun run build` from `apps/web`. Vite bundles the React application into `apps/web/dist`, handles route-level code splitting, processes Tailwind through `@tailwindcss/vite`, and copies static files from `apps/web/public`.

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

## GitHub repository setup

Create secrets in Settings -> Secrets and variables -> Actions:

| Secret | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `slidesage-504414` |
| `GCP_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/slidesage/providers/github` |
| `GCP_SERVICE_ACCOUNT` | `slidesage-deploy@slidesage-504414.iam.gserviceaccount.com` |

Optional variable:

| Variable | Value | Purpose |
| --- | --- | --- |
| `API_AUTH_FLAG` | `--allow-unauthenticated` (default) or `--no-allow-unauthenticated` | Whether the API service accepts requests without a bearer token. Flip to `--no-allow-unauthenticated` once traffic goes through Cloudflare Access. |

## Secret Manager

`DATABASE_URL`, `AUTH_SECRET`, `RATE_LIMIT_HASH_SECRET`, OAuth credentials, `EXA_API_KEY`, and `OPEN_ROUTER_API_KEY` are referenced by the pipeline and must exist as Secret Manager secrets (secret name + `:latest` version):

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
```

The API deployment sets `BASE_URL=https://api.slidesage.app` and trusts `https://slidesage.app`, `https://www.slidesage.app`, and `https://slide-sage.pages.dev` for browser authentication callbacks. Configure the provider callback URLs as `https://api.slidesage.app/auth/callback/google` and `https://api.slidesage.app/auth/callback/github`.

The Go code reads every other value from its own env defaults; add more `--set-secrets`/`--set-env-vars` entries to the `deploy` job as you move the variables from [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) into production.

If the database is Cloud SQL, add `--add-cloudsql-instances=<INSTANCE_CONNECTION_NAME>` to the migrate, API, and worker deploy commands, and grant the runtime service account `roles/cloudsql.client`.

## Cloud Run service settings

| Service | Port | Instances | Concurrency | Notes |
| --- | --- | --- | --- | --- |
| `api` | 8000 | min 0, max 10 | 80 | Scales from zero on traffic |
| `worker` | 8080 | min 1, max 1 | 1 | Polls River and performs OpenRouter generation using `OPEN_ROUTER_API_KEY`; one always-warm instance is billed continuously. |

The worker is not request-driven, so a `min-instances=1` keeps a warm, always-on instance polling Postgres. River uses row-level `SKIP LOCKED` so scaling out further is safe if needed.

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

docker build --target api --file docker/Dockerfile.api --tag asia-south1-docker.pkg.dev/slidesage-504414/slidesage/api:dev .
docker push asia-south1-docker.pkg.dev/slidesage-504414/slidesage/api:dev
```

## Troubleshooting

- `403` pushing to Artifact Registry: re-run `gcloud auth configure-docker asia-south1-docker.pkg.dev` and confirm the service account has `roles/artifactregistry.writer`.
- `Permission 'iam.serviceAccounts.actAs' denied` during deploy: re-apply the `roles/iam.serviceAccountUser` binding.
- WIF auth step fails: confirm `GCP_WIF_PROVIDER`/`GCP_SERVICE_ACCOUNT` match the pool that was created and that the binding uses the same `REPO_URL` casing as the repository.

## Possible extensions

- Run `bun run lint` and `bun run test` in a `test` job that `build` depends on.
- Trigger on `v*` tags to additionally tag images with the semantic version.
- Publish the `apps/web` bundle and deploy the frontend to Cloud Run or Cloudflare Pages.
