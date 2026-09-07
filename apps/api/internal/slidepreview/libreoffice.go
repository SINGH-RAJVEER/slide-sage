package slidepreview

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	defaultSofficePath  = "soffice"
	defaultPDFToPPMPath = "pdftoppm"
	defaultCWebPPath    = "cwebp"
	defaultWebPQuality  = 82
	pagePrefix          = "page"
)

// CommandRunner executes one converter process. The renderer injects it so
// tests exercise the conversion pipeline without LibreOffice installed.
type CommandRunner interface {
	Run(ctx context.Context, workDir, name string, args ...string) error
}

type LibreOfficeConfig struct {
	SofficePath  string
	PDFToPPMPath string
	CWebPPath    string
	// Quality is the cwebp quality factor from 0 to 100.
	Quality int
	// TempDir holds per-render working directories. An empty value uses the
	// operating system temporary directory.
	TempDir string
	Runner  CommandRunner
}

// LibreOfficeRenderer converts a deck to PDF with headless LibreOffice, then
// rasterizes each page. Every render gets a private LibreOffice profile so
// concurrent renders never share user state or lock files.
type LibreOfficeRenderer struct {
	sofficePath  string
	pdfToPPMPath string
	cwebpPath    string
	quality      int
	tempDir      string
	runner       CommandRunner
}

var _ Renderer = (*LibreOfficeRenderer)(nil)

func NewLibreOfficeRenderer(config LibreOfficeConfig) *LibreOfficeRenderer {
	renderer := &LibreOfficeRenderer{
		sofficePath:  config.SofficePath,
		pdfToPPMPath: config.PDFToPPMPath,
		cwebpPath:    config.CWebPPath,
		quality:      config.Quality,
		tempDir:      config.TempDir,
		runner:       config.Runner,
	}
	if renderer.sofficePath == "" {
		renderer.sofficePath = defaultSofficePath
	}
	if renderer.pdfToPPMPath == "" {
		renderer.pdfToPPMPath = defaultPDFToPPMPath
	}
	if renderer.cwebpPath == "" {
		renderer.cwebpPath = defaultCWebPPath
	}
	if renderer.quality <= 0 || renderer.quality > 100 {
		renderer.quality = defaultWebPQuality
	}
	if renderer.runner == nil {
		renderer.runner = ExecRunner{}
	}
	return renderer
}

func (renderer *LibreOfficeRenderer) Render(ctx context.Context, pptx []byte, limits Limits) ([][]byte, error) {
	result, err := renderer.RenderDocument(ctx, pptx, limits)
	return result.Images, err
}

func (renderer *LibreOfficeRenderer) RenderDocument(ctx context.Context, pptx []byte, limits Limits) (RenderedDocument, error) {
	limits = limits.withDefaults()
	if int64(len(pptx)) > limits.MaxRevisionBytes {
		return RenderedDocument{}, fmt.Errorf("deck is %d bytes, over the %d byte render limit", len(pptx), limits.MaxRevisionBytes)
	}
	if len(pptx) == 0 {
		return RenderedDocument{}, errors.New("deck is empty")
	}
	renderContext, cancel := context.WithTimeout(ctx, limits.Timeout)
	defer cancel()

	workDir, err := os.MkdirTemp(renderer.tempDir, "slidesage-preview-")
	if err != nil {
		return RenderedDocument{}, fmt.Errorf("create preview working directory: %w", err)
	}
	defer os.RemoveAll(workDir)

	deckPath := filepath.Join(workDir, "deck.pptx")
	if err := os.WriteFile(deckPath, pptx, 0o600); err != nil {
		return RenderedDocument{}, fmt.Errorf("write deck for conversion: %w", err)
	}
	pdfPath, err := renderer.convertToPDF(renderContext, workDir, deckPath)
	if err != nil {
		return RenderedDocument{}, err
	}
	pages, err := renderer.rasterize(renderContext, workDir, pdfPath, limits)
	if err != nil {
		return RenderedDocument{}, err
	}
	images, err := renderer.encode(renderContext, workDir, pages)
	if err != nil {
		return RenderedDocument{}, err
	}
	pdf, err := os.ReadFile(pdfPath)
	if err != nil {
		return RenderedDocument{}, err
	}
	return RenderedDocument{Images: images, PDF: pdf}, nil
}

