{ pkgs, lib, ... }:
{
    dotenv.enable = true;

    packages = [
        pkgs.bun
        pkgs.go
        pkgs.goose
        pkgs.just
        pkgs.terraform
        # Renders template thumbnails. Playwright's own download is dynamically
        # linked against libraries NixOS does not place on the default path.
        pkgs.chromium
        # The preview renderer shells out to these three. They are the same
        # tools the preview container installs, so a local render exercises the
        # same path production does.
        pkgs.libreoffice
        pkgs.poppler-utils
        pkgs.libwebp
        # Stands in for the presentation revision bucket. Revisions and preview
        # images are real objects locally, so nothing needs cloud credentials.
        pkgs.fake-gcs-server
    ];

    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";

    # LibreOffice resolves fonts through fontconfig. Without an explicit
    # configuration it inherits whatever the host happens to have, which is how
    # previews end up rendering as fallback boxes on one machine and not another.
    env.FONTCONFIG_FILE = pkgs.makeFontsConf {
        fontDirectories = [
            pkgs.dejavu_fonts
            pkgs.liberation_ttf
            pkgs.noto-fonts
        ];
    };

    services.postgres = {
        enable = true;
        package = pkgs.postgresql_18;
        extensions = extensions: [ extensions.pgvector ];
        createDatabase = false;
        listen_addresses = "127.0.0.1";
        port = 5432;
        initdbArgs = [
            "--username=postgres"
            "--encoding=UTF8"
            "--locale=C"
        ];
        hbaConf = ''
            local all all trust
            host all all 127.0.0.1/32 trust
            host all all ::1/128 trust
        '';
    };

    tasks = {
        "db:setup" = {
            after = [ "devenv:processes:postgres@ready" ];
            exec = ''
                if ! psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'slidesage'" | grep -q 1; then
                    psql -d postgres -c "CREATE USER slidesage WITH PASSWORD 'slidesage'"
                fi

                if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'slidesage'" | grep -q 1; then
                    psql -d postgres -c "CREATE DATABASE slidesage OWNER slidesage"
                fi

                psql -d slidesage -c "CREATE EXTENSION IF NOT EXISTS vector"
                psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE slidesage TO slidesage"
            '';
        };

        "db:migrate" = {
            after = [ "db:setup" ];
            exec = ''
                DATABASE_URL="postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage" \
                    go -C "$DEVENV_ROOT/apps/api" run ./cmd/migrate
            '';
        };
    };

    processes = {
        # The bucket is a directory: fake-gcs-server adopts every folder under
        # its root as a bucket, so creating it up front is the whole setup.
        storage = {
            exec = ''
                mkdir -p "$DEVENV_STATE/gcs/$PRESENTATION_GCS_BUCKET"
                exec fake-gcs-server \
                    -scheme http \
                    -host 127.0.0.1 \
                    -port 4443 \
                    -backend filesystem \
                    -filesystem-root "$DEVENV_STATE/gcs" \
                    -public-host 127.0.0.1:4443
            '';
            cwd = ".";
            ready = {
                http.get = {
                    host = "127.0.0.1";
                    port = 4443;
                    path = "/_internal/healthcheck";
                };
                initial_delay = 1;
                period = 1;
                probe_timeout = 3;
                success_threshold = 1;
                failure_threshold = 30;
            };
        };
        api = {
            exec = ''
                DATABASE_URL="postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage" go run ./cmd/api
            '';
            cwd = "apps/api";
            after = [ "db:migrate" ];
            ready = {
                http.get = {
                    port = 8000;
                    path = "/health";
                };
                initial_delay = 1;
                period = 1;
                probe_timeout = 3;
                success_threshold = 1;
                failure_threshold = 30;
            };
        };
		worker = {
			exec = ''
				DATABASE_URL="postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage" go run ./cmd/worker
			'';
			cwd = "apps/api";
			after = [ "db:migrate" ];
			ready = {
				http.get = {
					port = 8080;
					path = "/ready";
				};
				initial_delay = 1;
				period = 1;
				probe_timeout = 3;
				success_threshold = 1;
				failure_threshold = 30;
			};
		};
		preview = {
			exec = ''
				DATABASE_URL="postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage" go run ./cmd/previewworker
			'';
			cwd = "apps/api";
			after = [ "db:migrate" "devenv:processes:storage" ];
			ready = {
				http.get = {
					port = 8081;
					path = "/ready";
				};
				initial_delay = 1;
				period = 1;
				probe_timeout = 3;
				success_threshold = 1;
				failure_threshold = 30;
			};
		};
        web = {
            exec = "bun run dev:web";
            cwd = ".";
			after = [ "devenv:processes:api" "devenv:processes:worker" ];
            ready = {
                http.get = {
                    host = "localhost";
                    port = 5173;
                    path = "/";
                };
                initial_delay = 1;
                period = 1;
                probe_timeout = 3;
                success_threshold = 1;
                failure_threshold = 30;
            };
        };
    };

    env = {
        PGUSER = "postgres";
        POSTGRES_USER = "slidesage";
        POSTGRES_PASSWORD = "slidesage";
        POSTGRES_DB = "slidesage";
        POSTGRES_PORT = toString 5432;
        DATABASE_URL = "postgresql://slidesage:slidesage@127.0.0.1:${toString 5432}/slidesage";
        NODE_ENV = "development";
        LOG_LEVEL = "debug";
        CGO_ENABLED = "0";
		WORKER_CONCURRENCY = "2";
		WORKER_DATABASE_POOL_MAX = "5";

		# The Google storage client routes every call to this host when it is
		# set, which is what lets the API, the worker, and the renderer share one
		# emulator without credentials.
		STORAGE_EMULATOR_HOST = "http://127.0.0.1:4443";
		PRESENTATION_GCS_BUCKET = "slidesage-dev-revisions";

		# The generation worker already serves its own probe on 8080.
		PREVIEW_HEALTH_PORT = "8081";
		PREVIEW_CONCURRENCY = "1";
		PREVIEW_TEMP_DIR = "/tmp";

		# Pinned rather than resolved from PATH so the renderer cannot silently
		# pick up a different LibreOffice than the one this shell provides.
		SOFFICE_PATH = "${pkgs.libreoffice}/bin/soffice";
		PDFTOPPM_PATH = "${pkgs.poppler-utils}/bin/pdftoppm";
		CWEBP_PATH = "${pkgs.libwebp}/bin/cwebp";
    };
}
