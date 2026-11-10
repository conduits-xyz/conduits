// <xyz-waitlist>: a first-name and email waitlist form that submits to
// a conduit. No dependencies or build step.
//
// An ES module. A browser loads modules only over http(s), not from a
// file:// page (the widgets' README says how to serve a folder).
//
//   <script type="module" src="./xyz-waitlist.js"></script>
//   <xyz-waitlist
//     conduit-url="https://run.conduits.xyz/<namespace>/<leaf>"
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

// Errors are RFC 9457 Problem Details (docs/gateway-api.md#errors). A
// 429 and 503 ask the visitor to wait (too many requests here; the
// conduit's source is busy); another 4xx shows its detail (e.g. a
// missing sheet column); another 5xx or a network failure gets a generic
// message.
async function describeSubmitFailure(response) {
  if (response.status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (response.status === 503) return 'The service is busy. Please try again in a minute.'
  if (response.status >= 400 && response.status < 500) {
    try {
      const problem = await response.json()
      const message = problem.detail || problem.title
      if (typeof message === 'string' && message) return message
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
    // Custom elements default to display: inline. Setting block here
    // keeps the layout from depending on style.css.
    this.style.display ||= 'block'
    this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
    this._errorText = null
    this._captionId = `xyz-waitlist-caption-${nextCaptionId++}`
    this._build()
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

  // The Idempotency-Key for a submit of `body`: the same key while the
  // same body is sent again after a failure, so a retry creates one
  // record (docs/gateway-api.md, "Idempotency keys"); a new one for
  // another body or after a success.
  _idempotencyKey(body) {
    if (this._lastSubmit?.body !== body) this._lastSubmit = { body, key: crypto.randomUUID() }
    return this._lastSubmit.key
  }

  async _submit(event) {
    event.preventDefault()
    if (this.demo || this._status === 'pending') return

    const form = event.currentTarget
    const firstName = form.elements.firstName.value
    const email = form.elements.email.value
    this._status = 'pending'
    this._errorText = null
    this._update()

    try {
      const body = JSON.stringify({ fields: { firstName, email } })
      const response = await fetch(this.conduitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': this._idempotencyKey(body) },
        body,
      })
      if (response.ok) {
        this._lastSubmit = null
        this._status = 'success'
        form.reset()
      } else {
        this._errorText = await describeSubmitFailure(response)
        this._status = 'error'
      }
    } catch {
      this._errorText = 'Something went wrong. Please try again.'
      this._status = 'error'
    }
    this._update()
  }

  // Builds the markup once, when the element connects. A change of
  // status updates it in place (_update), so a keyboard user keeps
  // their place, and what they typed, after an error.
  _build() {
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

    this.innerHTML = `
      <article class="xyz-waitlist-widget">
        ${this._renderCaption()}
        <form class="xyz-waitlist-row"${this.caption ? ` aria-labelledby="${this._captionId}"` : ''}>
          <input
            type="text"
            name="firstName"
            placeholder="First name"
            required
            autocomplete="given-name"
            aria-label="First name"
            class="xyz-waitlist-input xyz-waitlist-input--name"
          />
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
            aria-label="Email address"
            class="xyz-waitlist-input"
          />
          <button type="submit" class="xyz-waitlist-btn"></button>
          <p class="xyz-waitlist-status" role="status" aria-live="polite"></p>
        </form>
      </article>
    `
    this.querySelector('form').addEventListener('submit', (event) => this._submit(event))
    this._update()
  }

  // The form's state: in demo mode its controls are disabled; while a
  // signup is sent they only look it (read-only, aria-disabled), since
  // disabling the focused control would move the focus off it. Then the
  // button's label and the status line.
  _update() {
    const form = this.querySelector('form')
    if (!form) return
    const pending = this._status === 'pending'
    const button = form.querySelector('button')
    for (const input of form.querySelectorAll('input')) {
      input.disabled = this.demo
      input.readOnly = pending
    }
    button.disabled = this.demo
    button.setAttribute('aria-disabled', String(pending))
    button.textContent = this.demo || pending ? 'Joining…' : this.buttonText
    const status = form.querySelector('.xyz-waitlist-status')
    status.dataset.state = this.demo ? 'demo' : this._status
    status.textContent = this.demo ? 'Demo mode — submission disabled.' : this._status === 'success' ? this.successMessage : (this._errorText ?? '')
  }
}

customElements.define('xyz-waitlist', XyzWaitlist)
