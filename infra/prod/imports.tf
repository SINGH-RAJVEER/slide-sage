# One-time adoption of the resources created with the gcloud CLI before Terraform
# owned this environment. Run `terraform plan`, confirm every target is imported
# and nothing is scheduled for replacement or destruction, then `terraform apply`
# and delete this file. Terraform skips import blocks whose target is already in
# state, so leaving it in place is harmless but noisy.
#
# Cloudflare resources are not listed because their IDs are account-scoped. Add
# these once you have the zone, record, and account IDs:
#
#   cloudflare_record.api        -> "<zone_id>/<record_id>"
#   cloudflare_record.cdn        -> "<zone_id>/<record_id>"
#   cloudflare_pages_project.web -> "<account_id>/slidesage"
#   cloudflare_pages_domain.apex -> "<account_id>/slidesage/slidesage.app"
#   cloudflare_pages_domain.www  -> "<account_id>/slidesage/www.slidesage.app"
#
# These are absent from the project and are created by the first apply rather
# than imported:
#
#   google_storage_bucket.presentation_revisions
#   google_storage_bucket_iam_member.runtime_revision_creator
#   google_storage_bucket_iam_member.runtime_revision_viewer
#   google_artifact_registry_repository_iam_member.cloud_run_reader

import {
  for_each = local.required_services
  to       = google_project_service.required[each.value]
  id       = "${var.gcp_project_id}/${each.value}"
}

# Only the secrets that already exist in the project. The RAZORPAY_* bindings
# are created by the first apply, once those secrets have been added.
import {
  for_each = toset([
    "AUTH_SECRET",
    "CDN_SIGNING_KEY_SECRET",
    "DATABASE_URL",
    "EXA_API_KEY",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "OPEN_ROUTER_API_KEY",
    "RATE_LIMIT_HASH_SECRET",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
  ])
  to = google_secret_manager_secret_iam_member.runtime_accessor[each.value]
  id = "projects/${var.gcp_project_id}/secrets/${each.value} roles/secretmanager.secretAccessor serviceAccount:slidesage-runtime@${var.gcp_project_id}.iam.gserviceaccount.com"
}

import {
  to = google_artifact_registry_repository.containers
  id = "projects/slidesage-504414/locations/asia-south1/repositories/slidesage"
}

import {
  to = google_service_account.runtime
  id = "projects/slidesage-504414/serviceAccounts/slidesage-runtime@slidesage-504414.iam.gserviceaccount.com"
}

import {
  to = google_cloud_run_v2_service.api
  id = "projects/slidesage-504414/locations/asia-south1/services/api"
}

import {
  to = google_cloud_run_v2_service.worker
  id = "projects/slidesage-504414/locations/asia-south1/services/worker"
}

import {
  to = google_cloud_run_v2_service_iam_member.api_public_invoker
  id = "projects/slidesage-504414/locations/asia-south1/services/api roles/run.invoker allUsers"
}

import {
  to = google_cloud_run_v2_job.migrate
  id = "projects/slidesage-504414/locations/asia-south1/jobs/slidesage-migrate"
}

import {
  to = google_sql_database_instance.primary
  id = "projects/slidesage-504414/instances/slidesage-postgres"
}

import {
  to = google_sql_database.application
  id = "projects/slidesage-504414/instances/slidesage-postgres/databases/slidesage"
}

import {
  to = google_project_iam_member.runtime_cloud_sql_client
  id = "slidesage-504414 roles/cloudsql.client serviceAccount:slidesage-runtime@slidesage-504414.iam.gserviceaccount.com"
}

import {
  to = google_storage_bucket_iam_member.cdn_template_viewer
  id = "b/slidesage-504414-templates roles/storage.objectViewer serviceAccount:service-94621805506@cloud-cdn-fill.iam.gserviceaccount.com"
}

import {
  to = google_compute_global_address.api
  id = "projects/slidesage-504414/global/addresses/slidesage-api-ip"
}

import {
  to = google_compute_region_network_endpoint_group.api
  id = "projects/slidesage-504414/regions/asia-south1/networkEndpointGroups/slidesage-api-neg"
}

import {
  to = google_compute_backend_service.api
  id = "projects/slidesage-504414/global/backendServices/slidesage-api-backend"
}

import {
  to = google_compute_backend_bucket.templates
  id = "projects/slidesage-504414/global/backendBuckets/templates"
}

import {
  to = google_compute_url_map.api
  id = "projects/slidesage-504414/global/urlMaps/slidesage-api-map"
}

import {
  to = google_compute_url_map.https_redirect
  id = "projects/slidesage-504414/global/urlMaps/slidesage-api-http-redirect"
}

import {
  to = google_compute_managed_ssl_certificate.api
  id = "projects/slidesage-504414/global/sslCertificates/slidesage-api-cert"
}

import {
  to = google_compute_managed_ssl_certificate.cdn
  id = "projects/slidesage-504414/global/sslCertificates/slidesage-cdn-cert"
}

import {
  to = google_compute_target_https_proxy.api
  id = "projects/slidesage-504414/global/targetHttpsProxies/slidesage-api-https-proxy"
}

import {
  to = google_compute_target_http_proxy.https_redirect
  id = "projects/slidesage-504414/global/targetHttpProxies/slidesage-api-http-proxy"
}

import {
  to = google_compute_global_forwarding_rule.api_https
  id = "projects/slidesage-504414/global/forwardingRules/slidesage-api-https-rule"
}

import {
  to = google_compute_global_forwarding_rule.api_http
  id = "projects/slidesage-504414/global/forwardingRules/slidesage-api-http-rule"
}
