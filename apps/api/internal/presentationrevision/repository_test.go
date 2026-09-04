package presentationrevision

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestPostgresRepositoryCommitLifecycle(t *testing.T) {
	database := integrationDatabase(t)
	userID, presentationID := insertRevisionFixture(t, database)
	repository := NewPostgresRepository(database)
	ctx := context.Background()

	current, err := repository.CurrentRevision(ctx, presentationID)
	if err != nil || current != 0 {
		t.Fatalf("CurrentRevision() = %d, %v; want 0, nil", current, err)
	}

	first := testRevision(presentationID, userID, "operation-1", SourceOperationImport)
	firstResult, err := repository.CommitRevision(ctx, 0, first)
	if err != nil {
		t.Fatalf("first CommitRevision() error = %v", err)
	}
	if firstResult.Revision.Number != 1 || !firstResult.Advanced || firstResult.Duplicate {
		t.Fatalf("first CommitRevision() = %+v", firstResult)
	}

	duplicate, err := repository.CommitRevision(ctx, 0, first)
	if err != nil {
		t.Fatalf("duplicate CommitRevision() error = %v", err)
	}
	if !duplicate.Duplicate || duplicate.Advanced || duplicate.Revision.Number != 1 {
		t.Fatalf("duplicate CommitRevision() = %+v", duplicate)
	}

	second := testRevision(presentationID, userID, "operation-2", SourceOperationImport)
	secondResult, err := repository.CommitRevision(ctx, 1, second)
	if err != nil {
		t.Fatalf("second CommitRevision() error = %v", err)
	}
	if secondResult.Revision.Number != 2 || !secondResult.Advanced {
		t.Fatalf("second CommitRevision() = %+v", secondResult)
	}

	base := RevisionNumber(1)
	staleEditor := testRevision(presentationID, userID, "operation-3", SourceOperationEditorSave)
	staleEditor.EditorProvider = "onlyoffice"
	staleEditor.BaseRevision = &base
	staleResult, err := repository.CommitRevision(ctx, 1, staleEditor)
	if err != nil {
		t.Fatalf("stale editor CommitRevision() error = %v", err)
	}
	if staleResult.Revision.Number != 3 || staleResult.Advanced {
		t.Fatalf("stale editor CommitRevision() = %+v", staleResult)
	}
	current, err = repository.CurrentRevision(ctx, presentationID)
	if err != nil || current != 2 {
		t.Fatalf("CurrentRevision() after stale save = %d, %v; want 2, nil", current, err)
	}

	fourth := testRevision(presentationID, userID, "operation-4", SourceOperationImport)
	fourthResult, err := repository.CommitRevision(ctx, 2, fourth)
	if err != nil {
		t.Fatalf("fourth CommitRevision() error = %v", err)
	}
	if fourthResult.Revision.Number != 4 || !fourthResult.Advanced {
		t.Fatalf("fourth CommitRevision() = %+v", fourthResult)
	}

	found, ok, err := repository.FindByOperation(ctx, presentationID, "operation-4")
	if err != nil || !ok {
		t.Fatalf("FindByOperation() = %+v, %t, %v", found, ok, err)
	}
	if found.TemplateID != "" || found.TemplateVersion != 0 || found.BaseRevision != nil || found.Number != 4 {
		t.Fatalf("FindByOperation() revision = %+v", found)
	}
	byNumber, ok, err := repository.FindRevision(ctx, presentationID, 4)
	if err != nil || !ok || byNumber.SourceOperation.ID != "operation-4" {
		t.Fatalf("FindRevision() = %+v, %t, %v", byNumber, ok, err)
	}
}

func TestPostgresRepositoryRejectsInvalidExpectedRevision(t *testing.T) {
	database := integrationDatabase(t)
	userID, presentationID := insertRevisionFixture(t, database)
	repository := NewPostgresRepository(database)
	ctx := context.Background()

	future := testRevision(presentationID, userID, "future-editor", SourceOperationEditorSave)
	_, err := repository.CommitRevision(ctx, 1, future)
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("future CommitRevision() error = %v, want ErrRevisionConflict", err)
	}

	first := testRevision(presentationID, userID, "operation-1", SourceOperationImport)
	if _, err := repository.CommitRevision(ctx, 0, first); err != nil {
		t.Fatalf("seed CommitRevision() error = %v", err)
	}
	stale := testRevision(presentationID, userID, "stale-import", SourceOperationImport)
	_, err = repository.CommitRevision(ctx, 0, stale)
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale CommitRevision() error = %v, want ErrRevisionConflict", err)
	}
}

