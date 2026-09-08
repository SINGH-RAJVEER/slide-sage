package migrations

import (
	"math"
	"testing"

	"github.com/pressly/goose/v3"
)

func TestEmbeddedMigrationsHaveUniqueOrderedVersions(t *testing.T) {
	goose.SetBaseFS(Files)
	defer goose.SetBaseFS(nil)
	migrations, err := goose.CollectMigrations(".", 0, math.MaxInt64)
	if err != nil {
		t.Fatal(err)
	}
	if len(migrations) == 0 {
		t.Fatal("no migrations embedded")
	}
}
