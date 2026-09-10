// Package templatemanifest serves the manifests the publication command emits.
//
// Manifests are embedded rather than read from disk so the API and worker carry
// the same manifest the image was built with. A manifest describes bytes that
// are already immutable in the bucket, so pairing it with the binary keeps the
// two from drifting at runtime.
package templatemanifest

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
	"sync"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatepublish"
)

//go:embed manifests/*.json
var files embed.FS

var (
	once   sync.Once
	loaded map[string]templatepublish.Manifest
	loadTB error
)

// ErrNotFound reports a template with no embedded manifest, which means it was
// never published at this version.
var ErrNotFound = fmt.Errorf("no manifest for template")

func load() (map[string]templatepublish.Manifest, error) {
	once.Do(func() {
		entries, err := fs.ReadDir(files, "manifests")
		if err != nil {
			loadTB = fmt.Errorf("read embedded manifests: %w", err)
			return
		}
		parsed := make(map[string]templatepublish.Manifest, len(entries))
		for _, entry := range entries {
			name := entry.Name()
			if entry.IsDir() || !strings.HasSuffix(name, ".json") {
				continue
			}
			contents, err := files.ReadFile(path.Join("manifests", name))
			if err != nil {
				loadTB = fmt.Errorf("read manifest %s: %w", name, err)
				return
			}
			var manifest templatepublish.Manifest
			if err := json.Unmarshal(contents, &manifest); err != nil {
				loadTB = fmt.Errorf("parse manifest %s: %w", name, err)
				return
			}
			id := strings.TrimSuffix(name, ".json")
			// The file name is how a manifest is addressed, so a manifest whose
			// body disagrees with it would be unreachable under its own ID.
			if manifest.TemplateID != id {
				loadTB = fmt.Errorf("manifest %s declares template ID %q", name, manifest.TemplateID)
				return
			}
			if manifest.ManifestVersion != templatepublish.ManifestVersion {
				loadTB = fmt.Errorf("manifest %s has version %d, want %d", name, manifest.ManifestVersion, templatepublish.ManifestVersion)
				return
			}
			parsed[id] = manifest
		}
		loaded = parsed
	})
	return loaded, loadTB
}

// Lookup returns the manifest for a template version.
func Lookup(id string, version int) (templatepublish.Manifest, error) {
	manifests, err := load()
	if err != nil {
		return templatepublish.Manifest{}, err
	}
	manifest, found := manifests[id]
	if !found {
		return templatepublish.Manifest{}, fmt.Errorf("%w: %s", ErrNotFound, id)
	}
	if manifest.TemplateVersion != version {
		return templatepublish.Manifest{}, fmt.Errorf("%w: %s at version %d", ErrNotFound, id, version)
	}
	return manifest, nil
}

// IDs lists the templates with an embedded manifest, in sorted order.
func IDs() ([]string, error) {
	manifests, err := load()
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(manifests))
	for id := range manifests {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids, nil
}
