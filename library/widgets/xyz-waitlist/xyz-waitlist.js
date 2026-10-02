// <xyz-waitlist>: a first-name and email waitlist form that submits to
// a conduit. No dependencies or build step.
//
// A classic script, not a module: Chromium blocks module scripts on
// file:// pages.
//
//   <script src="./xyz-waitlist.js"></script>
//   <xyz-waitlist
//     conduit-url="https://conduits.xyz/XXXXXXXX"
//     caption="Join our premium waitlist"
//   ></xyz-waitlist>
//
// `static configFields` below lists the attributes.
//
// `caption` is rendered by the widget and labels its <form>
// (aria-labelledby). It is a heading only when `heading-level` is set,
// which adds role="heading" and aria-level: only the host page knows its
// outline.
//
// A signup is `POST {fields: {firstName, email}}` (docs/gateway-api.md).
// To show a signup count, GET conduit-url from your page.

// Wrapped in an IIFE: classic scripts share one global scope, so a
// top-level name also declared by another xyz-* widget would be a
// SyntaxError that stops the second widget from loading.
;(function () {
  // Per instance, so captions get unique ids on a page with several
  // <xyz-waitlist> elements.
  let nextCaptionId = 0

  // Escapes attribute-supplied text (caption, messages, button text)
  // before it goes into innerHTML.
  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    )
  }

  // A 4xx response's message is shown as is (e.g. a missing sheet
  // column); a 5xx or network failure gets a generic message.
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
    // The element's attributes, for a config UI to read from
    // customElements.get('xyz-waitlist').configFields. Kept in step with
    // the getters below by hand.
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
      // Custom elements default to display: inline. Setting block here,
      // before first paint, keeps the layout from depending on style.css.
      this.style.display ||= 'block'
      this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
      this._errorText = null
      this._captionId = `xyz-waitlist-caption-${nextCaptionId++}`
      this._render()
    }

    get conduitUrl() {
      return this.getAttribute('conduit-url') || ''
    }

    get demo() {
      return this.hasAttribute('demo')
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

    // Shown both with the form and with the not-connected message.
    _renderCaption() {
      if (!this.caption) return ''
      const headingAttrs = this.headingLevel
        ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
        : ''
      return `<p class="xyz-waitlist-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
    }

    async _submit(event) {
      event.preventDefault()
      if (this.demo || this._status === 'pending') return

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
      // <article>: a self-contained component (the HTML spec gives "a
      // widget" as an example).

      // No conduit-url yet, or, on the demo page, not yet checked.
      if (!this.conduitUrl && !this.demo) {
        this.innerHTML = `
          <article class="xyz-waitlist-widget">
            ${this._renderCaption()}
            <p class="xyz-waitlist-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
          </article>
        `
        return
      }

      const pending = this.demo || this._status === 'pending'
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
            <p class="xyz-waitlist-status" data-state="${this.demo ? 'demo' : this._status}" role="status" aria-live="polite">${
              this.demo ? 'Demo mode — submission disabled.' : this._status === 'success' ? escapeHtml(this.successMessage) : escapeHtml(this._errorText ?? '')
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
