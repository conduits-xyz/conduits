# Fetch-enhanced form widget

The same form as [`../basic-form`](../basic-form/README.md), enhanced
to submit via `fetch()` as JSON and show inline success/error status
without navigating away.

## Running it

Open `index.html` directly in a browser, or copy it into your own page
and point the fetch target at your conduit's URL.

## Wire format

Sends real JSON with the `fields` envelope explicitly — `{fields:
{...}}` — and a create response comes back as
`{id, createdTime, fields}`. Copy its `fetch()` call directly if
you're building your own widget against a conduit.

## Theming

Styled entirely through CSS custom properties on the `.xyz-form`
element (`style.css`) — the same `--xyz-*` vocabulary
`packages/widgets/xyz-waitlist` and `packages/widgets/xyz-reactions` share. Set them
once, on `:root` or any ancestor common to everything you embed, and
your whole brand applies across every form and widget at once — or
override on the element itself for a one-off:

```css
.xyz-form {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```

See `style.css` for the full list of available properties.
