# services/

Deployable backend processes, configured via YAML, no UI of their own.

- [`gateway`](gateway/README.md) — the runnable gateway service:
  `@conduits/gateway` (the library) driven by a `conduits.yaml` config
  file, no database required. See its own README for setup.
