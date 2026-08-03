# Semantic Caching

The current Go API does not use a semantic cache. Web research and presentation
generation are executed through their configured providers, and reviewed research
sources are persisted with the presentation.

Do not configure semantic-cache variables or add cache tables for the Go API
without first defining the behavior, ownership, billing semantics, invalidation
rules, and migration plan in a new design document.

Generation point reservations, final persistence, and refunds are handled by the
Go API transactionally. See [API_OVERVIEW.md](API_OVERVIEW.md) and
[RATE_LIMITING.md](RATE_LIMITING.md) for the active API behavior.
