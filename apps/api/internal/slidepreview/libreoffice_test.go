package slidepreview

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLibreOfficeRendererProducesOneImagePerPage(t *testing.T) {
	runner := &fakeRunner{pages: 12}
	renderer := NewLibreOfficeRenderer(LibreOfficeConfig{Runner: runner, TempDir: t.TempDir()})

	images, err := renderer.Render(context.Background(), []byte("deck"), Limits{Width: 1280})
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	if len(images) != 12 {
		t.Fatalf("rendered %d images, want 12", len(images))
	}
	// pdftoppm zero-pads page numbers, so this asserts numeric rather than
	// lexical ordering across the nine-to-ten boundary.
	for index, image := range images {
		want := fmt.Sprintf("webp page %d", index+1)
		if string(image) != want {
			t.Fatalf("image %d = %q, want %q", index, image, want)
		}
	}
}

func TestLibreOfficeRendererPassesRequestedWidth(t *testing.T) {
	runner := &fakeRunner{pages: 1}
	renderer := NewLibreOfficeRenderer(LibreOfficeConfig{Runner: runner, TempDir: t.TempDir()})

	if _, err := renderer.Render(context.Background(), []byte("deck"), Limits{Width: 1280}); err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	rasterize := runner.commandFor(t, defaultPDFToPPMPath)
	if !containsPair(rasterize, "-scale-to", "1280") {
		t.Fatalf("pdftoppm arguments = %v", rasterize)
	}
	convert := runner.commandFor(t, defaultSofficePath)
	if !hasArgumentPrefix(convert, "-env:UserInstallation=file://") {
		t.Fatalf("soffice arguments = %v, want a private profile", convert)
	}
}

func TestLibreOfficeRendererRejectsMissingPDF(t *testing.T) {
	runner := &fakeRunner{pages: 3, skipPDF: true}
	renderer := NewLibreOfficeRenderer(LibreOfficeConfig{Runner: runner, TempDir: t.TempDir()})

	_, err := renderer.Render(context.Background(), []byte("deck"), Limits{})
	if err == nil || !strings.Contains(err.Error(), "no PDF") {
		t.Fatalf("Render() error = %v, want a missing PDF failure", err)
	}
}

func TestLibreOfficeRendererRejectsDeckOverSlideLimit(t *testing.T) {
	runner := &fakeRunner{pages: 5}
	renderer := NewLibreOfficeRenderer(LibreOfficeConfig{Runner: runner, TempDir: t.TempDir()})

	_, err := renderer.Render(context.Background(), []byte("deck"), Limits{MaxSlides: 4})
	if !errors.Is(err, ErrTooManySlides) {
		t.Fatalf("Render() error = %v, want ErrTooManySlides", err)
	}
}

func TestLibreOfficeRendererReportsConversionFailure(t *testing.T) {
	runner := &fakeRunner{pages: 1, failCommand: defaultSofficePath}
	renderer := NewLibreOfficeRenderer(LibreOfficeConfig{Runner: runner, TempDir: t.TempDir()})

	_, err := renderer.Render(context.Background(), []byte("deck"), Limits{})
	if err == nil || !strings.Contains(err.Error(), "convert deck to PDF") {
		t.Fatalf("Render() error = %v", err)
	}
}

func TestLibreOfficeRendererRemovesWorkingDirectory(t *testing.T) {
	tempDir := t.TempDir()
	renderer := NewLibreOfficeRenderer(LibreOfficeConfig{Runner: &fakeRunner{pages: 2}, TempDir: tempDir})

	if _, err := renderer.Render(context.Background(), []byte("deck"), Limits{}); err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("ReadDir() error = %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("working directory left %d entries behind", len(entries))
	}
}

func TestOrderedPagesRejectsGaps(t *testing.T) {
	workDir := t.TempDir()
	for _, name := range []string{"page-1.png", "page-3.png"} {
		if err := os.WriteFile(filepath.Join(workDir, name), []byte("png"), 0o600); err != nil {
			t.Fatalf("WriteFile() error = %v", err)
		}
	}

	if _, err := orderedPages(workDir); err == nil {
		t.Fatal("orderedPages() accepted non-contiguous pages")
	}
}

type fakeCommand struct {
	name string
	args []string
}

// fakeRunner stands in for LibreOffice, pdftoppm, and cwebp by writing the
// files each of them would produce.
type fakeRunner struct {
	pages       int
	skipPDF     bool
	failCommand string
	commands    []fakeCommand
}

func (runner *fakeRunner) Run(_ context.Context, workDir, name string, args ...string) error {
	runner.commands = append(runner.commands, fakeCommand{name: name, args: args})
	if runner.failCommand == name {
		return errors.New("command failed")
	}
	switch name {
	case defaultSofficePath:
		if runner.skipPDF {
			return nil
		}
		return os.WriteFile(filepath.Join(workDir, "deck.pdf"), []byte("pdf"), 0o600)
	case defaultPDFToPPMPath:
		width := len(fmt.Sprint(runner.pages))
		for page := 1; page <= runner.pages; page++ {
			name := fmt.Sprintf("%s-%0*d.png", pagePrefix, width, page)
			if err := os.WriteFile(filepath.Join(workDir, name), []byte(fmt.Sprintf("png page %d", page)), 0o600); err != nil {
				return err
			}
		}
		return nil
	case defaultCWebPPath:
		source := args[len(args)-3]
		target := args[len(args)-1]
		contents, err := os.ReadFile(source)
		if err != nil {
			return err
		}
		return os.WriteFile(target, []byte(strings.Replace(string(contents), "png", "webp", 1)), 0o600)
	}
	return fmt.Errorf("unexpected command %q", name)
}

func (runner *fakeRunner) commandFor(t *testing.T, name string) []string {
	t.Helper()
	for _, command := range runner.commands {
		if command.name == name {
			return command.args
		}
	}
	t.Fatalf("command %q was never run", name)
	return nil
}

func containsPair(arguments []string, flag, value string) bool {
	for index := 0; index+1 < len(arguments); index++ {
		if arguments[index] == flag && arguments[index+1] == value {
			return true
		}
	}
	return false
}

func hasArgumentPrefix(arguments []string, prefix string) bool {
	for _, argument := range arguments {
		if strings.HasPrefix(argument, prefix) {
			return true
		}
	}
	return false
}