func TestPostgresRepositorySerializesRevisionAllocation(t *testing.T) {
	database := integrationDatabase(t)
	userID, presentationID := insertRevisionFixture(t, database)
	repository := NewPostgresRepository(database)
	ctx := context.Background()

	results := make(chan RepositoryCommit, 2)
	errorsFound := make(chan error, 2)
	var wait sync.WaitGroup
	for index := 1; index <= 2; index++ {
		wait.Add(1)
		go func(operationID string) {
			defer wait.Done()
			result, err := repository.CommitRevision(ctx, 0, testRevision(presentationID, userID, operationID, SourceOperationImport))
			results <- result
			errorsFound <- err
		}(fmt.Sprintf("operation-%d", index))
	}
	wait.Wait()
	close(results)
	close(errorsFound)

	successes := 0
	conflicts := 0
	for err := range errorsFound {
		if err == nil {
			successes++
		} else if errors.Is(err, ErrRevisionConflict) {
			conflicts++
		} else {
			t.Fatalf("CommitRevision() unexpected error = %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent commits: successes = %d, conflicts = %d", successes, conflicts)
	}
	for result := range results {
		if result.Advanced && result.Revision.Number != 1 {
			t.Fatalf("winning CommitRevision() = %+v", result)
		}
	}
}

func TestPostgresRepositoryReportsMissingPresentation(t *testing.T) {
	repository := NewPostgresRepository(integrationDatabase(t))
	_, err := repository.CurrentRevision(context.Background(), "missing-"+randomID(t))
	if !errors.Is(err, ErrPresentationNotFound) {
		t.Fatalf("CurrentRevision() error = %v, want ErrPresentationNotFound", err)
	}
}

func TestPostgresRepositoryRollsBackConstraintFailure(t *testing.T) {
	database := integrationDatabase(t)
	userID, presentationID := insertRevisionFixture(t, database)
	repository := NewPostgresRepository(database)
	ctx := context.Background()
	revision := testRevision(presentationID, userID, "invalid-object-key", SourceOperationImport)
	revision.ObjectKey = "unsafe/deck.pptx"

	if _, err := repository.CommitRevision(ctx, 0, revision); err == nil {
		t.Fatal("CommitRevision() error = nil, want object-key constraint error")
	}
	current, err := repository.CurrentRevision(ctx, presentationID)
	if err != nil || current != 0 {
		t.Fatalf("CurrentRevision() after failed commit = %d, %v; want 0, nil", current, err)
	}
	_, found, err := repository.FindByOperation(ctx, presentationID, "invalid-object-key")
	if err != nil || found {
		t.Fatalf("FindByOperation() after failed commit = found %t, error %v", found, err)
	}
}

func integrationDatabase(t *testing.T) *sql.DB {
	t.Helper()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgresql://slidesage:slidesage@127.0.0.1:5432/slidesage"
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Skipf("open PostgreSQL integration database: %v", err)
	}
	if err := database.PingContext(context.Background()); err != nil {
		database.Close()
		t.Skipf("PostgreSQL integration database is unavailable: %v", err)
	}
	var revisionsTable sql.NullString
	if err := database.QueryRow(`SELECT to_regclass('presentation_revisions')`).Scan(&revisionsTable); err != nil || !revisionsTable.Valid {
		database.Close()
		t.Skip("presentation revision migration is not applied")
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func insertRevisionFixture(t *testing.T, database *sql.DB) (string, string) {
	t.Helper()
	ctx := context.Background()
	suffix := randomID(t)
	userID := "revision-user-" + suffix
	presentationID := "revision-presentation-" + suffix
	_, err := database.ExecContext(ctx, `INSERT INTO users (id, name, email, email_verified)
		VALUES ($1, 'Revision Test', $2, true)`, userID, suffix+"@revision.test")
	if err != nil {
		t.Fatalf("insert revision test user: %v", err)
	}
	_, err = database.ExecContext(ctx, `INSERT INTO presentations (id, user_id, title, prompt, slides_data)
		VALUES ($1, $2, 'Revision Test', 'Test prompt', '[]'::jsonb)`, presentationID, userID)
	if err != nil {
		_, _ = database.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, userID)
		t.Fatalf("insert revision test presentation: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.ExecContext(context.Background(), `UPDATE presentations
			SET current_pptx_revision = NULL, document_kind = 'legacy' WHERE id = $1`, presentationID)
		_, _ = database.ExecContext(context.Background(), `DELETE FROM presentation_revisions WHERE presentation_id = $1`, presentationID)
		_, _ = database.ExecContext(context.Background(), `DELETE FROM presentations WHERE id = $1`, presentationID)
		_, _ = database.ExecContext(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID, presentationID
}

func testRevision(presentationID, userID, operationID string, kind SourceOperationKind) Revision {
	digest := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	return Revision{
		PresentationID: presentationID,
		ObjectKey:      fmt.Sprintf("presentations/%s/objects/%s.pptx", presentationID, digest),
		SHA256:         digest,
		ByteSize:       1024,
		SlideCount:     1,
		MIMEType:       PPTXContentType,
		AuthorID:       userID,
		SourceOperation: SourceOperation{
			ID:   operationID,
			Kind: kind,
		},
		PreviewStatus: PreviewPending,
		CreatedAt:     time.Date(2026, time.September, 3, 12, 0, 0, 0, time.UTC),
	}
}

func randomID(t *testing.T) string {
	t.Helper()
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		t.Fatalf("generate fixture ID: %v", err)
	}
	return hex.EncodeToString(value)
}
