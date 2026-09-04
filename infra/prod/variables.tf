variable "gcp_project_id" {
  description = "Google Cloud project that hosts the production backend."
  type        = string
}

variable "gcp_region" {
  description = "Cloud Run and Artifact Registry region."
  type        = string
  default     = "asia-south1"
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Pages project."
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone and Pages edit permissions. Supply through TF_VAR_cloudflare_api_token."
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "A Cloudflare-managed apex domain for the production web application."
  type        = string
  default     = "slidesage.app"
}

variable "github_owner" {
  description = "GitHub organization or user that owns the repository connected to Cloudflare Pages."
  type        = string
  default     = "SINGH-RAJVEER"
}

variable "github_repository" {
  description = "GitHub repository name connected to Cloudflare Pages."
  type        = string
  default     = "slidesage"
}

variable "api_image" {
  description = "Artifact Registry image for the API. CI should pass an immutable digest or commit tag."
  type        = string
}

variable "worker_image" {
  description = "Artifact Registry image for the generation worker. CI should pass an immutable digest or commit tag."
  type        = string
}

variable "migrate_image" {
  description = "Artifact Registry image for the migration job. CI should pass an immutable digest or commit tag."
  type        = string
}

variable "open_router_model" {
  description = "Server-owned OpenRouter generation model."
  type        = string
  default     = "openrouter/free"
}

variable "template_gcs_bucket" {
  description = "Existing private GCS bucket used as the Cloud CDN template origin."
  type        = string
  default     = "slidesage-504414-templates"
}

variable "presentation_gcs_bucket" {
  description = "Private GCS bucket for immutable canonical presentation revisions. Defaults to <project-id>-presentation-revisions."
  type        = string
  default     = null
  nullable    = true
}

variable "cdn_url" {
  description = "Public HTTPS origin used when signing Cloud CDN template URLs."
  type        = string
  default     = "https://cdn.slidesage.app"
}

variable "cdn_signing_key_name" {
  description = "Active signing-key name configured on the template Cloud CDN backend bucket."
  type        = string
  default     = "templates-key-v2"
}

variable "cdn_signed_url_ttl_seconds" {
  description = "Lifetime of generated Cloud CDN template URLs."
  type        = number
  default     = 900

  validation {
    condition     = var.cdn_signed_url_ttl_seconds >= 60 && var.cdn_signed_url_ttl_seconds <= 3600
    error_message = "cdn_signed_url_ttl_seconds must be between 60 and 3600 seconds."
  }
}
