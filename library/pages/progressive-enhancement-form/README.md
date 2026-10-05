# Progressive enhancement form

One form, sent in two ways:

- **Plain**: a `<form method="post">`. It works without JavaScript.
- **Enhanced**: the same form, sent with `fetch()`. The page shows the
  result and does not go to a different page.

To compare them, enter a conduit URL in the page. Turn "Enhance with
JavaScript" off and on, and send the form each time.

## Run it

Open `index.html` in a browser. Enter a conduit URL or a CURI in the
Conduit URL field.

In your own page, do not use the Conduit URL field. Put your conduit
URL in the form's `action` (plain), or in the `fetch()` call
(enhanced).

## Plain submission

The gateway accepts `application/x-www-form-urlencoded`. A plain field
name, for example `name`, goes into `fields`. You do not need the
`fields` envelope.

Without `_redirect`, the browser shows the gateway's JSON response. Use
that only for tests. In production, add a hidden `_redirect` field with
a path on your site:

```html
<input type="hidden" name="_redirect" value="/thanks" />
```

After a successful submission, the gateway sends the browser to that
path (`303`). These rules apply:

- The path must be on the same origin as the form's page. The gateway
  uses the `Referer` header to check this. Thus a public conduit
  cannot send visitors to another site.
- Without a `Referer`, the gateway returns JSON. A `file://` page sends
  no `Referer`, so this demo has no `_redirect` field.

## Enhanced submission

The page sends JSON with the `fields` envelope: `{fields: {...}}`. The
gateway returns `201 {id, createdTime, fields}`. Copy the `fetch()`
call in `index.html` for your own widget.

## Theme

The form uses the same `--xyz-*` CSS custom properties as the widgets
(see [`THEME.md`](../../widgets/THEME.md)). Set them on `:root` to style
all forms and widgets. Set them on `.xyz-form` to style one form:

```css
.xyz-form {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```
