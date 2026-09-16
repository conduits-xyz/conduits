// <xyz-contact-form> — a name/email/message contact form backed by a
// real conduit. Zero dependencies, no build step: drop this file next
// to your page, add the element, done.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page, and this file has no import/export of its own — a classic
// <script> works identically and actually runs when opened directly
// from disk.
//
//   <script src="./xyz-contact-form.js"></script>
//   <xyz-contact-form
//     conduit-url="https://conduits.xyz/api/XXXXXXXX"
//     caption="Get in touch"
//   ></xyz-contact-form>
//
// See `static configFields` below for the full, authoritative list of
// optional attributes (caption, unconfigured-message, success-message,
// button-text, heading-level) — also what any config UI could
// read to build a form for this widget.
//
// `caption` — when set, the widget renders it itself and gives its
// own <form> an aria-labelledby pointing at it. Not a real heading by
// default: the widget can't know what heading level is correct
// wherever it lands. Set `heading-level` alongside it to opt in.
//
// Wire format: a message is `POST {fields: {name, email, message}}` —
// the same envelope every conduit accepts (see docs/gateway-api.md).
// Deliberately not configurable-fields: examples/basic-ajax-form's
// progressive-enhancement-over-a-plain-form pattern already covers
// "I need different fields." This is the single most common contact
// shape, built once, well.
//
// No CAPTCHA anywhere in this widget, unlike most contact-form
// guidance elsewhere, which treats one as an optional bolt-on —
// conduits.xyz's own honeypot + pass-if-match spam controls (gateway-
// level, already on for every conduit) make that unnecessary here.

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
  // <xyz-contact-form>, and each needs its own id for aria-labelledby to
  // resolve correctly.
  let nextCaptionId = 0

  // Any string interpolated into innerHTML that isn't a fixed literal in
  // this file's own template needs this first — see xyz-waitlist.js's
  // identical helper for why.
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

  class XyzContactForm extends HTMLElement {
    // See xyz-waitlist.js's identical static property for what this is
    // and how it's meant to be read.
    static configFields = [
      {
        attribute: 'conduit-url',
        label: 'Conduit',
        type: 'conduit-picker',
        default: null,
        requirement: 'required',
        description: 'Which conduit this widget submits messages to.',
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
        condition: 'Only used when Caption is also set.',
      },
      {
        attribute: 'unconfigured-message',
        label: 'Not-connected message',
        type: 'text',
        default: 'Not connected to a conduit yet.',
        requirement: 'optional',
      },
      {
        attribute: 'success-message',
        label: 'Success message',
        type: 'text',
        default: "Thanks — we'll get back to you.",
        requirement: 'optional',
      },
      {
        attribute: 'button-text',
        label: 'Button label',
        type: 'text',
        default: 'Send message',
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
      this._captionId = `xyz-contact-form-caption-${nextCaptionId++}`
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
      return this.getAttribute('success-message') || "Thanks — we'll get back to you."
    }

    get buttonText() {
      return this.getAttribute('button-text') || 'Send message'
    }

    _renderCaption() {
      if (!this.caption) return ''
      const headingAttrs = this.headingLevel
        ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
        : ''
      return `<p class="xyz-contact-form-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
    }

    async _submit(event) {
      event.preventDefault()
      if (this._status === 'pending') return

      const name = this.querySelector('input[name="name"]').value
      const email = this.querySelector('input[name="email"]').value
      const message = this.querySelector('textarea[name="message"]').value
      this._status = 'pending'
      this._errorText = null
      this._render()

      try {
        const response = await fetch(this.conduitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { name, email, message } }),
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
      // No conduit-url set yet (or not yet validated, in this file's own
      // demo page).
      if (!this.conduitUrl) {
        this.innerHTML = `
          <article class="xyz-contact-form-widget">
            ${this._renderCaption()}
            <p class="xyz-contact-form-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
          </article>
        `
        return
      }

      const pending = this._status === 'pending'
      const caption = this.caption

      this.innerHTML = `
        <article class="xyz-contact-form-widget">
          ${this._renderCaption()}
          <form class="xyz-contact-form-form"${caption ? ` aria-labelledby="${this._captionId}"` : ''}>
            <label class="xyz-contact-form-field">
              <span class="xyz-contact-form-label">Name</span>
              <input
                type="text"
                name="name"
                required
                autocomplete="name"
                class="xyz-contact-form-input"
                ${pending ? 'disabled' : ''}
              />
            </label>
            <label class="xyz-contact-form-field">
              <span class="xyz-contact-form-label">Email</span>
              <input
                type="email"
                name="email"
                required
                autocomplete="email"
                class="xyz-contact-form-input"
                ${pending ? 'disabled' : ''}
              />
            </label>
            <label class="xyz-contact-form-field">
              <span class="xyz-contact-form-label">Message</span>
              <textarea
                name="message"
                required
                rows="4"
                class="xyz-contact-form-input xyz-contact-form-textarea"
                ${pending ? 'disabled' : ''}
              ></textarea>
            </label>
            <button type="submit" class="xyz-contact-form-btn" ${pending ? 'disabled' : ''}>
              ${pending ? 'Sending…' : escapeHtml(this.buttonText)}
            </button>
            <p class="xyz-contact-form-status" data-state="${this._status}" role="status" aria-live="polite">${
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

  customElements.define('xyz-contact-form', XyzContactForm)
})()
