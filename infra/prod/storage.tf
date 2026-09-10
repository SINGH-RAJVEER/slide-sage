locals {
  presentation_gcs_bucket = coalesce(var.presentation_gcs_bucket, "${var.gcp_project_id}-presentation-revisions")
}

resource "google_storage_bucket" "presentation_revisions" {
  project                     = var.gcp_project_id
  name                        = local.presentation_gcs_bucket
  location                    = var.gcp_region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  depends_on = [google_project_service.required]
}

data "google_storage_bucket" "template_origin" {
  name = var.template_gcs_bucket

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "runtime_revision_creator" {
  bucket = google_storage_bucket.presentation_revisions.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_revision_viewer" {
  bucket = google_storage_bucket.presentation_revisions.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "cdn_template_viewer" {
  bucket = data.google_storage_bucket.template_origin.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:service-${data.google_project.current.number}@cloud-cdn-fill.iam.gserviceaccount.com"
}
