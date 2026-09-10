# Adopt the existing deployment only after this bookmark reaches dev and the
# dev-to-main PR is merged. Import blocks are evaluated by plan; apply writes
# their results into state and may also change resource settings.
#
# The revision bucket, its runtime IAM, registry reader IAM, and preview worker
# are planned additions. Secret values and the GCS state bucket are provisioned
# separately before the first approved apply.

import {
  to = cloudflare_record.api
  id = "${data.cloudflare_zone.production.id}/${data.cloudflare_record.existing_api.id}"
}

import {
  to = cloudflare_pages_project.web
  id = "${var.cloudflare_account_id}/slidesage"
}

import {
  to = cloudflare_pages_domain.apex
  id = "${var.cloudflare_account_id}/slidesage/${var.domain_name}"
}


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
  id = "projects/${var.gcp_project_id}/locations/${var.gcp_region}/repositories/slidesage"
}

import {
  to = google_service_account.runtime
  id = "projects/${var.gcp_project_id}/serviceAccounts/slidesage-runtime@${var.gcp_project_id}.iam.gserviceaccount.com"
}

import {
  to = google_cloud_run_v2_service.api
  id = "projects/${var.gcp_project_id}/locations/${var.gcp_region}/services/api"
}

import {
  to = google_cloud_run_v2_service.worker
  id = "projects/${var.gcp_project_id}/locations/${var.gcp_region}/services/worker"
}

import {
  to = google_cloud_run_v2_service_iam_member.api_public_invoker
  id = "projects/${var.gcp_project_id}/locations/${var.gcp_region}/services/api roles/run.invoker allUsers"
}

import {
  to = google_cloud_run_v2_job.migrate
  id = "projects/${var.gcp_project_id}/locations/${var.gcp_region}/jobs/slidesage-migrate"
}

import {
  to = google_sql_database_instance.primary
  id = "projects/${var.gcp_project_id}/instances/slidesage-postgres"
}

import {
  to = google_sql_database.application
  id = "projects/${var.gcp_project_id}/instances/slidesage-postgres/databases/slidesage"
}

import {
  to = google_project_iam_member.runtime_cloud_sql_client
  id = "${var.gcp_project_id} roles/cloudsql.client serviceAccount:slidesage-runtime@${var.gcp_project_id}.iam.gserviceaccount.com"
}

import {
  to = google_storage_bucket_iam_member.cdn_template_viewer
  id = "b/${var.template_gcs_bucket} roles/storage.objectViewer serviceAccount:service-${data.google_project.current.number}@cloud-cdn-fill.iam.gserviceaccount.com"
}

import {
  to = google_compute_global_address.api
  id = "projects/${var.gcp_project_id}/global/addresses/slidesage-api-ip"
}

import {
  to = google_compute_region_network_endpoint_group.api
  id = "projects/${var.gcp_project_id}/regions/${var.gcp_region}/networkEndpointGroups/slidesage-api-neg"
}

import {
  to = google_compute_backend_service.api
  id = "projects/${var.gcp_project_id}/global/backendServices/slidesage-api-backend"
}

import {
  to = google_compute_backend_bucket.templates
  id = "projects/${var.gcp_project_id}/global/backendBuckets/templates"
}

import {
  to = google_compute_url_map.api
  id = "projects/${var.gcp_project_id}/global/urlMaps/slidesage-api-map"
}

import {
  to = google_compute_url_map.https_redirect
  id = "projects/${var.gcp_project_id}/global/urlMaps/slidesage-api-http-redirect"
}

import {
  to = google_compute_managed_ssl_certificate.api
  id = "projects/${var.gcp_project_id}/global/sslCertificates/slidesage-api-cert"
}

import {
  to = google_compute_target_https_proxy.api
  id = "projects/${var.gcp_project_id}/global/targetHttpsProxies/slidesage-api-https-proxy"
}

import {
  to = google_compute_target_http_proxy.https_redirect
  id = "projects/${var.gcp_project_id}/global/targetHttpProxies/slidesage-api-http-proxy"
}

import {
  to = google_compute_global_forwarding_rule.api_https
  id = "projects/${var.gcp_project_id}/global/forwardingRules/slidesage-api-https-rule"
}

import {
  to = google_compute_global_forwarding_rule.api_http
  id = "projects/${var.gcp_project_id}/global/forwardingRules/slidesage-api-http-rule"
}
