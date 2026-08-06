# SlideSage

SlideSage is an AI-assisted presentation builder. It generates, researches, revises, stores, previews, and exports slide decks from a React web application.

---

## Features

- Streaming presentation generation and revision
- Web research with cited sources
- Semantic memory for slide, deck, style, feedback, and source context
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
- [Architecture](docs/API_ARCHITECTURE.md)
- [API reference](docs/API_OVERVIEW.md)
- [Authentication](docs/AUTH_API.md)
- [RAG and semantic memory](docs/RAG_IMPLEMENTATION.md)
