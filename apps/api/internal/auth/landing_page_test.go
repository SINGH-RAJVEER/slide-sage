package auth

import "testing"

func TestIsValidLandingPageAcceptsOnlySupportedPages(t *testing.T) {
	supported := map[string]bool{
		"generate":      true,
		"presentations": true,
	}
	for _, landingPage := range LandingPages {
		if !supported[landingPage] {
			t.Fatalf("landing page %q must be one of the supported values", landingPage)
		}
		if !isValidLandingPage(landingPage) {
			t.Fatalf("landing page %q should be valid", landingPage)
		}
	}

	rejected := []string{"", "home", "/", "Generate", "presentations ", "\tgenerate\n"}
	for _, landingPage := range rejected {
		if isValidLandingPage(landingPage) {
			t.Fatalf("landing page %q should be rejected", landingPage)
		}
	}
}
