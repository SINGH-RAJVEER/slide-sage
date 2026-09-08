package generation

import (
	"errors"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatecatalog"
)

func resolveGenerationTemplate(reference *presentation.TemplateReference) (presentation.TemplateReference, error) {
	if reference == nil {
		return presentation.TemplateReference{}, errors.New("A PowerPoint template is required for generation")
	}
	entry, found := templatecatalog.Lookup(reference.ID, reference.Version)
	if !found {
		if templatecatalog.Empty() {
			return presentation.TemplateReference{}, errors.New("No PowerPoint template has been published yet")
		}
		return presentation.TemplateReference{}, errors.New("The selected PowerPoint template is not ready for generation")
	}
	return presentation.TemplateReference{ID: entry.ID, Version: entry.Version, SHA256: entry.SHA256}, nil
}
