# Progressive enhancement form

One real form, submitted two different ways — a native `<form
method="post">` that works with zero JavaScript, and the same form
enhanced with `fetch()` to submit in the background and report
success or failure inline instead of navigating away. Paste a real
conduit into the page and try both: toggle "Enhance with JavaScript"
off and on, then submit again, to see the exact same markup behave
differently depending only on whether the enhancement is present.

## Running it

Open `index.html` directly in a browser and paste a real conduit's URL
or curi into the Conduit URL field, or copy the file into your own
page. For a real embed, don't rely on the Conduit URL picker this demo
page uses to try different conduits — hardcode your own conduit's URL
directly, either as the form's static `action` (for the plain path) or
as the `fetch()` target (for the enhanced path).

## Wire format

**Plain submission** (JavaScript disabled, or "Enhance with
JavaScript" unchecked): the gateway accepts
`application/x-www-form-urlencoded` directly — a bare field name like
`name` is treated as that field, no `fields` envelope required. By
default, a plain submission lands the visitor on the gateway's own raw
JSON response — fine for testing, not what you want in production.
Add a hidden `_redirect` field naming a path on your own site
(relative or absolute) and a successful submission sends the visitor
there instead, as a real 303 redirect:

```html
<input type="hidden" name="_redirect" value="/thanks" />
```

The target must resolve to the same origin as the page the form was
submitted from (checked against the request's `Referer` header) — this
is what stops `_redirect` from being usable as an open redirect
through a conduit URL that's otherwise public. Point it anywhere else,
or omit the `Referer` header entirely (as a `file://` page does, which
is why this demo doesn't include the field), and the submission falls
back to the plain JSON response instead of guessing.

**Enhanced submission** ("Enhance with JavaScript" checked): sends
real JSON with the `fields` envelope explicitly — `{fields: {...}}` —
and a create response comes back as `{id, createdTime, fields}`. Copy
the `fetch()` call in `index.html` directly if you're building your
own widget against a conduit.

## Theming

Styled entirely through CSS custom properties on the `.xyz-form`
element (`style.css`) — the same `--xyz-*` vocabulary
`library/widgets/xyz-waitlist` and `library/widgets/xyz-reactions`
share. Set them once, on `:root` or any ancestor common to everything
you embed, and your whole brand applies across every form and widget
at once — or override on the element itself for a one-off:

```css
.xyz-form {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```

See `style.css` for the full list of available properties.
