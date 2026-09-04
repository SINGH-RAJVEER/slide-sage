// Command publish-templates turns curated PPTX files into immutable,
// digest-pinned template packages.
//
// It sanitizes each package, hashes the sanitized bytes, uploads it to
// pptx-templates/{id}/{version}/{sha256}/template.pptx, writes the manifest the
// compiler reads, and records the digest so the catalog can be backfilled.
//
//	go run ./cmd/publish-templates -source ../../templates/v1 -dry-run
//	go run ./cmd/publish-templates -source ../../templates/v1 -bucket slidesage-504414-templates
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

type digestRecord struct {
	SHA256     string `json:"sha256"`
	ByteSize   int64  `json:"byteSize"`
	SlideCount int    `json:"slideCount"`
	ObjectPath string `json:"objectPath"`
}

func main() {
	source := flag.String("source", "templates/v1", "directory of curated .pptx files named {template-id}.pptx")
	manifestDir := flag.String("manifests", "apps/api/internal/templatemanifest/manifests", "directory to write compiler manifests into")
	digestFile := flag.String("digests", "libs/types/src/template-digests.json", "digest map the catalog reads")
	bucket := flag.String("bucket", "", "GCS bucket for published packages; empty means prepare only")
	version := flag.Int("version", 1, "template version to publish")
	only := flag.String("only", "", "comma-separated template IDs; empty means every file in -source")
	skip := flag.String("skip", "quarantine-agriculture-business-plan", "comma-separated template IDs to leave unpublished")
	maxBytes := flag.Int64("max-bytes", templatepublish.DefaultMaxPackageBytes, "reject packages larger than this many bytes")
	dryRun := flag.Bool("dry-run", false, "prepare and report without uploading or writing files")
	flag.Parse()

	entries, err := os.ReadDir(*source)
	if err != nil {
		log.Fatalf("read source directory: %v", err)
	}

	selected := commaSet(*only)
	skipped := commaSet(*skip)
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".pptx") {
			continue
		}
		id := strings.TrimSuffix(name, ".pptx")
		if skipped[id] || (len(selected) > 0 && !selected[id]) {
			continue
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) == 0 {
		log.Fatalf("no templates matched in %s", *source)
	}

	ctx := context.Background()
	var uploader templatepublish.Uploader
	if *bucket != "" && !*dryRun {
		store, storeErr := presentationrevision.NewGCSBlobStore(ctx, *bucket)
		if storeErr != nil {
			log.Fatalf("open bucket %s: %v", *bucket, storeErr)
		}
		defer store.Close()
		uploader = store
	}

	digests := map[string]digestRecord{}
	failures := 0
	for _, id := range ids {
		result, publishErr := publishOne(ctx, filepath.Join(*source, id+".pptx"), id, *version, *maxBytes, uploader)
		if publishErr != nil {
			failures++
			fmt.Printf("FAIL  %-52s %v\n", id, publishErr)
			continue
		}
		digests[id] = digestRecord{
			SHA256:     result.SHA256,
			ByteSize:   result.ByteSize,
			SlideCount: result.Manifest.SlideCount,
			ObjectPath: result.ObjectPath,
		}
		action := "prepared"
		if uploader != nil {
			action = "published"
		}
		fmt.Printf("%-9s %-52s %s  %2d archetypes  %d slides\n",
			action, id, result.SHA256[:12], len(result.Manifest.Archetypes), result.Manifest.SlideCount)

		if !*dryRun {
			if err := writeManifest(*manifestDir, id, result.Manifest); err != nil {
				log.Fatalf("write manifest for %s: %v", id, err)
			}
		}
	}

	if !*dryRun {
		if err := writeDigests(*digestFile, digests); err != nil {
			log.Fatalf("write digests: %v", err)
		}
		fmt.Printf("\nwrote %d manifests to %s\nwrote digests to %s\n", len(digests), *manifestDir, *digestFile)
	}
	fmt.Printf("\n%d succeeded, %d failed\n", len(digests), failures)
	if failures > 0 {
		os.Exit(1)
	}
}

func publishOne(ctx context.Context, path, id string, version int, maxBytes int64, uploader templatepublish.Uploader) (templatepublish.Result, error) {
	file, err := os.Open(path)
	if err != nil {
		return templatepublish.Result{}, err
	}
	defer file.Close()
	return templatepublish.Publish(ctx, templatepublish.Input{
		TemplateID: id,
		Version:    version,
		Source:     file,
		MaxBytes:   maxBytes,
	}, uploader)
}

func writeManifest(dir, id string, manifest templatepublish.Manifest) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(manifest, "", "\t")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, id+".json"), append(contents, '\n'), 0o644)
}

func writeDigests(path string, digests map[string]digestRecord) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(digests, "", "\t")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(contents, '\n'), 0o644)
}

func commaSet(value string) map[string]bool {
	set := map[string]bool{}
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			set[trimmed] = true
		}
	}
	return set
}
