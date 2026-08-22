package auth

import (
	"strings"
	"testing"
)

func TestValidateAvatarDataAcceptsSupportedImages(t *testing.T) {
	tests := []struct {
		name        string
		data        []byte
		contentType string
	}{
		{name: "PNG", data: []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}, contentType: "image/png"},
		{name: "JPEG", data: []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01}, contentType: "image/jpeg"},
		{name: "GIF", data: []byte("GIF89a\x01\x00\x01\x00"), contentType: "image/gif"},
		{name: "WebP", data: []byte("RIFF\x00\x00\x00\x00WEBPVP"), contentType: "image/webp"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			contentType, err := validateAvatarData(test.data)
			if err != nil {
				t.Fatalf("validate avatar: %v", err)
			}
			if contentType != test.contentType {
				t.Fatalf("content type: got %q, want %q", contentType, test.contentType)
			}
		})
	}
}

func TestValidateAvatarDataRejectsInvalidUploads(t *testing.T) {
	if _, err := validateAvatarData(nil); err == nil || !strings.Contains(err.Error(), "choose an image") {
		t.Fatalf("empty upload error: %v", err)
	}
	if _, err := validateAvatarData([]byte("<svg xmlns='http://www.w3.org/2000/svg'></svg>")); err == nil || !strings.Contains(err.Error(), "unsupported image format") {
		t.Fatalf("unsupported format error: %v", err)
	}
	if _, err := validateAvatarData(make([]byte, MaxAvatarUploadBytes+1)); err == nil || !strings.Contains(err.Error(), "smaller than 800 KB") {
		t.Fatalf("oversized upload error: %v", err)
	}
}
