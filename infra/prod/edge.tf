data "cloudflare_zone" "production" {
  name = var.domain_name
}

resource "google_compute_global_address" "api" {
  name         = "slidesage-api-ip"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"

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
  name                            = "slidesage-api-backend"
  protocol                        = "HTTP"
  port_name                       = "http"
  load_balancing_scheme           = "EXTERNAL_MANAGED"
  timeout_sec                     = 30
  connection_draining_timeout_sec = 0

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

# Signed template delivery. The signing key named by var.cdn_signing_key_name is
# created out of band with `gcloud compute backend-buckets add-signed-url-key`
# because Cloud CDN never returns key material. Terraform does not manage keys
# on this resource, so an apply leaves the configured key in place.
resource "google_compute_backend_bucket" "templates" {
  name             = "templates"
  bucket_name      = data.google_storage_bucket.template_origin.name
  enable_cdn       = true
  compression_mode = "DISABLED"

  cdn_policy {
    cache_mode                   = "CACHE_ALL_STATIC"
    client_ttl                   = 604800
    default_ttl                  = 2592000
    max_ttl                      = 15811200
    negative_caching             = false
    request_coalescing           = true
    serve_while_stale            = 604800
    signed_url_cache_max_age_sec = 604800
  }
}

resource "google_compute_url_map" "api" {
  name            = "slidesage-api-map"
  default_service = google_compute_backend_service.api.id

  # Match the existing API-host route. Keep the live matcher name during adoption.
  host_rule {
    hosts        = ["api.${var.domain_name}"]
    path_matcher = "api-matcher"
  }

  path_matcher {
    name            = "api-matcher"
    default_service = google_compute_backend_service.api.id

    path_rule {
      paths   = ["/pptx-templates/*"]
      service = google_compute_backend_bucket.templates.id
    }
  }
}

resource "google_compute_url_map" "https_redirect" {
  name = "slidesage-api-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_managed_ssl_certificate" "api" {
  name = "slidesage-api-cert"

  managed {
    domains = ["api.${var.domain_name}"]
  }
}

resource "google_compute_target_https_proxy" "api" {
  name             = "slidesage-api-https-proxy"
  url_map          = google_compute_url_map.api.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api.id]
}

resource "google_compute_target_http_proxy" "https_redirect" {
  name    = "slidesage-api-http-proxy"
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "api_https" {
  name                  = "slidesage-api-https-rule"
  ip_address            = google_compute_global_address.api.id
  ip_protocol           = "TCP"
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_https_proxy.api.id
}

resource "google_compute_global_forwarding_rule" "api_http" {
  name                  = "slidesage-api-http-rule"
  ip_address            = google_compute_global_address.api.id
  ip_protocol           = "TCP"
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  target                = google_compute_target_http_proxy.https_redirect.id
}

# Discover the existing record for the import block rather than creating a
# duplicate. Planning requires DNS Read permission on this zone.
data "cloudflare_record" "existing_api" {
  zone_id  = data.cloudflare_zone.production.id
  hostname = "api.${var.domain_name}"
  type     = "A"
}

# Keep the API hostname pointed directly at the Google load balancer.
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
    build_command   = "bun install --frozen-lockfile && bun run build"
    build_caching   = true
    destination_dir = "dist"
    root_dir        = "apps/web"
  }

  deployment_configs {
    production {
      fail_open   = true
      usage_model = "standard"

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

# www has a DNS record, but is not attached to the live Pages project.
# Domain attachment is a separate future change, not part of adoption.
