// Command publish-templates turns curated PPTX files into immutable, digest-pinned template packages.

// It sanitizes each package, hashes the sanitized bytes, uploads it to pptx-templates/{id}/{version}/{sha256}/template.pptx, writes the manifest the compiler reads, and records the digest so the catalog can be backfilled.

//	go run ./cmd/publish-templates -source ../../templates/v1 -dry-run
//	go run ./cmd/publish-templates -source ../../templates/v1 -out /tmp/staged
//	go run ./cmd/publish-templates -source ../../templates/v1 -bucket slidesage-504414-templates
//	go run ./cmd/publish-templates -verify
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templateasset"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

type digestRecord struct {
	SHA256     string `json:"sha256"`
	ByteSize   int64  `json:"byteSize"`
	SlideCount int    `json:"slideCount"`
	ObjectPath string `json:"objectPath"`
}

// catalogEntry mirrors templatecatalog.Entry. The API embeds its own copy of the published set because go:embed cannot reach outside apps/api, so this command writes both files from one run and they cannot drift apart.
type catalogEntry struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
	SHA256  string `json:"sha256"`
}

func main() {
	source := flag.String("source", "templates/v1", "directory of curated .pptx files named {template-id}.pptx")
	manifestDir := flag.String("manifests", "apps/api/internal/templatemanifest/manifests", "directory to write compiler manifests into")
	digestFile := flag.String("digests", "libs/types/src/template-digests.json", "digest map the browser catalog reads")
	catalogFile := flag.String("published", "apps/api/internal/templatecatalog/published.json", "published set the API embeds to gate generation")
	bucket := flag.String("bucket", "", "GCS bucket for published packages; empty means prepare only")
	outDir := flag.String("out", "", "write published packages to this directory instead of a bucket, in the object layout the CDN serves")
	version := flag.Int("version", 1, "template version to publish")
	only := flag.String("only", "", "comma-separated template IDs; empty means every file in -source")
	skip := flag.String("skip", "quarantine-agriculture-business-plan", "comma-separated template IDs to leave unpublished")
	maxBytes := flag.Int64("max-bytes", templatepublish.DefaultMaxPackageBytes, "reject packages larger than this many bytes")
	dryRun := flag.Bool("dry-run", false, "prepare and report without uploading or writing files")
	verify := flag.Bool("verify", false, "check that every published template resolves in the bucket, and report nothing else")
	flag.Parse()

	if *verify {
		if failures := verifyPublished(*catalogFile, *digestFile, *manifestDir); failures > 0 {
			os.Exit(1)
		}
		return
	}

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

	if *bucket != "" && *outDir != "" {
		log.Fatal("choose either -bucket or -out, not both")
	}

	ctx := context.Background()
	var uploader templatepublish.Uploader
	if *outDir != "" && !*dryRun {
		uploader = directoryUploader{root: *outDir}
	}
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
		// A narrowed run only knows about the templates it was asked for, so it
		// updates those records and leaves the rest alone. A full run is
		// authoritative: a template that no longer publishes drops out.
		partial := len(selected) > 0
		if partial {
			existing, readErr := readDigests(*digestFile)
			if readErr != nil {
				log.Fatalf("read existing digests: %v", readErr)
			}
			for id, record := range digests {
				existing[id] = record
			}
			digests = existing
		}
		if err := writeDigests(*digestFile, digests); err != nil {
			log.Fatalf("write digests: %v", err)
		}
		if err := writeCatalog(*catalogFile, digests); err != nil {
			log.Fatalf("write published catalog: %v", err)
		}
		fmt.Printf("\nwrote %d manifests to %s\nwrote %d digests to %s\nwrote %d published entries to %s\n",
			len(ids)-failures, *manifestDir, len(digests), *digestFile, len(digests), *catalogFile)
	}
	fmt.Printf("\n%d succeeded, %d failed\n", len(digests), failures)
	if failures > 0 {
		os.Exit(1)
	}
}

