output "api_load_balancer_ip" {
  description = "Reserved API IPv4 address. Cloudflare publishes it as the DNS-only api record."
  value       = google_compute_global_address.api.address
}

output "cloudflare_pages_project" {
  description = "Cloudflare Pages project name."
  value       = cloudflare_pages_project.web.name
}

output "runtime_service_account" {
  description = "Cloud Run service account granted access to the referenced secrets."
  value       = google_service_account.runtime.email
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name mounted into Cloud Run at /cloudsql."
  value       = google_sql_database_instance.primary.connection_name
}

output "presentation_gcs_bucket" {
  description = "Private bucket for immutable canonical presentation revisions."
  value       = google_storage_bucket.presentation_revisions.name
}

output "template_gcs_bucket" {
  description = "Existing GCS bucket used by the Cloud CDN template origin."
  value       = data.google_storage_bucket.template_origin.name
}
