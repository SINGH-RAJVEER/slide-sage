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

#migrate
from base as migrate

copy --from=build /out/migrate /app/migrate

entrypoint ["/app/migrate"]
