# Pages

Runnable tutorials in integrating with a conduit — buildless HTML/CSS/JS,
no framework, no build step. These pages are source you're meant to read
and adapt, not embed as-is — for the drop-in, embeddable widgets, see
`../widgets/`.

## For marketers — use a widget as-is

Real, brand-agnostic, copy-paste-ready widgets — not reference code —
live in [`../widgets/`](../widgets/README.md), not this directory. See
that directory's README for the full list and its shared `--xyz-*`
theming vocabulary.

## For developers — build on the API

- [`progressive-enhancement-form/`](progressive-enhancement-form/README.md)
  — the simplest possible reference: one real form, submitted with
  zero JavaScript or enhanced with `fetch()`, toggleable live against
  a real conduit. Copy the pattern.
- [`contact-validation-flow/`](contact-validation-flow/README.md) — the
  fuller tutorial: composing write, read, and update conduits with
  different RACM (per-method access control) settings into one
  moderated submission flow.
- **Automation recipe**: point a Zapier/n8n/Make webhook step directly
  at your conduit's own URL (`https://conduits.xyz/XXXXXXXX`), same
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

- [`progressive-enhancement-form/`](progressive-enhancement-form/README.md)
  — one real form, submitted either as a plain HTML `<form>` with no
  JavaScript, or enhanced with `fetch()` for an inline result — toggle
  it live to see the same markup behave both ways.
- [`contact-validation-flow/`](contact-validation-flow/README.md) — a
  fuller tutorial: write, update, and read through 3 conduits with
  different RACM settings, composed into a moderated submission flow
  and charted at the end.

The actual embeddable widgets live in [`../widgets/`](../widgets/README.md).
Their detail pages are the interactive showcase and demo entry points.
