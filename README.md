# Conduits

The open-source gateway that turns Google Sheets, Gmail, or a Fastmail
inbox into a real REST API — rate limiting, IP allowlists, spam
honeypots, and bearer-token gating built in, no backend of your own to
write.

# What's in this repo

- **The gateway** (`packages/gateway`) — the request pipeline: RACM/
  allowlist/throttle/bearer-token enforcement, hidden-form-field
  spam controls, the wire API described in
  [`docs/gateway-api.md`](docs/gateway-api.md). MIT-licensed.
- **Every provider integration** (`packages/conduit`) — Google Sheets,
  Gmail, and Fastmail source clients. See
  [`packages/conduit/INTEGRATIONS.md`](packages/conduit/INTEGRATIONS.md)
  for how to add another.
- **Config and auth tooling** (`packages/config`,
  `services/gateway`) — compiles a human-facing `conduits.yaml` into
  the gateway's own config, plus the CLI that authorizes Google
  (`conduits auth google`) and runs the service (`conduits gateway`).
  No database.
- **The `xyz-*` widgets** (`packages/widgets`) — zero-dependency,
  framework-free custom elements (waitlist signup, reactions, contact
  form, feedback, RSVP) — copy the script tag onto any page.
- **`examples/`** — reference demos and QA harnesses to build on.

Point `services/gateway` at your own `conduits.yaml`, your own Fastmail
token or Google OAuth client, and it runs standalone.

# Using it

[`services/gateway/README.md`](services/gateway/README.md) — the
fastest path to a running gateway: copy `conduits.example.yaml`, set a
few environment variables (or run `conduits auth google` for Sheets/
Gmail), and start the service. No database.

[`docs/gateway-api.md`](docs/gateway-api.md) — the wire contract every
conduit exposes (routes, record shape, access control), independent of
who's running the gateway.

[`docs/developer-guide.md`](docs/developer-guide.md) — building a
client against a conduit: widgets, custom pages, or scripts.

# Development

This repository is organized as an npm workspaces monorepo:

- `services/` — deployable backend processes, configured via YAML,
  no UI of their own. See [`services/README.md`](services/README.md).
- `packages/` — shared libraries: `gateway` (the request pipeline),
  `conduit` (provider integrations), `config` (the YAML compiler),
  `widgets` (copy-paste custom elements).
- `examples/` — runnable demos and reference code to build *on*, not
  copy as-is.

## Getting started

```sh
npm install                          # every workspace
npm test                             # fast tests, every workspace
npm run test:all                     # + any browser/e2e tests
npm run typecheck                    # every workspace

cd services/gateway
cp conduits.example.yaml conduits.yaml
# fill in conduits.yaml and the env vars it references — see
# services/gateway/README.md
npm run gateway
```

# Contribution

This project isn't accepting unsolicited pull requests. Please open an
issue first if you'd like to propose a feature or change.

---

**[A product of Million Views, LLC.](https://m5nv.com)**
