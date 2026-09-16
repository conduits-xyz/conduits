// <xyz-waitlist> — a first-name-and-email waitlist form backed by a
// real conduit. Zero dependencies, no build step: drop this file next
// to your page, add the element, done.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page, and this file has no import/export of its own — a classic
// <script> works identically and actually runs when opened directly
// from disk.
//
//   <script src="./xyz-waitlist.js"></script>
//   <xyz-waitlist
//     conduit-url="https://conduits.xyz/api/XXXXXXXX"
//     caption="Join our premium waitlist"
//   ></xyz-waitlist>
//
// See `static configFields` below for the full, authoritative list of
// optional attributes (caption, unconfigured-message, success-message,
// button-text, heading-level) — this is also what any config UI could
// read to build a form for this widget, by loading this
// script and inspecting `customElements.get('xyz-waitlist').configFields`.
//
// `caption` — when set, the widget renders it itself and gives its
// own <form> an aria-labelledby pointing at it, so the widget owns
// the "this text labels that control" relationship instead of every
// embedder reconstructing it. Not a real heading by default: the
// widget has no way to know what heading level is correct wherever it
// lands, and guessing risks clobbering the host page's own outline.
// Set `heading-level` alongside it to opt in — the caption then also
// gets `role="heading" aria-level="{heading-level}"`, so *you* (the
// only party that actually knows your own document's outline) decide
// the level, not the widget.
//
// Wire format: a signup is `POST {fields: {firstName, email}}` — the
// same envelope every conduit accepts (see docs/gateway-api.md). This
// element only ever handles the form itself; a running signup count
// (if you want one shown next to it) is a plain `GET conduit-url` your
// own page renders however it likes.

