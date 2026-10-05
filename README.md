# Conduits

Conduits is an open-source gateway. It gives a Google Sheet, a Gmail
account, or a Fastmail inbox a REST API. You do not write a backend.

The gateway includes these controls:

- Allowed HTTP methods per conduit (RACM).
- An IP allowlist.
- A request throttle.
- Bearer tokens for the methods you choose.
- Hidden form fields that stop spam bots.

# Start here

| You want to | Read |
|:--|:--|
| Run a gateway | [`services/gateway/README.md`](services/gateway/README.md) |
| Call a conduit from a page or a script | [`docs/developer-guide.md`](docs/developer-guide.md) |
| Know every route, status code, and record shape | [`docs/gateway-api.md`](docs/gateway-api.md) |
| Add a widget to a page | [`library/widgets/README.md`](library/widgets/README.md) |
| Add a new data source | [`packages/conduit/INTEGRATIONS.md`](packages/conduit/INTEGRATIONS.md) |

# What this repository contains

This repository is an npm workspaces monorepo.

| Path | Contents |
|:--|:--|
| `packages/gateway` | The request pipeline and the wire API. |
| `packages/conduit` | The Google Sheets, Gmail, and Fastmail source clients. |
| `packages/config` | The compiler for `conduits.yaml`, and the readers for the gateway settings. |
| `packages/credential-store` | The store for provider credentials. |
| `services/gateway` | The gateway service and its CLI. It needs no database. |
| `library/widgets` | The `xyz-*` widgets: custom elements with no dependencies. |
| `library/pages` | Tutorials that show how to build on a conduit. |

# Development

```sh
npm install         # all workspaces
npm test            # fast tests, all workspaces
npm run test:all    # fast tests and browser tests
npm run typecheck   # all workspaces
```

To run a gateway on your computer:

1. Go to `services/gateway`.
2. Copy `.env.example` to `.env`.
3. Copy `conduits.example.yaml` to `conduits.yaml`.
4. Do the tutorial in [`services/gateway/README.md`](services/gateway/README.md).
5. Run `npm run gateway`.

# Contributions

- `packages/` and `services/`: we do not accept pull requests that we
  did not ask for. Open an issue first.
- `library/`: we accept widget pull requests. Read
  [`library/CONTRIBUTING.md`](library/CONTRIBUTING.md).

---

**[A product of Million Views, LLC.](https://m5nv.com)**