func (renderer *LibreOfficeRenderer) convertToPDF(ctx context.Context, workDir, deckPath string) (string, error) {
	profileDir := filepath.Join(workDir, "profile")
	if err := os.Mkdir(profileDir, 0o700); err != nil {
		return "", fmt.Errorf("create LibreOffice profile directory: %w", err)
	}
	arguments := []string{
		"-env:UserInstallation=file://" + profileDir,
		"--headless", "--norestore", "--nolockcheck", "--nodefault",
		"--nofirststartwizard", "--nologo",
		"--convert-to", "pdf:impress_pdf_Export",
		"--outdir", workDir,
		deckPath,
	}
	if err := renderer.runner.Run(ctx, workDir, renderer.sofficePath, arguments...); err != nil {
		return "", fmt.Errorf("convert deck to PDF: %w", err)
	}
	pdfPath := filepath.Join(workDir, "deck.pdf")
	// LibreOffice reports success even when it silently skips a document, so
	// the output file is the only proof the conversion happened.
	if info, err := os.Stat(pdfPath); err != nil || info.Size() == 0 {
		return "", errors.New("LibreOffice produced no PDF")
	}
	return pdfPath, nil
}

func (renderer *LibreOfficeRenderer) rasterize(ctx context.Context, workDir, pdfPath string, limits Limits) ([]string, error) {
	arguments := []string{
		"-png",
		"-cropbox",
		"-scale-to", strconv.Itoa(limits.Width),
		"-f", "1", "-l", strconv.Itoa(limits.MaxSlides + 1),
		pdfPath,
		filepath.Join(workDir, pagePrefix),
	}
	if err := renderer.runner.Run(ctx, workDir, renderer.pdfToPPMPath, arguments...); err != nil {
		return nil, fmt.Errorf("rasterize PDF pages: %w", err)
	}
	pages, err := orderedPages(workDir)
	if err != nil {
		return nil, err
	}
	if len(pages) > limits.MaxSlides {
		return nil, fmt.Errorf("%w: rendered %d pages", ErrTooManySlides, len(pages))
	}
	return pages, nil
}

func (renderer *LibreOfficeRenderer) encode(ctx context.Context, workDir string, pages []string) ([][]byte, error) {
	images := make([][]byte, 0, len(pages))
	for index, page := range pages {
		target := filepath.Join(workDir, fmt.Sprintf("%s-%d.webp", pagePrefix, index))
		arguments := []string{"-quiet", "-q", strconv.Itoa(renderer.quality), page, "-o", target}
		if err := renderer.runner.Run(ctx, workDir, renderer.cwebpPath, arguments...); err != nil {
			return nil, fmt.Errorf("encode preview %d: %w", index, err)
		}
		image, err := os.ReadFile(target)
		if err != nil {
			return nil, fmt.Errorf("read preview %d: %w", index, err)
		}
		if len(image) == 0 {
			return nil, fmt.Errorf("preview %d is empty", index)
		}
		images = append(images, image)
	}
	return images, nil
}

// orderedPages sorts rasterized pages numerically. pdftoppm zero-pads its page
// numbers by total page count, so lexical order is wrong past nine pages.
func orderedPages(workDir string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(workDir, pagePrefix+"-*.png"))
	if err != nil {
		return nil, fmt.Errorf("list rendered pages: %w", err)
	}
	if len(matches) == 0 {
		return nil, errors.New("no pages were rendered")
	}
	numbers := make(map[string]int, len(matches))
	for _, match := range matches {
		name := strings.TrimSuffix(filepath.Base(match), ".png")
		number, err := strconv.Atoi(strings.TrimPrefix(name, pagePrefix+"-"))
		if err != nil || number < 1 {
			return nil, fmt.Errorf("unexpected rendered page %q", name)
		}
		numbers[match] = number
	}
	sort.Slice(matches, func(first, second int) bool {
		return numbers[matches[first]] < numbers[matches[second]]
	})
	for index, match := range matches {
		if numbers[match] != index+1 {
			return nil, errors.New("rendered pages are not contiguous")
		}
	}
	return matches, nil
}

// ExecRunner runs converters as child processes with a minimal environment so
// they cannot pick up ambient LibreOffice or user configuration.
type ExecRunner struct{}

var _ CommandRunner = ExecRunner{}

func (ExecRunner) Run(ctx context.Context, workDir, name string, args ...string) error {
	command := exec.CommandContext(ctx, name, args...)
	command.Dir = workDir
	command.Env = []string{
		"HOME=" + workDir,
		"TMPDIR=" + workDir,
		"PATH=" + os.Getenv("PATH"),
		"LC_ALL=C",
		"SAL_DISABLE_OPENCL=1",
		"SAL_USE_VCLPLUGIN=svp",
	}
	var output bytes.Buffer
	command.Stdout = &output
	command.Stderr = &output
	if err := command.Run(); err != nil {
		return fmt.Errorf("%s failed: %w: %s", filepath.Base(name), err, strings.TrimSpace(truncate(output.String(), 2000)))
	}
	return nil
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "..."
}
