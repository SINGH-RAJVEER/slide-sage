resource "google_sql_database_instance" "primary" {
	name             = "slidesage-postgres"
	database_version = "POSTGRES_18"
	region           = var.gcp_region

	settings {
		edition           = "ENTERPRISE"
		tier              = "db-f1-micro"
		availability_type = "ZONAL"
		disk_size          = 10
		disk_autoresize    = false

		backup_configuration {
			enabled                        = false
			point_in_time_recovery_enabled = false
		}

		ip_configuration {
			ipv4_enabled = true
		}
	}

	deletion_protection = false

	depends_on = [google_project_service.required]
}

resource "google_sql_database" "application" {
	name     = "slidesage"
	instance = google_sql_database_instance.primary.name
}

resource "google_project_iam_member" "runtime_cloud_sql_client" {
	project = var.gcp_project_id
	role    = "roles/cloudsql.client"
	member  = "serviceAccount:${google_service_account.runtime.email}"
}