// verifyPublished checks the three artifacts a usable template needs: the
// digest records the browser and the API each keep, the compiler manifest, and
// the object itself. The first two are local and free; the object is checked
// with a signed HEAD, because a package present in the catalog but absent from
// the bucket fails at generation time with nothing to point at.
func verifyPublished(catalogFile, digestFile, manifestDir string) int {
	published, err := readCatalog(catalogFile)
	if err != nil {
		log.Fatalf("read published catalog: %v", err)
	}
	digests, err := readDigests(digestFile)
	if err != nil {
		log.Fatalf("read digests: %v", err)
	}
	var fetcher *templateasset.CDNFetcher
	if templateasset.CDNConfigured() {
		fetcher, err = templateasset.NewCDNFetcherFromEnv()
		if err != nil {
			log.Fatalf("configure template CDN: %v", err)
		}
	} else {
		fmt.Println("CDN is not configured; checking local records only")
	}

	ctx := context.Background()
	failures := 0
	for _, entry := range published {
		problems := []string{}
		if record, found := digests[entry.ID]; !found {
			problems = append(problems, "no digest record")
		} else if record.SHA256 != entry.SHA256 {
			problems = append(problems, "digest record disagrees with the published catalog")
		}
		if _, err := os.Stat(filepath.Join(manifestDir, entry.ID+".json")); err != nil {
			problems = append(problems, "no compiler manifest")
		}
		if fetcher != nil {
			if err := fetcher.Exists(ctx, templateasset.Asset{ID: entry.ID, Version: entry.Version, SHA256: entry.SHA256}); err != nil {
				problems = append(problems, fmt.Sprintf("package unreachable: %v", err))
			}
			if err := fetcher.ThumbnailExists(ctx, entry.ID, entry.Version); err != nil {
				problems = append(problems, fmt.Sprintf("cover unreachable: %v", err))
			}
		}
		if len(problems) == 0 {
			fmt.Printf("ok    %-52s %s\n", entry.ID, entry.SHA256[:12])
			continue
		}
		failures++
		fmt.Printf("FAIL  %-52s %s\n", entry.ID, strings.Join(problems, "; "))
	}
	fmt.Printf("\n%d verified, %d failed\n", len(published)-failures, failures)
	return failures
}

func readCatalog(path string) ([]catalogEntry, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	published := []catalogEntry{}
	if err := json.Unmarshal(contents, &published); err != nil {
		return nil, err
	}
	return published, nil
}

// directoryUploader mirrors the bucket layout on local disk so a publication
// run can be staged, inspected, or uploaded by another tool. It refuses to
// overwrite, matching the create-only precondition the GCS store uses: an
// object path names a digest, so identical bytes are the only thing that could
// legitimately land there twice.
type directoryUploader struct{ root string }

func (u directoryUploader) PutImmutable(_ context.Context, key string, body io.Reader, _ int64, _, _ string) error {
	destination := filepath.Join(u.root, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if os.IsExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := io.Copy(file, body); err != nil {
		file.Close()
		return err
	}
	return file.Close()
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

func readDigests(path string) (map[string]digestRecord, error) {
	contents, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]digestRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	existing := map[string]digestRecord{}
	if err := json.Unmarshal(contents, &existing); err != nil {
		return nil, err
	}
	return existing, nil
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

// writeCatalog projects the digest map onto the set the API embeds. The version comes from the object path the digest was recorded against, so the two files can never disagree about which bytes a template resolves to.
func writeCatalog(path string, digests map[string]digestRecord) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	ids := make([]string, 0, len(digests))
	for id := range digests {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	published := make([]catalogEntry, 0, len(ids))
	for _, id := range ids {
		record := digests[id]
		version, err := versionFromObjectPath(record.ObjectPath, id, record.SHA256)
		if err != nil {
			return err
		}
		published = append(published, catalogEntry{ID: id, Version: version, SHA256: record.SHA256})
	}
	contents, err := json.MarshalIndent(published, "", "\t")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(contents, '\n'), 0o644)
}

func versionFromObjectPath(objectPath, id, digest string) (int, error) {
	segments := strings.Split(objectPath, "/")
	if len(segments) != 5 || segments[0] != "pptx-templates" || segments[1] != id || segments[3] != digest || segments[4] != "template.pptx" {
		return 0, fmt.Errorf("template %s has an object path the fetcher cannot address: %q", id, objectPath)
	}
	version, err := strconv.Atoi(segments[2])
	if err != nil || version <= 0 {
		return 0, fmt.Errorf("template %s has an invalid version in %q", id, objectPath)
	}
	return version, nil
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
