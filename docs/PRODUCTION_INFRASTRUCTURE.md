# Production infrastructure

`infra/prod` manages the production Google Cloud and Cloudflare resources. Google Cloud runs the API, the always-on generation worker, and the migration job. Cloudflare Pages builds the React application from `main`.

Terraform does not create secret values. It reads existing Secret Manager secrets and grants the Cloud Run runtime service account access to them.

## Cloud SQL connectivity

The API, worker, and migration job connect through the Cloud SQL Unix socket at `/cloudsql/<project>:<region>:<instance>`. `DATABASE_URL` must use that socket path and be stored in Secret Manager. Create the application database role and rotate its password outside Terraform so credentials never enter Terraform state.

## Resources

- Artifact Registry repository `slidesage` in `asia-south1`
- Cloud Run service `api`, public only through the external HTTPS load balancer
- Cloud Run service `worker`, private, one instance, with CPU kept allocated
- Cloud Run job `slidesage-migrate`, invoked by deployment automation after an image update
- A single-zone Enterprise `db-f1-micro` Cloud SQL PostgreSQL 18 instance with 10 GB SSD storage, no automated backups, and no point-in-time recovery
- Global external HTTPS load balancer and serverless NEG for `api`
- DNS-only Cloudflare `api` record pointing to the load balancer address
- Cloudflare Pages project `slidesage` and its apex and `www` domains

The API has `internal-and-cloud-load-balancing` ingress. Do not proxy the `api` record through Cloudflare. Google must see the load balancer request for that ingress policy to work and for the managed certificate to provision.

## Bootstrap

Create the required Secret Manager secrets before the first plan. The names are listed in `infra/prod/main.tf`. At minimum, production needs the values documented in [Environment variables](ENVIRONMENT_VARIABLES.md). Use a dedicated Terraform service account with permission to manage Cloud Run, Artifact Registry, Compute load balancing, service accounts, Secret Manager IAM bindings, and the enabled services.

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

Run the migration job before releasing API and worker revisions that depend on the new schema. The current GitHub Actions workflow uses `gcloud` for that sequence. Move it to the Terraform apply flow before making Terraform the only production deployment path. Do not run both paths against different container settings, or the next Terraform plan will show drift.
