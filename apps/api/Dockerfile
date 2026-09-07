# build
from --platform=$BUILDPLATFORM docker.io/library/golang:1.26-alpine as build

workdir /src/apps/api

run apk add --no-cache ca-certificates

copy apps/api/go.mod apps/api/go.sum ./

run --mount=type=cache,target=/go/pkg/mod go mod download

copy apps/api ./

run --mount=type=cache,target=/go/pkg/mod \
	--mount=type=cache,target=/root/.cache/go-build \
	export CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} && \
	go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o /out/api ./cmd/api && \
	go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o /out/worker ./cmd/worker && \
	go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o /out/previewworker ./cmd/previewworker && \
	go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o /out/migrate ./cmd/migrate


from scratch as base

workdir /app

copy --from=build \
	/etc/ssl/certs/ca-certificates.crt \
	/etc/ssl/certs/ca-certificates.crt

user 65532:65532


# api
from base as api

copy --from=build /out/api /app/api

expose 8000

entrypoint ["/app/api"]


# worker
from base as worker

copy --from=build /out/worker /app/worker

entrypoint ["/app/worker"]

# preview
#
# The preview renderer is the one image that cannot be built from scratch: it
# shells out to headless LibreOffice, poppler, and cwebp.
from docker.io/library/alpine:3.22 as preview

# libreoffice-writer is not optional despite this image only rendering Impress
# decks. Alpine ships the shared configuration registry split across the app
# packages, and impress alone leaves out writer.xcd, which the UNO bootstrap
# needs; without it every soffice invocation aborts on a RuntimeException
# before it reads the deck.
run apk add --no-cache \
	ca-certificates \
	libreoffice-impress \
	libreoffice-writer \
	openjdk17-jre-headless \
	poppler-utils \
	libwebp-tools \
	font-noto \
	font-noto-cjk \
	ttf-dejavu \
	ttf-liberation && \
	fc-cache -f

workdir /app

copy --from=build /out/previewworker /app/previewworker

env HOME=/tmp

run adduser -D -u 65532 preview && chown -R preview:preview /app

user 65532:65532

entrypoint ["/app/previewworker"]


#migrate
from base as migrate

copy --from=build /out/migrate /app/migrate

entrypoint ["/app/migrate"]
