# Widget theme

All widgets use the same `--xyz-*` CSS custom properties.

## Theme all widgets

Set the properties on `:root`, or on an element that contains all the
widgets:

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

## Theme one widget

Set the properties on the widget's tag. Other widgets do not change:

```css
xyz-reactions {
  --xyz-accent: #176b87;
  --xyz-accent-fg: #ffffff;
}
```

## Properties

| Property | Controls | Default |
|:--|:--|:--|
| `--xyz-font` | The text and the controls of the widget. | `system-ui, sans-serif` |
| `--xyz-fg` | The main text and the text of unselected controls. | `#1a1a1a` |
| `--xyz-bg` | The background of inputs, buttons, and selectable controls. | `#ffffff` |
| `--xyz-border` | The borders of inputs and buttons, and unselected rating controls. | `#e0e0e0` |
| `--xyz-accent` | Focus outlines, selected controls, buttons, and rating stars. | `#a30020` |
| `--xyz-accent-fg` | The text on accent-colored controls. | `#ffffff` |
| `--xyz-error` | Error messages. | `crimson` |
| `--xyz-success` | Success messages. | `#1a7a3a` |
| `--xyz-radius` | The corner radius of inputs, buttons, and selectable controls. | `6px` |
| `--xyz-gap` | The space in the form or in a row of controls. | `10px`; `0.625rem` for `xyz-reactions` |

## How the values apply

Each widget uses `var(--xyz-name, default)` where it uses a property:

- A property that you do not set uses the widget's default.
- A value on `:root` or on a parent applies to all widgets in it.
- A value on one widget's tag applies to that widget only.

Font sizes, control heights, and internal spacing are not custom
properties. To change them, use the widget's scoped CSS classes. Load
each widget's `style.css`, as its README shows. The custom properties
change only the shared colors, font, radius, and gap.
