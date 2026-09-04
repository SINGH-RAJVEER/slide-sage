// Package templatecatalog records which template packages have been published
// to immutable, digest-pinned CDN object keys.
//
// Publication is the only thing that makes a template usable: the CDN fetcher
// addresses packages by digest, so a template with no published digest cannot
// be retrieved and cannot compile a presentation. Entries are written by the
// publication command after it validates and uploads a package, which is why
// this file is the authority for generation readiness rather than the
// marketplace catalog in libs/types. That one describes what a template looks
// like for the browser; this one describes what actually exists in the bucket.
package templatecatalog

import (
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

//go:embed published.json
var publishedJSON []byte

var idPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// Entry identifies one published template package.
type Entry struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
	SHA256  string `json:"sha256"`
}

var entries = mustLoadEntries(publishedJSON)

func mustLoadEntries(raw []byte) []Entry {
	var loaded []Entry
	if err := json.Unmarshal(raw, &loaded); err != nil {
		panic(fmt.Sprintf("templatecatalog: published.json is not valid JSON: %v", err))
	}
	seen := make(map[string]struct{}, len(loaded))
	for _, entry := range loaded {
		if err := validateEntry(entry); err != nil {
			panic(fmt.Sprintf("templatecatalog: %v", err))
		}
		key := entryKey(entry.ID, entry.Version)
		if _, duplicate := seen[key]; duplicate {
			panic(fmt.Sprintf("templatecatalog: duplicate published entry %s", key))
		}
		seen[key] = struct{}{}
	}
	return loaded
}

func validateEntry(entry Entry) error {
	if !idPattern.MatchString(entry.ID) {
		return fmt.Errorf("invalid published template ID %q", entry.ID)
	}
	if entry.Version <= 0 {
		return fmt.Errorf("published template %s has a non-positive version", entry.ID)
	}
	if len(entry.SHA256) != 64 || entry.SHA256 != strings.ToLower(entry.SHA256) {
		return fmt.Errorf("published template %s has a malformed SHA-256", entry.ID)
	}
	if _, err := hex.DecodeString(entry.SHA256); err != nil {
		return fmt.Errorf("published template %s has a non-hexadecimal SHA-256", entry.ID)
	}
	return nil
}

func entryKey(id string, version int) string {
	return fmt.Sprintf("%s@%d", id, version)
}

// Lookup returns the published entry for a template ID and version.
func Lookup(id string, version int) (Entry, bool) {
	for _, entry := range entries {
		if entry.ID == id && entry.Version == version {
			return entry, true
		}
	}
	return Entry{}, false
}

// Published reports whether a template version has a package in the bucket.
func Published(id string, version int) bool {
	_, found := Lookup(id, version)
	return found
}

// Empty reports whether nothing has been published yet, which lets callers
// distinguish "you picked an unpublished template" from "no template exists".
func Empty() bool {
	return len(entries) == 0
}

// Swap replaces the published entries and returns a function that restores the
// previous set. It exists so tests can exercise generation against a published
// template without a real package in the bucket; production code never calls
// it. Entries are validated exactly as the embedded file is.
func Swap(replacement []Entry) func() {
	previous := entries
	for _, entry := range replacement {
		if err := validateEntry(entry); err != nil {
			panic(fmt.Sprintf("templatecatalog: %v", err))
		}
	}
	entries = replacement
	return func() { entries = previous }
}
