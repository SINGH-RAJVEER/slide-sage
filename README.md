# SlideSage

SlideSage is a presentation builder with AI-assisted research and generation. The React app lets users create, revise, preview, store, and export slide decks.

---

## Features

- Streaming presentation generation and revision
- Web research with cited sources
- Reviewed web sources attached to generated decks
- PPTX and PDF export

## Repository

```text
apps/
    api/        Go API, Goose migrations, repositories, and provider integrations
    web/        React web application
libs/
    types/      Shared TypeScript contracts
    ui/         Shared React UI primitives
docs/           Maintainer documentation
devenv.nix      Local toolchain and service orchestration
Justfile        Common development commands
```

## Documentation

- [Development setup](docs/DEVELOPMENT_SETUP.md)
- [Environment variables](docs/ENVIRONMENT_VARIABLES.md)
- [CI/CD: Artifact Registry and Cloud Run](docs/CI_CD.md)
- [Architecture](docs/API_ARCHITECTURE.md)
- [API reference](docs/API_OVERVIEW.md)
- [Authentication](docs/AUTH_API.md)
- [Web research](docs/WEB_RESEARCH.md)
- [Deck planning](docs/DECK_PLANNING.md)
- [Observability](docs/OBSERVABILITY.md)
