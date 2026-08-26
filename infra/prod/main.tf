locals {
  api_name     = "api"
  worker_name  = "worker"
  migrate_name = "slidesage-migrate"

  api_secret_names = toset([
    "DATABASE_URL",
    "AUTH_SECRET",
    "RATE_LIMIT_HASH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "EXA_API_KEY",
    "OPEN_ROUTER_API_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "BYOK_ENCRYPTION_KEY",
  ])

  worker_secret_names = toset([
    "DATABASE_URL",
    "EXA_API_KEY",
    "OPEN_ROUTER_API_KEY",
    "BYOK_ENCRYPTION_KEY",
  ])

  runtime_secret_names = setunion(local.api_secret_names, local.worker_secret_names)
}

data "google_project" "current" {
  project_id = var.gcp_project_id
}

resource "google_project_service" "required" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  project            = var.gcp_project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "containers" {
  project       = var.gcp_project_id
  location      = var.gcp_region
  repository_id = "slidesage"
  description   = "SlideSage production containers"
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "cloud_run_reader" {
  project    = var.gcp_project_id
  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${data.google_project.current.number}@serverless-robot-prod.iam.gserviceaccount.com"
}

resource "google_service_account" "runtime" {
  project      = var.gcp_project_id
  account_id   = "slidesage-runtime"
  display_name = "SlideSage Cloud Run runtime"
}

data "google_secret_manager_secret" "runtime" {
  for_each  = local.runtime_secret_names
  project   = var.gcp_project_id
  secret_id = each.value

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each  = data.google_secret_manager_secret.runtime
  project   = var.gcp_project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = local.api_name
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "300s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "BASE_URL"
        value = "https://api.${var.domain_name}"
      }
      env {
        name  = "CORS_ORIGINS"
        value = "https://${var.domain_name},https://www.${var.domain_name},https://slidesage.pages.dev"
      }
      env {
        name  = "BETTER_AUTH_TRUSTED_ORIGINS"
        value = "https://${var.domain_name},https://www.${var.domain_name},https://slidesage.pages.dev"
      }
      env {
        name  = "TRUST_PROXY_HEADERS"
        value = "true"
      }
      env {
        name  = "OPEN_ROUTER_MODEL"
        value = var.open_router_model
      }
      env {
        name  = "BYOK_ENCRYPTION_KEY_CURRENT_VERSION"
        value = "1"
      }

      dynamic "env" {
        for_each = local.api_secret_names
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.runtime[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8000
        }
        failure_threshold     = 10
        period_seconds        = 3
        timeout_seconds       = 1
        initial_delay_seconds = 0
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_accessor]
}

resource "google_cloud_run_v2_service" "worker" {
  name     = local.worker_name
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = var.worker_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = false
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "WORKER_CONCURRENCY"
        value = "2"
      }
      env {
        name  = "OPEN_ROUTER_MODEL"
        value = var.open_router_model
      }
      env {
        name  = "BYOK_ENCRYPTION_KEY_CURRENT_VERSION"
        value = "1"
      }

      dynamic "env" {
        for_each = local.worker_secret_names
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.runtime[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/ready"
          port = 8080
        }
        failure_threshold     = 10
        period_seconds        = 3
        timeout_seconds       = 1
        initial_delay_seconds = 0
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_accessor]
}

resource "google_cloud_run_v2_service_iam_member" "api_public_invoker" {
  project  = var.gcp_project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_job" "migrate" {
  name     = local.migrate_name
  location = var.gcp_region

  template {
    template {
      service_account = google_service_account.runtime.email
      timeout         = "600s"
      max_retries     = 0

      containers {
        image = var.migrate_image

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.runtime["DATABASE_URL"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_accessor]
}
