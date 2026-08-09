#!/usr/bin/env bash

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$#" -eq 0 ]]; then
	set -- up
fi

if [[ "$#" -eq 1 && "$1" == "up" ]]; then
	CGO_ENABLED=0 go -C "${script_dir}/.." run ./cmd/migrate
	exit 0
fi

printf 'Unsupported migration command. Use migrate.sh with no arguments or "up" so application and River schemas stay synchronized.\n' >&2
exit 2