// Everything below is wrapped in an IIFE deliberately — this is a
// classic (non-module) script by design (see the top of this file),
// and classic scripts share ONE global lexical scope across every
// <script> tag on the page. A host embedding more than one xyz-*
// widget (examples/widget-gallery does, all five
// at once) loads more than one of these files together — without this
// wrapper, a top-level `let`/`const`/`class` declared here with the
// same name as one in another widget's file throws a SyntaxError the
// moment the second script parses, silently killing that widget
// (customElements.define never runs, connectedCallback never fires)
// with no visible error unless something happens to already be
// listening for uncaught exceptions. The IIFE gives this file's own
// top-level names a real, isolated scope, so nothing here can ever
// collide with another widget's file again, regardless of what either
// file declares at its own top level in the future.
;(function () {
  // Unique per instance, not per class — a page can embed more than one
  // <xyz-waitlist>, and each needs its own id for aria-labelledby to
  // resolve correctly.
  let nextCaptionId = 0

  // Any string interpolated into innerHTML that isn't a fixed literal in
  // this file's own template needs this first — caption/messages/button
  // text are all attribute values a caller sets, and an unescaped '<' or
  // '&' breaks rendering outright (the browser tries to parse whatever
  // follows as markup); a value shaped like <img onerror=...> executes
  // as script. Same fix needed regardless of who set the value.
  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    )
  }

  // A 4xx response's own message is shown as-is (e.g. a missing sheet
  // column); a 5xx or network failure shows a generic message instead.
  async function describeSubmitFailure(response) {
    if (response.status >= 400 && response.status < 500) {
      try {
        const body = await response.json()
        if (typeof body.error === 'string' && body.error) return body.error
      } catch {
        // Fall through to the generic message below.
      }
    }
    return 'Something went wrong. Please try again.'
  }

  class XyzWaitlist extends HTMLElement {
    // The authoritative, machine-readable list of this widget's own
    // optional configuration surface — everything except `conduit-url`
    // itself (wiring, not cosmetic config) is described here. Read this
    // by loading this script and inspecting
    // `customElements.get('xyz-waitlist').configFields`; kept next to
    // the getters below by hand, not generated, so it can never drift
    // from what this file actually does without a test catching it.
    static configFields = [
      {
        attribute: 'conduit-url',
        label: 'Conduit',
        type: 'conduit-picker',
        default: null,
        requirement: 'required',
        description: 'Which conduit this widget submits signups to.',
      },
      {
        attribute: 'caption',
        label: 'Caption',
        type: 'text',
        default: '',
        requirement: 'optional',
        description: "Optional label shown above the form; also becomes the form's accessible name.",
      },
      {
        attribute: 'heading-level',
        label: 'Caption heading level',
        type: 'number',
        default: null,
        requirement: 'conditional',
        condition:
          'Only used when Caption is also set. Renders the caption as an accessible heading of this level (matching your own page\'s outline) instead of plain labeled text.',
      },
      {
        attribute: 'unconfigured-message',
        label: 'Not-connected message',
        type: 'text',
        default: 'Not connected to a conduit yet.',
        requirement: 'optional',
        description: 'Shown instead of the form before a conduit is wired up.',
      },
      {
        attribute: 'success-message',
        label: 'Success message',
        type: 'text',
        default: "You're on the list — we'll be in touch.",
        requirement: 'optional',
        description: 'Shown after a successful signup.',
      },
      {
        attribute: 'button-text',
        label: 'Button label',
        type: 'text',
        default: 'Join the waitlist',
        requirement: 'optional',
      },
    ]

    connectedCallback() {
      // An unknown/undefined custom element defaults to `display: inline`
      // in the UA stylesheet — without this, the very first paint renders
      // this element (and its not-yet-laid-out contents) inline, then
      // visibly snaps to the real block layout once style.css finishes
      // loading. Setting it inline here, first thing, makes this widget
      // correct on its own — a host page's stylesheet must never need to
      // know or care that this element needs `display: block`. An inline
      // style always wins over any stylesheet (loaded or not), no
      // `!important` needed, and this runs synchronously before first
      // paint: this <script> tag is a classic, blocking script placed
      // before this element in the host's markup, so the parser has
      // already defined this class by the time it reaches the tag.
      this.style.display ||= 'block'
      this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
      this._errorText = null
      this._captionId = `xyz-waitlist-caption-${nextCaptionId++}`
      this._render()
    }

    get conduitUrl() {
      return this.getAttribute('conduit-url') || ''
    }

    get caption() {
      return this.getAttribute('caption') || ''
    }

    get headingLevel() {
      return this.getAttribute('heading-level') || ''
    }

    get unconfiguredMessage() {
      return this.getAttribute('unconfigured-message') || 'Not connected to a conduit yet.'
    }

    get successMessage() {
      return this.getAttribute('success-message') || "You're on the list — we'll be in touch."
    }

    get buttonText() {
      return this.getAttribute('button-text') || 'Join the waitlist'
    }

    // The caption markup is identical whether the form is showing or
    // the not-connected message is — rendered in both, so a caller can
    // render this widget unconditionally (conduit-url set or not) and
    // still always see its own caption.
    _renderCaption() {
      if (!this.caption) return ''
      const headingAttrs = this.headingLevel
        ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
        : ''
      return `<p class="xyz-waitlist-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
    }

    async _submit(event) {
      event.preventDefault()
      if (this._status === 'pending') return

      const firstName = this.querySelector('input[name="firstName"]').value
      const email = this.querySelector('input[name="email"]').value
      this._status = 'pending'
      this._errorText = null
      this._render()

      try {
        const response = await fetch(this.conduitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { firstName, email } }),
        })
        if (response.ok) {
          this._status = 'success'
        } else {
          this._errorText = await describeSubmitFailure(response)
          this._status = 'error'
        }
      } catch {
        this._errorText = 'Something went wrong. Please try again.'
        this._status = 'error'
      }
      this._render()
    }

    _render() {
      // A real sectioning element as this widget's own root, not a bare
      // light-DOM blob — <article> here specifically: a complete, self-
      // contained, independently reusable thing, matching the HTML
      // spec's own definition (it names "a widget" as an example). Gives
      // this widget a real landmark boundary regardless of where it
      // lands, and explicit license for its own internal markup (the
      // caption, the form) to exist without reading as presumptuous
      // toward whatever page it's embedded in.

      // No conduit-url set yet (or not yet validated, in this file's own
      // demo page).
      if (!this.conduitUrl) {
        this.innerHTML = `
          <article class="xyz-waitlist-widget">
            ${this._renderCaption()}
            <p class="xyz-waitlist-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
          </article>
        `
        return
      }

      const pending = this._status === 'pending'
      const caption = this.caption

      this.innerHTML = `
        <article class="xyz-waitlist-widget">
          ${this._renderCaption()}
          <form class="xyz-waitlist-row"${caption ? ` aria-labelledby="${this._captionId}"` : ''}>
            <input
              type="text"
              name="firstName"
              placeholder="First name"
              required
              autocomplete="given-name"
              aria-label="First name"
              class="xyz-waitlist-input xyz-waitlist-input--name"
              ${pending ? 'disabled' : ''}
            />
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              autocomplete="email"
              aria-label="Email address"
              class="xyz-waitlist-input"
              ${pending ? 'disabled' : ''}
            />
            <button type="submit" class="xyz-waitlist-btn" ${pending ? 'disabled' : ''}>
              ${pending ? 'Joining…' : escapeHtml(this.buttonText)}
            </button>
            <p class="xyz-waitlist-status" data-state="${this._status}" role="status" aria-live="polite">${
              this._status === 'success' ? escapeHtml(this.successMessage) : escapeHtml(this._errorText ?? '')
            }</p>
          </form>
        </article>
      `

      const form = this.querySelector('form')
      form.addEventListener('submit', (event) => this._submit(event))
      if (this._status === 'success') form.reset()
    }
  }

  customElements.define('xyz-waitlist', XyzWaitlist)
})()
