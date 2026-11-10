# services/

Processes that you deploy. A YAML file configures each process. They
have no user interface.

- [`gateway`](gateway/README.md): the gateway service. It runs
  `@conduits/gateway` from a `conduits.yaml` file and needs no
  database.
