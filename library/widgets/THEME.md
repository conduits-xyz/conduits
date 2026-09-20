# Widget theme

Every widget in this directory uses the same `--xyz-*` custom-property
vocabulary. Set these properties on `:root` or on an ancestor shared by
the widgets you embed to apply one theme across the page.

```css
:root {
  --xyz-font: "Avenir Next", sans-serif;
  --xyz-fg: #1a1a1a;
  --xyz-bg: #ffffff;
  --xyz-border: #e0e0e0;
  --xyz-accent: #a30020;
  --xyz-accent-fg: #ffffff;
  --xyz-error: crimson;
  --xyz-success: #1a7a3a;
  --xyz-radius: 6px;
  --xyz-gap: 10px;
}
```

A one-off widget can be themed directly on its custom-element tag:

```css
xyz-contact-form {
  --xyz-accent: #2563eb;
  --xyz-accent-fg: #ffffff;
  --xyz-radius: 12px;
}
```

The widgets use `var(--xyz-name, fallback)` at each point where a property
is used. This means an unset property gets the widget's default, a value
inherited from `:root` or another ancestor applies to all descendant
widgets, and a value set directly on one widget overrides the inherited
value for that widget only. The widget stylesheets do not declare defaults
on the custom-element selector, because doing so would prevent inherited
`:root` values from taking effect.

## Properties

| Property | Controls | Typical default |
|---|---|---|
| `--xyz-font` | Widget text and controls that inherit the widget font | `system-ui, sans-serif` |
| `--xyz-fg` | Main text and unselected control text | `#1a1a1a` |
| `--xyz-bg` | Input, button, and selectable-control backgrounds | `#ffffff` |
| `--xyz-border` | Input borders, button borders, and unselected rating controls | `#e0e0e0` |
| `--xyz-accent` | Focus outlines, selected controls, buttons, and rating stars | `#a30020` |
| `--xyz-accent-fg` | Text on accent-colored controls | `#ffffff` |
| `--xyz-error` | Error status messages | `crimson` |
| `--xyz-success` | Success status messages | `#1a7a3a` |
| `--xyz-radius` | Input, button, and selectable-control corner radius | `6px` |
| `--xyz-gap` | Main form or control-row spacing | `10px`; `0.625rem` for reactions |

The exact fallback remains in each widget stylesheet, so a widget can use a
slightly different spacing default while still accepting the same shared
property. Fixed typography sizes, control heights, and internal spacing are
not custom properties; they are part of each widget's layout and can be
changed with the widget's documented, scoped CSS classes when a host needs a
more extensive visual customization.

## Widget examples

Theme every widget together:

```css
:root {
  --xyz-font: "Avenir Next", sans-serif;
  --xyz-fg: #202124;
  --xyz-bg: #fffdf8;
  --xyz-border: #c9c2b8;
  --xyz-accent: #176b87;
  --xyz-accent-fg: #ffffff;
  --xyz-error: #b42318;
  --xyz-success: #18794e;
  --xyz-radius: 8px;
  --xyz-gap: 12px;
}
```

Theme only one widget while leaving the rest unchanged:

```css
xyz-reactions {
  --xyz-accent: #176b87;
  --xyz-accent-fg: #ffffff;
}
```

The same properties work with `xyz-waitlist`, `xyz-contact-form`,
`xyz-feedback`, `xyz-reactions`, and `xyz-rsvp`. Load each widget's own
`style.css` as documented in its README; the custom properties control the
shared visual contract, while the widget stylesheet supplies the scoped
layout and component-specific styling.
