terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {}
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
