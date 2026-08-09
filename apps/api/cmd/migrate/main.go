package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/migrations"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL must be set")
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	database.SetMaxOpenConns(1)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pingContext, cancelPing := context.WithTimeout(ctx, time.Duration(envInt("DATABASE_CONNECT_TIMEOUT", 10))*time.Second)
	if err := database.PingContext(pingContext); err != nil {
		cancelPing()
		log.Fatal(err)
	}
	cancelPing()
	if _, err := database.ExecContext(ctx, `SET lock_timeout = '30s'`); err != nil {
		log.Fatal(err)
	}
	if err := baselineExistingSchema(ctx, database); err != nil {
		log.Fatal(err)
	}

	goose.SetBaseFS(migrations.Files)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatal(err)
	}
	if err := goose.UpContext(ctx, database, "."); err != nil {
		log.Fatal(err)
	}

	migrator, err := rivermigrate.New(riverdatabasesql.New(database), nil)
	if err != nil {
		log.Fatal(err)
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		log.Fatal(err)
	}
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

// baselineExistingSchema adopts databases created before Goose was introduced.
// Version 14 still runs because it is the explicit pre-launch accounting reset.
func baselineExistingSchema(ctx context.Context, database *sql.DB) error {
	var gooseTable, baselineSchema bool
	if err := database.QueryRowContext(ctx, `SELECT to_regclass('public.goose_db_version') IS NOT NULL`).Scan(&gooseTable); err != nil {
		return err
	}
	if err := database.QueryRowContext(ctx, `
		SELECT to_regclass('public.users') IS NOT NULL
			AND to_regclass('public.presentations') IS NOT NULL
			AND to_regclass('public.ai_provider_connections') IS NOT NULL
			AND to_regclass('public.generation_point_operations') IS NOT NULL
			AND to_regclass('public.api_rate_limits') IS NOT NULL
			AND to_regclass('public.payments') IS NOT NULL
			AND EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'presentations'
					AND column_name = 'revision'
			)
			AND EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'payments'
					AND column_name = 'amount_paise'
			)
			AND EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'payments'
					AND column_name = 'status'
			)
	`).Scan(&baselineSchema); err != nil {
		return err
	}
	if gooseTable || !baselineSchema {
		return nil
	}
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		CREATE TABLE goose_db_version (
			id serial PRIMARY KEY,
			version_id bigint NOT NULL,
			is_applied boolean NOT NULL,
			tstamp timestamp NOT NULL DEFAULT NOW()
		);
		INSERT INTO goose_db_version (version_id, is_applied) VALUES (0, true);
		INSERT INTO goose_db_version (version_id, is_applied)
		SELECT version, true FROM generate_series(1, 13) AS version;
	`); err != nil {
		return err
	}
	return tx.Commit()
}
