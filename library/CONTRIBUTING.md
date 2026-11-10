# Contributing to the library

The library accepts widgets through pull requests. Each widget must be
ready to copy and must be compatible with the MIT license.

## Submit a widget

1. Add the widget in `library/widgets/<slug>/`.
2. Add `widget.json`. See [Metadata](#metadata).
3. Add these files:
   - The widget's script and stylesheet.
   - `demo.html`, which sends no requests.
   - A README with an embed snippet, the attributes, and the conduit
     setup.
4. Make sure that the widget obeys [`GUIDELINES.md`](GUIDELINES.md).
5. Run `npm run validate:library` and `npm test`.
6. Open a pull request. A maintainer reviews it.

The widget detail page is the showcase. Add a page in `library/pages/`
only when the widget needs an example of page-level integration.

## License

The repository has the MIT license. We accept a widget only when the
widget and all its assets can be distributed under MIT. Maintainers
review the files and the dependencies.

## Metadata

`widget.json` contains only these fields:

```json
{
  "slug": "my-widget",
  "name": "My widget",
  "kind": "widget",
  "description": "A short description of what it helps someone do.",
  "tags": ["contact-information", "feedback"],
  "author": {
    "name": "Your name",
    "social": {
      "github": "your-github-handle",
      "x": "your-x-handle"
    }
  },
  "demo": "demo.html"
}
```

| Field | Rules |
|:--|:--|
| `slug` | The custom element name, for example `my-widget` for `<my-widget>`. Lowercase words and hyphens, with at least one hyphen. Unique in the library. |
| `name` | Required. 80 characters or fewer. |
| `kind` | `"widget"`. |
| `description` | Required. 280 characters or fewer. |
| `tags` | 1 to 5 tags. See [Tags](#tags). |
| `author.name` | Required. |
| `author.social` | Optional. Up to three of `github`, `x`, `bluesky`. Give handles, not URLs. The catalog makes the profile links. |
| `demo` | `"demo.html"`. |

Do not add other fields, for example a website, a license, a status,
or a screenshot. The validator refuses them.

### Tags

A tag tells what the visitor wants to do, for example
`contact-information`, `event-registration`, `rsvp`, `feedback`, or
`order-form`.

- Use lowercase words separated by single hyphens, 32 characters or
  fewer.
- Do not repeat a tag.
- Do not use these tags: `api`, `forms`, `javascript`, `react`, `html`,
  `fetch`, `static`. They describe how the widget works, not what the
  visitor wants. The validator refuses them.

See [`GUIDELINES.md`](GUIDELINES.md#tags).
