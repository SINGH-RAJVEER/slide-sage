data "cloudflare_zone" "production" {
  name = var.domain_name
}

resource "google_compute_global_address" "api" {
  name = "slidesage-api"

  depends_on = [google_project_service.required]
}

resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "slidesage-api-neg"
  region                = var.gcp_region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_backend_service" "api" {
  name                  = "slidesage-api"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

resource "google_compute_url_map" "api" {
  name            = "slidesage-api"
  default_service = google_compute_backend_service.api.id
}

resource "google_compute_managed_ssl_certificate" "api" {
  name = "slidesage-api"

  managed {
    domains = ["api.${var.domain_name}"]
  }
}

resource "google_compute_target_https_proxy" "api" {
  name             = "slidesage-api"
  url_map          = google_compute_url_map.api.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api.id]
}

resource "google_compute_global_forwarding_rule" "api_https" {
  name                  = "slidesage-api-https"
  ip_address            = google_compute_global_address.api.id
  ip_protocol           = "TCP"
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.api.id
}

resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.production.id
  name    = "api"
  content = google_compute_global_address.api.address
  type    = "A"
  ttl     = 1
  proxied = false
}

resource "cloudflare_pages_project" "web" {
  account_id        = var.cloudflare_account_id
  name              = "slidesage"
  production_branch = "main"

  build_config {
    build_command   = "bun run build"
    destination_dir = "dist"
    root_dir        = "apps/web"
  }

  deployment_configs {
    production {
      environment_variables = {
        VITE_API_URL = "https://api.${var.domain_name}"
      }
    }
  }

  source {
    type = "github"
    config {
      owner                   = var.github_owner
      repo_name               = var.github_repository
      production_branch       = "main"
      pr_comments_enabled     = true
      deployments_enabled     = true
      preview_branch_includes = ["*"]
      preview_branch_excludes = []
    }
  }
}

resource "cloudflare_pages_domain" "apex" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.web.name
  domain       = var.domain_name
}

resource "cloudflare_pages_domain" "www" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.web.name
  domain       = "www.${var.domain_name}"
}
