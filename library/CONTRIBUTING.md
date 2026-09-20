# Contributing a widget

The library accepts copy-ready widgets through pull requests to the Conduits repository. Community submissions must include the widget and its runnable demo; a separate showcase example is optional when the widget detail page is sufficient. Examples are not submitted independently.

1. Fork the repository.
2. Add the widget under `library/widgets/<slug>/`.
3. Add `widget.json` metadata.
4. Add a README, runnable files, a non-networked `demo.html`, and a documented embed snippet. A static screenshot is optional fallback material.
6. Add contributor attribution to `widget.json`:

	 ```json
	 "author": {
		 "name": "Your name",
		 "url": "https://example.com",
		 "twitter": "yourhandle",
		 "websiteTitle": "Your site",
		 "websiteUrl": "https://example.com"
	 }
	 ```

	 `name` is required. The other fields are optional and appear as attribution on the widget card.
7. Review [`GUIDELINES.md`](GUIDELINES.md) and complete the pull request checklist.
8. Open a pull request for maintainer review.

Approved community widgets are published with the `Verified Community` badge. Read the full requirements before starting.
