# Widget gallery

Every widget in [`../packages/widgets/`](../../packages/widgets/README.md), plus this
directory's own reference forms, in one place — each wired to its own
conduit URL you paste in, for trying all of them quickly without
editing any files: [`basic-form`](../basic-form/README.md) and
[`basic-ajax-form`](../basic-ajax-form/README.md) side by side in
iframes, plus real
[`<xyz-waitlist>`](../../packages/widgets/xyz-waitlist/README.md) and
[`<xyz-reactions>`](../../packages/widgets/xyz-reactions/README.md) custom
elements rendered directly on the page.

A conduit URL is bound to one sheet tab, permanently — so one URL
can't drive widgets that write different-shaped rows. This page has
three tabs, one per widget group, each with its own "Conduit URL"
field:

1. **Contact form** — shared by the plain and fetch-enhanced forms;
    the custom-element example also demonstrates the built-in
    `qualified-lead` preset, which writes `name`/`email`/`message`/
    `services`/`budget`.
2. **Waitlist widget** — writes `firstName`/`email`.
3. **Reactions widget** — writes `subject`/`reaction`/`votedAt`.

Set up a conduit for each (with those columns already in its sheet —
add them directly to the sheet if they're missing) and paste each
one's own ID into its tab.

## Running it

Open `index.html` directly in a browser. Paste each conduit's own ID
(its curi — see `conduit-url-input.js` in
the parent directory) into its tab's field; the contact-form tab's two
iframes pick theirs up via `postMessage`, and the waitlist/reactions
custom elements are recreated with the resolved URL set as their own
`conduit-url` attribute.

That wiring is a demo convenience only — a real embed skips it and just
hardcodes the widget's own conduit URL directly (the form's `action`
for the plain widget, the fetch target for the enhanced one, the
`conduit-url` attribute for the two custom elements).
