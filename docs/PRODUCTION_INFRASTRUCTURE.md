# Production infrastructure

`infra/prod` manages the production Google Cloud and Cloudflare resources. Google Cloud runs the API, the generation worker, and the migration job. Cloudflare Pages builds the React application from `main`.

Terraform does not create secret values. It reads existing Secret Manager secrets and grants the Cloud Run runtime service account access to them.

## Cloud SQL connectivity

The API, worker, and migration job connect through the Cloud SQL Unix socket at `/cloudsql/<project>:<region>:<instance>`. `DATABASE_URL` must use that socket path and be stored in Secret Manager. Create the application database role and rotate its password outside Terraform so credentials never enter Terraform state.

## Resources

- Artifact Registry repository `slidesage` in `asia-south1`
- Cloud Run service `api`, public only through the external HTTPS load balancer
- Cloud Run service `worker`, private, scaling from zero to ten instances, with CPU kept allocated while an instance is running
- Cloud Run job `slidesage-migrate`, invoked by deployment automation after an image update
- A single-zone Enterprise `db-f1-micro` Cloud SQL PostgreSQL 18 instance with 10 GB SSD storage, no automated backups, and no point-in-time recovery
- Global external HTTPS load balancer and serverless NEG for `api`, with an HTTP listener that redirects to HTTPS
- Cloud CDN backend bucket `templates`, routed from the `/pptx-templates/*` path rule on the `api` host and served from the private template-origin bucket
- Managed certificate for `api`, attached to the HTTPS proxy
- DNS-only Cloudflare `api` record pointing to the load balancer address
- Cloudflare Pages project `slidesage` and its apex and `www` domains
- Private GCS bucket for immutable canonical presentation revisions
- Existing private template-origin bucket, read by the Cloud CDN cache-fill service account and routed under `https://api.slidesage.app/pptx-templates/`

Terraform creates the revision bucket and grants the Cloud Run runtime account bucket-scoped object creator and viewer access. It references the existing template-origin bucket and grants its Google-managed Cloud CDN cache-fill account object viewer access. Override `presentation_gcs_bucket` or `template_gcs_bucket` when the bucket names differ from their defaults.

Cloud CDN signing key material is deliberately outside Terraform because putting the shared key value in a resource would store it in Terraform state. Rotate keys with Google Cloud tooling, retain the base64url value in Secret Manager as `CDN_SIGNING_KEY_SECRET`, and set `cdn_signing_key_name` to the active key name. The API and worker receive the secret from Secret Manager. Never add the value to `terraform.tfvars` or a client build variable.

The API has `internal-and-cloud-load-balancing` ingress. Do not proxy the `api` record through Cloudflare. Google must see the load balancer request for that ingress policy to work and for the managed certificate to provision.

## Bootstrap

Create the required Secret Manager secrets before the first plan. The names are listed in `infra/prod/main.tf`, and `data.google_secret_manager_secret` fails the plan for any name that does not exist. Payments are not optional, so the `RAZORPAY_*` secrets are listed alongside the rest. At minimum, production needs the values documented in [Environment variables](ENVIRONMENT_VARIABLES.md). Use a dedicated Terraform service account with permission to manage Cloud Run, Artifact Registry, Compute load balancing, service accounts, Secret Manager IAM bindings, and the enabled services.

The Cloudflare token needs edit access to the zone and Pages project. Before the Pages resource can connect the repository, authorize the Cloudflare Pages GitHub app for `SINGH-RAJVEER/slidesage` in the Cloudflare account.

Create a GCS bucket for Terraform state outside this configuration. The configuration deliberately does not create its own state bucket.

```bash
cd infra/prod
cp terraform.tfvars.example terraform.tfvars
export TF_VAR_cloudflare_api_token="..."
terraform init \
	-backend-config="bucket=slidesage-terraform-state" \
	-backend-config="prefix=production"
terraform plan
terraform apply
```

Keep `terraform.tfvars` out of version control if it includes values that do not belong in the example file.

## Deploying containers

Terraform expects immutable values for `api_image`, `worker_image`, and `migrate_image`. Pass the commit-tagged Artifact Registry images after CI has pushed them. Update the job, run it, then update the services.

```bash
terraform apply \
	-target=google_cloud_run_v2_job.migrate \
	-var="api_image=asia-south1-docker.pkg.dev/slidesage-504414/slidesage/api:$GITHUB_SHA" \
	-var="worker_image=asia-south1-docker.pkg.dev/slidesage-504414/slidesage/worker:$GITHUB_SHA" \
	-var="migrate_image=asia-south1-docker.pkg.dev/slidesage-504414/slidesage/migrate:$GITHUB_SHA"

gcloud run jobs execute slidesage-migrate \
	--project=slidesage-504414 \
	--region=asia-south1 \
	--wait

terraform apply \
	-var="api_image=asia-south1-docker.pkg.dev/slidesage-504414/slidesage/api:$GITHUB_SHA" \
	-var="worker_image=asia-south1-docker.pkg.dev/slidesage-504414/slidesage/worker:$GITHUB_SHA" \
	-var="migrate_image=asia-south1-docker.pkg.dev/slidesage-504414/slidesage/migrate:$GITHUB_SHA"
```

Run the migration job before releasing API and worker revisions that depend on the new schema.

The live deployment path is `.github/workflows/deploy.yml`, which uses `gcloud run deploy` directly. Terraform in `infra/prod` is not yet adopted against this project: no state bucket exists and no resources have been imported, so it must not be applied. Production infrastructure is currently changed by hand. Reconcile the two before making Terraform authoritative.

## Adopting an existing environment

This project's resources were originally created with the `gcloud` CLI, so the resource names in `edge.tf` follow that environment rather than a fresh Terraform naming scheme: the address is `slidesage-api-ip`, the backend service is `slidesage-api-backend`, the URL map is `slidesage-api-map`, the certificate is `slidesage-api-cert`, and the forwarding rules are `slidesage-api-http-rule` and `slidesage-api-https-rule`. Renaming any of these means replacing the resource, so leave them alone.

`infra/prod/imports.tf` adopts those resources into state. Run `terraform plan` and confirm the summary reports imports, additions, and in-place changes only. A plan that proposes a replacement or a destroy means a name or an argument no longer matches the live resource; fix the configuration rather than applying. Delete `imports.tf` once the apply succeeds.

Cloudflare import IDs are account-scoped and are listed as comments in that file. Add them once you have the zone, record, and account IDs.
