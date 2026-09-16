# Examples

Runnable demos of integrating with a conduit — buildless HTML/CSS/JS,
no framework, no build step. Nothing here is deployed as its own
service, but it isn't GitHub-only either: this whole directory is also
served live at `https://conduits.xyz`, so every page below is a real,
linkable URL, not just a local file —
e.g. `https://conduits.xyz/use-cases/widget-gallery/`.

[`widget-gallery/`](widget-gallery/README.md) has every widget in
[`../packages/widgets/`](../packages/widgets/README.md) in one place, wired to a conduit
URL you paste in — the fastest way to try all of them without editing
a file.

## For marketers — use a widget as-is

Real, brand-agnostic, copy-paste-ready widgets — not reference code —
live in [`../packages/widgets/`](../packages/widgets/README.md), not this directory.
`xyz-waitlist` and `xyz-reactions` today; see that directory's own
README for the full list and its shared `--xyz-*` theming vocabulary.

## For developers — build on the API

- [`basic-form/`](basic-form/README.md) /
  [`basic-ajax-form/`](basic-ajax-form/README.md) — the simplest
  possible reference, no framework, no build step. Copy the pattern.
- [`contact-validation-flow/`](contact-validation-flow/README.md) — the
  fuller QA harness: write, read, update, and RACM (per-method access
  control) end to end.
- **Automation recipe**: point a Zapier/n8n/Make webhook step directly
  at your conduit's own URL (`https://conduits.xyz/api/XXXXXXXX`), same
  as any other webhook target — no code, this already works. `POST`
  writes a row (`{fields: {...}}`); `GET` reads the sheet back, so the
  same tool can validate against existing data instead of only writing
  to it. See `docs/gateway-api.md` for the full request/response shapes.
- **Quickstart**: the two calls you actually need.

  ```js
  // Create a row
  await fetch(conduitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { name: 'Ada', done: false } }),
  })

  // Read them back
  const { records } = await fetch(conduitUrl).then((r) => r.json())
  ```
- Build the next widget yourself — every one above is plain HTML/JS,
  zero dependencies, copy and ship.

## Everything in this directory

- [`basic-form/`](basic-form/README.md) — a plain HTML form embed, no
  JavaScript required.
- [`basic-ajax-form/`](basic-ajax-form/README.md) — the same form,
  enhanced to submit via `fetch()` with inline status.
- [`widget-gallery/`](widget-gallery/README.md) — every widget in
  [`../packages/widgets/`](../packages/widgets/README.md), side by side, for trying them
  against a real conduit URL without editing files.
- [`contact-validation-flow/`](contact-validation-flow/README.md) — a
  fuller manual QA harness: write, update, and read through 3 conduits
  with different RACM settings, charted at the end.

The actual embeddable widgets (`xyz-waitlist`, `xyz-reactions`) live in
[`../packages/widgets/`](../packages/widgets/README.md), not here — see that directory's
own README.
