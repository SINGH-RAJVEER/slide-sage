{ pkgs, lib, ... }:

let
    dbName = "slidesage";
    dbUser = "slidesage";
    dbPassword = "slidesage";
    dbPort = 5432;
in
{
    dotenv.enable = true;

    packages = [
        pkgs.bun
        pkgs.go
        pkgs.goose
        pkgs.just
    ];

    services.postgres = {
        enable = true;
        package = pkgs.postgresql_18;
        extensions = extensions: [ extensions.pgvector ];
        createDatabase = false;
        listen_addresses = "127.0.0.1";
        port = dbPort;
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
                if ! psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${dbUser}'" | grep -q 1; then
                    psql -d postgres -c "CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'"
                fi

                if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1; then
                    psql -d postgres -c "CREATE DATABASE ${dbName} OWNER ${dbUser}"
                fi

                psql -d ${dbName} -c "CREATE EXTENSION IF NOT EXISTS vector"
                psql -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}"
            '';
        };

        "db:migrate" = {
            after = [ "db:setup" ];
            exec = ''
                DATABASE_URL="postgresql://${dbUser}:${dbPassword}@127.0.0.1:$PGPORT/${dbName}" bash "$DEVENV_ROOT/apps/api/scripts/migrate.sh"
            '';
        };
    };

    processes = {
        api = {
            exec = ''
                DATABASE_URL="postgresql://${dbUser}:${dbPassword}@127.0.0.1:$PGPORT/${dbName}" go run ./cmd/api
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
        web = {
            exec = "bun run dev:web";
            cwd = ".";
            after = [ "devenv:processes:api" ];
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
        POSTGRES_USER = dbUser;
        POSTGRES_PASSWORD = dbPassword;
        POSTGRES_DB = dbName;
        POSTGRES_PORT = toString dbPort;
        DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@127.0.0.1:${toString dbPort}/${dbName}";
        BASE_URL = "http://localhost:8000";
        CORS_ORIGIN = "http://localhost:5173";
        VITE_API_URL = "http://localhost:5173";
        VITE_PROXY_TARGET = "http://localhost:8000";
        NODE_ENV = "development";
        LOG_LEVEL = "debug";
        CGO_ENABLED = "0";
    };
}
