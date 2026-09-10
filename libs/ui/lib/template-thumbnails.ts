import { API_URL } from "./api";

/**
 * URL of a template's cover thumbnail.
 *
 * Thumbnails live beside their package under the signed CDN prefix, so the
 * browser cannot address them directly: an unsigned request is refused. The API
 * signs and serves them, which also keeps the marketplace from downloading a
 * whole package just to show a cover.
 */
export function templateThumbnailUrl(thumbnailPath: string): string {
	return `${API_URL}/template-thumbnails/${encodeURIComponent(thumbnailPath)}`;
}
