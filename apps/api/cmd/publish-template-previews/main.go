// Command publish-template-previews renders the published CDN packages with
// the same renderer as generated decks. It never changes the template catalog.
//
// publish-templates renders previews as part of publication, so this command is
// for backfilling a template that was published before previews existed, or for
// re-rendering after a renderer change.
//
//	go run ./cmd/publish-template-previews -bucket slidesage-504414-templates
//	go run ./cmd/publish-template-previews -id brat -out /tmp/staged
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templateasset"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatecatalog"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatemanifest"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepreview"
)

func main() {
	id := flag.String("id", "", "template ID; empty renders every published template")
	out := flag.String("out", "", "local staging directory")
	bucket := flag.String("bucket", "", "upload previews to this template bucket")
	flag.Parse()
	if (*out == "") == (*bucket == "") {
		log.Fatal("specify exactly one of -out or -bucket")
	}
	ctx := context.Background()
	fetcher, err := templateasset.NewCDNFetcherFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	var store templatepreview.Uploader = directoryStore(*out)
	if *bucket != "" {
		gcs, err := presentationrevision.NewGCSBlobStore(ctx, *bucket)
		if err != nil {
			log.Fatal(bucketError(*bucket, err))
		}
		defer gcs.Close()
		store = gcs
	}
	renderer := slidepreview.NewLibreOfficeRenderer(slidepreview.LibreOfficeConfig{})
	matched := false
	for _, entry := range templatecatalog.Entries() {
		if *id != "" && entry.ID != *id {
			continue
		}
		matched = true
		asset := templateasset.Asset{ID: entry.ID, Version: entry.Version, SHA256: entry.SHA256}
		body, err := fetcher.Fetch(ctx, asset)
		if err != nil {
			log.Fatalf("fetch %s: %v", entry.ID, err)
		}
		manifest, err := templatemanifest.Lookup(entry.ID, entry.Version)
		if err != nil {
			log.Fatal(err)
		}
		if err := templatepreview.Publish(ctx, store, renderer, asset, body, manifest.SlideCount); err != nil {
			log.Fatalf("render %s: %v", entry.ID, err)
		}
		fmt.Printf("Published %s: %d slides\n", entry.ID, manifest.SlideCount)
	}
	if !matched {
		log.Fatal("no matching published template")
	}
}

// bucketError explains the credentials a bucket upload needs. A workstation
// that can reach the bucket through gcloud still has no application default
// credentials until they are created separately, and the underlying error says
// nothing about the staging path that works without them.
func bucketError(bucket string, err error) string {
	return fmt.Sprintf(`open bucket %s: %v

Uploading needs application default credentials:
  gcloud auth application-default login

Without them, stage the files and upload them with gcloud:
  go run ./cmd/publish-template-previews -out /tmp/staged
  gcloud storage cp -r -n /tmp/staged/pptx-templates gs://%s/`, bucket, err, bucket)
}

type directoryStore string

func (d directoryStore) PutImmutable(_ context.Context, key string, body io.Reader, _ int64, _ string, _ string) error {
	contents, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	file := filepath.Join(string(d), filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		return err
	}
	old, err := os.ReadFile(file)
	if err == nil {
		if !bytes.Equal(old, contents) {
			return fmt.Errorf("existing object differs: %s", key)
		}
		return nil
	}
	if !os.IsNotExist(err) {
		return err
	}
	return os.WriteFile(file, contents, 0644)
}
