package templatecatalog

import "testing"

const (
	digestA = "3b1f4c5d6e7a8b9c0d1e2f30415263748596a7b8c9dae0f1023456789abcdef0"
	digestB = "0fedcba9876543210f1e0dac9b8a7965849372615f2e1d0c9b8a7e6d5c4f1b3a2"
)

func TestEmbeddedCatalogIsWellFormed(t *testing.T) {
	// The embedded file records what publication actually uploaded. Loading it
	// already panics on a malformed or duplicated entry, so reaching this point
	// means every digest is usable; the assertions below guard the invariants a
	// caller depends on.
	if Empty() {
		t.Fatal("embedded catalog is empty, so no template can be generated")
	}
	for _, entry := range entries {
		resolved, found := Lookup(entry.ID, entry.Version)
		if !found {
			t.Fatalf("published entry %s@%d does not resolve", entry.ID, entry.Version)
		}
		if resolved.SHA256 != entry.SHA256 {
			t.Fatalf("%s resolved to digest %q, want %q", entry.ID, resolved.SHA256, entry.SHA256)
		}
	}
}

func TestLookupMatchesIDAndVersion(t *testing.T) {
	defer Swap([]Entry{{ID: "simple-business-proposal", Version: 1, SHA256: digestA}})()

	entry, found := Lookup("simple-business-proposal", 1)
	if !found {
		t.Fatal("published template was not found")
	}
	if entry.SHA256 != digestA {
		t.Fatalf("digest = %q", entry.SHA256)
	}
	if _, found := Lookup("simple-business-proposal", 2); found {
		t.Fatal("a different version resolved to the published entry")
	}
	if _, found := Lookup("soft-skills-training", 1); found {
		t.Fatal("an unpublished template resolved")
	}
}

func TestSwapRestoresPreviousEntries(t *testing.T) {
	before := len(entries)
	restore := Swap([]Entry{{ID: "a-template", Version: 1, SHA256: digestA}})
	if len(entries) != 1 {
		t.Fatalf("swap did not take effect: %d entries", len(entries))
	}
	if _, found := Lookup("a-template", 1); !found {
		t.Fatal("swapped entry does not resolve")
	}
	restore()
	if len(entries) != before {
		t.Fatalf("swap restored %d entries, want %d", len(entries), before)
	}
}

func TestSwapRejectsMalformedEntries(t *testing.T) {
	for _, test := range []struct {
		name  string
		entry Entry
	}{
		{name: "empty digest", entry: Entry{ID: "a-template", Version: 1}},
		{name: "short digest", entry: Entry{ID: "a-template", Version: 1, SHA256: "abc"}},
		{name: "uppercase digest", entry: Entry{ID: "a-template", Version: 1, SHA256: "3B1F4C5D6E7A8B9C0D1E2F30415263748596A7B8C9DAE0F1023456789ABCDEF0"}},
		{name: "non-hex digest", entry: Entry{ID: "a-template", Version: 1, SHA256: "zz1f4c5d6e7a8b9c0d1e2f30415263748596a7b8c9dae0f1023456789abcdef0"}},
		{name: "bad ID", entry: Entry{ID: "Not An ID", Version: 1, SHA256: digestA}},
		{name: "zero version", entry: Entry{ID: "a-template", SHA256: digestA}},
	} {
		t.Run(test.name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("malformed entry was accepted")
				}
			}()
			Swap([]Entry{test.entry})
		})
	}
}

func TestLoadRejectsDuplicateEntries(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("duplicate published entries were accepted")
		}
	}()
	mustLoadEntries([]byte(`[
		{"id":"a-template","version":1,"sha256":"` + digestA + `"},
		{"id":"a-template","version":1,"sha256":"` + digestB + `"}
	]`))
}
