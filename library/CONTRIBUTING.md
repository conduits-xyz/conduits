# Contributing to the library

The library accepts copy-ready, MIT-compatible widgets through pull requests.
The detail page is the default showcase, so a separate page is only needed
when the widget requires a page-level integration example.

## Submission steps

1. Add the widget under `library/widgets/<slug>/`.
2. Add `widget.json` using the minimal schema below.
3. Include a README, runnable widget files, a non-networked `demo.html`, and a
	 documented embed snippet.
4. Run `npm run validate:library` and the repository tests.
5. Open a pull request for maintainer review.

The repository is MIT-licensed. Contributions are accepted only when the
submitted widget and its included assets can be distributed under MIT. The
acceptance check verifies the repository license and maintainers review the
contribution's files and dependencies.

## Widget metadata

Contributor-supplied metadata is intentionally small:

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

### Widget identity

- `slug` is also the widget's custom element name in HTML.
- It must be unique across the library and follow the custom-element naming
	rules.
- The validator rejects duplicate slugs.
- A widget with the slug `my-widget` is embedded as
	`<my-widget></my-widget>`.

### Contributor attribution

- `author.name` is required.
- `author.social` is optional and may include up to three handles from
	`github`, `x`, and `bluesky`.
- Enter handles only, not profile URLs. The catalog constructs profile URLs
	for these networks, so handles are clickable without allowing
	contributor-supplied destinations.

### Discovery tags

- Tags are lowercase discovery labels, limited to five per item.
- Tags must describe the visitor's goal or the job the contribution helps
	someone complete. Prefer terms such as `contact-information`,
	`event-registration`, `rsvp`, `feedback`, or `order-form`.
- Follow the tag guidance in [`GUIDELINES.md`](GUIDELINES.md).

Do not use tags for implementation details or delivery mechanisms. Tags such
as `api`, `forms`, `javascript`, `react`, `html`, or `fetch` are not accepted;
describe the user's goal instead.

Do not add website URLs, license, status, trust, review-date, featured,
screenshot, source, or ranking fields. Those are either prohibited, enforced
by the repository, or maintained by Conduits and are not contributor claims.
