// <xyz-rsvp>: a name, email and attendance form stored in a conduit.
// No dependencies or build step.
//
// An ES module. A browser loads modules only over http(s), not from a
// file:// page (the widgets' README says how to serve a folder).
//
//   <script type="module" src="./xyz-rsvp.js"></script>
//   <xyz-rsvp
//     conduit-url="https://run.conduits.xyz/<namespace>/<leaf>"
//     caption="RSVP for our launch party"
//   ></xyz-rsvp>
//
// `static configFields` below lists the attributes.
//
// `caption` is rendered by the widget and labels its <form>
// (aria-labelledby). It is a heading only when `heading-level` is set:
// only the host page knows its outline.
//
// `attending` is "yes", "no" or "maybe"; the guest count is asked only
// after "yes".
//
// Submits `POST {fields: {name, email, attending, guestCount}}`
// (docs/gateway-api.md). `guestCount` is null unless attending is "yes"
// and a count was entered.

// Per instance, so captions get unique ids on a page with several
// <xyz-rsvp> elements.
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

class XyzRsvp extends HTMLElement {
  // The element's attributes, for a config UI (see xyz-waitlist.js).
  static configFields = [
    {
      attribute: 'conduit-url',
      label: 'Conduit',
      type: 'conduit-picker',
      default: null,
      requirement: 'required',
      description: 'Which conduit this widget submits RSVPs to.',
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
      default: 'Thanks — your RSVP is in.',
      requirement: 'optional',
    },
    {
      attribute: 'button-text',
      label: 'Button label',
      type: 'text',
      default: 'Send RSVP',
      requirement: 'optional',
    },
  ]

  connectedCallback() {
    // Custom elements default to display: inline. Setting block here
    // keeps the layout from depending on style.css.
    this.style.display ||= 'block'
    this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
    this._errorText = null
    this._captionId = `xyz-rsvp-caption-${nextCaptionId++}`
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
    return this.getAttribute('success-message') || 'Thanks — your RSVP is in.'
  }

  get buttonText() {
    return this.getAttribute('button-text') || 'Send RSVP'
  }

  _renderCaption() {
    if (!this.caption) return ''
    const headingAttrs = this.headingLevel
      ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
      : ''
    return `<p class="xyz-rsvp-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
  }

  // Shows the guest count only after "Yes".
  _onAttendingChange() {
    const attending = this.querySelector('input[name="attending"]:checked')?.value
    const guestField = this.querySelector('.xyz-rsvp-guest-field')
    const guestInput = this.querySelector('input[name="guestCount"]')
    const showGuestCount = attending === 'yes'
    guestField.hidden = !showGuestCount
    if (!showGuestCount) guestInput.value = ''
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
    const name = form.elements.name.value
    const email = form.elements.email.value
    const attending = form.querySelector('input[name="attending"]:checked')?.value
    if (!attending) return
    const guestCountRaw = form.elements.guestCount.value
    const guestCount = attending === 'yes' && guestCountRaw !== '' ? Number(guestCountRaw) : null

    this._status = 'pending'
    this._errorText = null
    this._update()

    try {
      const body = JSON.stringify({ fields: { name, email, attending, guestCount } })
      const response = await fetch(this.conduitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': this._idempotencyKey(body) },
        body,
      })
      if (response.ok) {
        this._lastSubmit = null
        this._status = 'success'
        form.reset()
        this._onAttendingChange()
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
    // No conduit-url yet, or, on the demo page, not yet checked.
    if (!this.conduitUrl && !this.demo) {
      this.innerHTML = `
        <article class="xyz-rsvp-widget">
          ${this._renderCaption()}
          <p class="xyz-rsvp-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
        </article>
      `
      return
    }

    this.innerHTML = `
      <article class="xyz-rsvp-widget">
        ${this._renderCaption()}
        <form class="xyz-rsvp-form"${this.caption ? ` aria-labelledby="${this._captionId}"` : ''}>
          <label class="xyz-rsvp-field">
            <span class="xyz-rsvp-label">Name</span>
            <input
              type="text"
              name="name"
              required
              autocomplete="name"
              class="xyz-rsvp-input"
            />
          </label>
          <label class="xyz-rsvp-field">
            <span class="xyz-rsvp-label">Email</span>
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              class="xyz-rsvp-input"
            />
          </label>
          <fieldset class="xyz-rsvp-field xyz-rsvp-attending-fieldset">
            <legend class="xyz-rsvp-label">Will you attend?</legend>
            <label class="xyz-rsvp-attending-choice">
              <input type="radio" name="attending" value="yes" required />
              Yes
            </label>
            <label class="xyz-rsvp-attending-choice">
              <input type="radio" name="attending" value="no" required />
              No
            </label>
            <label class="xyz-rsvp-attending-choice">
              <input type="radio" name="attending" value="maybe" required />
              Maybe
            </label>
          </fieldset>
          <label class="xyz-rsvp-field xyz-rsvp-guest-field" hidden>
            <span class="xyz-rsvp-label">Guests joining you (optional)</span>
            <input
              type="number"
              name="guestCount"
              min="0"
              step="1"
              class="xyz-rsvp-input"
            />
          </label>
          <button type="submit" class="xyz-rsvp-btn"></button>
          <p class="xyz-rsvp-status" role="status" aria-live="polite"></p>
        </form>
      </article>
    `
    this.querySelector('form').addEventListener('submit', (event) => this._submit(event))
    for (const input of this.querySelectorAll('input[name="attending"]')) {
      input.addEventListener('change', () => this._onAttendingChange())
    }
    this._update()
  }

  // The form's state: in demo mode its controls are disabled; while an
  // answer is sent they only look it (read-only, aria-disabled), since
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
    button.textContent = this.demo || pending ? 'Sending…' : this.buttonText
    const status = form.querySelector('.xyz-rsvp-status')
    status.dataset.state = this.demo ? 'demo' : this._status
    status.textContent = this.demo ? 'Demo mode — submission disabled.' : this._status === 'success' ? this.successMessage : (this._errorText ?? '')
  }
}

customElements.define('xyz-rsvp', XyzRsvp)
