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
