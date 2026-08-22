package auth

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

const (
	MaxAvatarUploadBytes       = 800 << 10
	avatarMultipartOverheadMax = 128 << 10
)

var avatarContentTypes = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/webp": {},
	"image/gif":  {},
}

func validateAvatarData(data []byte) (string, error) {
	if len(data) == 0 {
		return "", errors.New("choose an image file to upload")
	}
	if len(data) > MaxAvatarUploadBytes {
		return "", fmt.Errorf("image must be smaller than %d KB", MaxAvatarUploadBytes>>10)
	}
	contentType := strings.TrimSpace(http.DetectContentType(data))
	if _, accepted := avatarContentTypes[contentType]; !accepted {
		return "", errors.New("unsupported image format. Use PNG, JPEG, WebP, or GIF")
	}
	return contentType, nil
}

func (service *Service) UploadAvatar(ctx context.Context, userID string, data []byte) (User, error) {
	contentType, err := validateAvatarData(data)
	if err != nil {
		return User{}, err
	}
	imageID, err := randomID()
	if err != nil {
		return User{}, err
	}
	publicURL := fmt.Sprintf("%s/profile/avatar/image/%s", service.config.BaseURL, imageID)
	return service.repository.ReplaceAvatarImage(ctx, userID, imageID, publicURL, contentType, data)
}

func (service *Service) avatarUploadHandler(writer http.ResponseWriter, request *http.Request) {
	_, user, ok := service.requireJWT(writer, request)
	if !ok {
		return
	}

	request.Body = http.MaxBytesReader(
		writer,
		request.Body,
		MaxAvatarUploadBytes+avatarMultipartOverheadMax,
	)
	if err := request.ParseMultipartForm(MaxAvatarUploadBytes + avatarMultipartOverheadMax); err != nil {
		var maximum *http.MaxBytesError
		if errors.As(err, &maximum) {
			writeError(writer, http.StatusRequestEntityTooLarge, "Image must be smaller than 800 KB")
		} else {
			writeError(writer, http.StatusBadRequest, "Invalid image upload")
		}
		return
	}
	if request.MultipartForm != nil {
		defer request.MultipartForm.RemoveAll()
	}

	file, header, err := request.FormFile("file")
	if err != nil {
		writeError(writer, http.StatusBadRequest, "Choose an image file to upload")
		return
	}
	defer file.Close()
	if header.Size > MaxAvatarUploadBytes {
		writeError(writer, http.StatusRequestEntityTooLarge, "Image must be smaller than 800 KB")
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, MaxAvatarUploadBytes+1))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "Could not read the uploaded image")
		return
	}
	if len(data) > MaxAvatarUploadBytes {
		writeError(writer, http.StatusRequestEntityTooLarge, "Image must be smaller than 800 KB")
		return
	}

	updated, err := service.UploadAvatar(request.Context(), user.ID, data)
	if err != nil {
		writeServiceError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{
		"user": map[string]any{"id": updated.ID, "image": updated.Image},
	})
}

func (service *Service) avatarImageHandler(writer http.ResponseWriter, request *http.Request) {
	imageID := strings.TrimSpace(request.PathValue("id"))
	if imageID == "" || len(imageID) > 128 {
		writeError(writer, http.StatusNotFound, "Image not found")
		return
	}
	image, err := service.repository.AvatarImage(request.Context(), imageID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(writer, http.StatusNotFound, "Image not found")
			return
		}
		writeError(writer, http.StatusInternalServerError, "Unable to load image")
		return
	}

	writer.Header().Set("Content-Type", image.ContentType)
	writer.Header().Set("Content-Length", strconv.Itoa(len(image.Data)))
	writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	writer.Header().Set("Content-Disposition", "inline")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(image.Data)
}
