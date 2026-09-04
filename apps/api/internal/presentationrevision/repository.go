package presentationrevision

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

const revisionColumns = `presentation_id, revision, object_key, sha256, byte_size, slide_count, mime_type,
	author_id, source_operation_id, source_operation_kind, preview_status, preview_count,
	template_id, template_version, template_sha256, compiler_version, editor_provider, base_revision, created_at`

type PostgresRepository struct {
	database *sql.DB
}

var _ RevisionRepository = (*PostgresRepository)(nil)

func NewPostgresRepository(database *sql.DB) *PostgresRepository {
	return &PostgresRepository{database: database}
}

func (repository *PostgresRepository) FindByOperation(ctx context.Context, presentationID, operationID string) (Revision, bool, error) {
	return findRevisionByOperation(ctx, repository.database, presentationID, operationID)
}

func (repository *PostgresRepository) FindRevision(ctx context.Context, presentationID string, number RevisionNumber) (Revision, bool, error) {
	query := `SELECT ` + revisionColumns + ` FROM presentation_revisions
		WHERE presentation_id = $1 AND revision = $2`
	revision, err := scanRevision(repository.database.QueryRowContext(ctx, query, presentationID, number))
	if errors.Is(err, sql.ErrNoRows) {
		return Revision{}, false, nil
	}
	if err != nil {
		return Revision{}, false, fmt.Errorf("find presentation revision: %w", err)
	}
	return revision, true, nil
}

func (repository *PostgresRepository) CurrentRevision(ctx context.Context, presentationID string) (RevisionNumber, error) {
	var current RevisionNumber
	err := repository.database.QueryRowContext(ctx, `SELECT COALESCE(current_pptx_revision, 0)
		FROM presentations WHERE id = $1`, presentationID).Scan(&current)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrPresentationNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("read current presentation revision: %w", err)
	}
	return current, nil
}

func (repository *PostgresRepository) CommitRevision(ctx context.Context, expected RevisionNumber, revision Revision) (result RepositoryCommit, err error) {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return RepositoryCommit{}, fmt.Errorf("begin presentation revision transaction: %w", err)
	}
	defer func() {
		if rollbackErr := transaction.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) && err == nil {
			err = fmt.Errorf("rollback presentation revision transaction: %w", rollbackErr)
		}
	}()

	var current RevisionNumber
	lockErr := transaction.QueryRowContext(ctx, `SELECT COALESCE(current_pptx_revision, 0)
		FROM presentations WHERE id = $1 FOR UPDATE`, revision.PresentationID).Scan(&current)
	if errors.Is(lockErr, sql.ErrNoRows) {
		return RepositoryCommit{}, ErrPresentationNotFound
	}
	if lockErr != nil {
		return RepositoryCommit{}, fmt.Errorf("lock presentation revision: %w", lockErr)
	}

	duplicate, found, findErr := findRevisionByOperation(ctx, transaction, revision.PresentationID, revision.SourceOperation.ID)
	if findErr != nil {
		return RepositoryCommit{}, findErr
	}
	if found {
		if commitErr := transaction.Commit(); commitErr != nil {
			return RepositoryCommit{}, fmt.Errorf("commit duplicate presentation revision lookup: %w", commitErr)
		}
		return RepositoryCommit{Revision: duplicate, Duplicate: true}, nil
	}

	if expected > current || (expected < current && revision.SourceOperation.Kind != SourceOperationEditorSave) {
		return RepositoryCommit{}, ErrRevisionConflict
	}
	stale := expected < current

	if err := transaction.QueryRowContext(ctx, `SELECT COALESCE(MAX(revision), 0) + 1
		FROM presentation_revisions WHERE presentation_id = $1`, revision.PresentationID).Scan(&revision.Number); err != nil {
		return RepositoryCommit{}, fmt.Errorf("allocate presentation revision: %w", err)
	}
	if err := insertRevision(ctx, transaction, revision); err != nil {
		return RepositoryCommit{}, err
	}
	if !stale {
		if _, err := transaction.ExecContext(ctx, `UPDATE presentations
			SET current_pptx_revision = $1, document_kind = 'pptx', updated_at = NOW()
			WHERE id = $2`, revision.Number, revision.PresentationID); err != nil {
			return RepositoryCommit{}, fmt.Errorf("advance current presentation revision: %w", err)
		}
	}
	if err := transaction.Commit(); err != nil {
		return RepositoryCommit{}, fmt.Errorf("commit presentation revision transaction: %w", err)
	}
	return RepositoryCommit{Revision: revision, Advanced: !stale}, nil
}

type revisionQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func findRevisionByOperation(ctx context.Context, querier revisionQuerier, presentationID, operationID string) (Revision, bool, error) {
	query := `SELECT ` + revisionColumns + ` FROM presentation_revisions
		WHERE presentation_id = $1 AND source_operation_id = $2`
	revision, err := scanRevision(querier.QueryRowContext(ctx, query, presentationID, operationID))
	if errors.Is(err, sql.ErrNoRows) {
		return Revision{}, false, nil
	}
	if err != nil {
		return Revision{}, false, fmt.Errorf("find presentation revision operation: %w", err)
	}
	return revision, true, nil
}

func insertRevision(ctx context.Context, transaction *sql.Tx, revision Revision) error {
	_, err := transaction.ExecContext(ctx, `INSERT INTO presentation_revisions (
		presentation_id, revision, object_key, sha256, byte_size, slide_count, mime_type,
		author_id, source_operation_id, source_operation_kind, preview_status, preview_count,
		template_id, template_version, template_sha256, compiler_version, editor_provider, base_revision, created_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
		revision.PresentationID, revision.Number, revision.ObjectKey, revision.SHA256, revision.ByteSize,
		revision.SlideCount, revision.MIMEType, revision.AuthorID, revision.SourceOperation.ID,
		revision.SourceOperation.Kind, revision.PreviewStatus, revision.PreviewCount, nullableString(revision.TemplateID),
		nullablePositiveInt(revision.TemplateVersion), nullableString(revision.TemplateSHA256), nullableString(revision.CompilerVersion),
		nullableString(revision.EditorProvider), nullableRevision(revision.BaseRevision), revision.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert presentation revision: %w", err)
	}
	return nil
}

type rowScanner interface {
	Scan(...any) error
}

func scanRevision(row rowScanner) (Revision, error) {
	var revision Revision
	var templateID, templateSHA256, compilerVersion, editorProvider sql.NullString
	var templateVersion, baseRevision sql.NullInt64
	err := row.Scan(
		&revision.PresentationID, &revision.Number, &revision.ObjectKey, &revision.SHA256, &revision.ByteSize,
		&revision.SlideCount, &revision.MIMEType, &revision.AuthorID, &revision.SourceOperation.ID,
		&revision.SourceOperation.Kind, &revision.PreviewStatus, &revision.PreviewCount, &templateID,
		&templateVersion, &templateSHA256, &compilerVersion, &editorProvider, &baseRevision, &revision.CreatedAt,
	)
	if err != nil {
		return Revision{}, err
	}
	revision.TemplateID = templateID.String
	revision.TemplateVersion = int(templateVersion.Int64)
	revision.TemplateSHA256 = templateSHA256.String
	revision.CompilerVersion = compilerVersion.String
	revision.EditorProvider = editorProvider.String
	if baseRevision.Valid {
		value := RevisionNumber(baseRevision.Int64)
		revision.BaseRevision = &value
	}
	return revision, nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullablePositiveInt(value int) any {
	if value <= 0 {
		return nil
	}
	return value
}

func nullableRevision(value *RevisionNumber) any {
	if value == nil {
		return nil
	}
	return *value
}
