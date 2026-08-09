// Package migrations embeds the canonical Goose migration history for the
// deployment migration binary.
package migrations

import "embed"

// Files contains every application SQL migration.
//
//go:embed *.sql
var Files embed.FS
