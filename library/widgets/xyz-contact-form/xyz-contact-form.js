// <xyz-contact-form>: a name, email and message form stored in a
// conduit. No dependencies or build step.
//
// An ES module. A browser loads modules only over http(s), not from a
// file:// page (the widgets' README says how to serve a folder).
//
//   <script type="module" src="./xyz-contact-form.js"></script>
//   <xyz-contact-form
//     conduit-url="https://run.conduits.xyz/<namespace>/<leaf>"
//     caption="Get in touch"
//   ></xyz-contact-form>
//
// `static configFields` below lists the attributes.
//
// `caption` is rendered by the widget and labels its <form>
// (aria-labelledby). It is a heading only when `heading-level` is set:
// only the host page knows its outline.
//
// The default form submits `POST {fields: {name, email, message}}`
// (docs/gateway-api.md); the `qualified-lead` preset adds `services` and
// `budget`.
//
// No CAPTCHA and no honeypot field: the gateway's throttle limits each
// address's request rate.

// Per instance, so captions get unique ids on a page with several
// <xyz-contact-form> elements.
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

const presets = {
  'qualified-lead': {
    services: [
      ['research-development', 'Research and development'],
      ['rent-cto', 'Rent a CTO'],
      ['scale-technical-operations', 'Scale technical operations'],
      ['get-started', 'Help me get started'],
    ],
    budgets: [
      ['10000-25000', '$10,000 - $25,000'],
      ['25000-50000', '$25,000 - $50,000'],
      ['50000-100000-plus', '$50,000 - $100,000+'],
      ['not-sure', 'Not sure, we should talk'],
    ],
  },
}

class XyzContactForm extends HTMLElement {
  // The element's attributes, for a config UI (see xyz-waitlist.js).
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
      attribute: 'preset',
      label: 'Preset',
      type: 'select',
      options: [
        { value: '', label: 'Default' },
        { value: 'qualified-lead', label: 'Qualified lead' },
      ],
      default: '',
      requirement: 'optional',
      description: 'Adds service and budget questions to the contact form.',
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
    // Custom elements default to display: inline. Setting block here
    // keeps the layout from depending on style.css.
    this.style.display ||= 'block'
    this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
    this._errorText = null
    this._captionId = `xyz-contact-form-caption-${nextCaptionId++}`
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

  get preset() {
    return this.getAttribute('preset') || ''
  }

  get presetDefinition() {
    return presets[this.preset] || null
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

  _renderPresetFields() {
    const preset = this.presetDefinition
    if (!preset) return ''

    const serviceInputs = preset.services
      .map(
        ([value, label], index) => `
          <label class="xyz-contact-form-choice">
            <input
              type="checkbox"
              name="services"
              value="${escapeHtml(value)}"
            />
            <span>${escapeHtml(label)}</span>
          </label>`,
      )
      .join('')

    const budgetInputs = preset.budgets
      .map(
        ([value, label]) => `
          <label class="xyz-contact-form-choice">
            <input
              type="radio"
              name="budget"
              value="${escapeHtml(value)}"
              required
            />
            <span>${escapeHtml(label)}</span>
          </label>`,
      )
      .join('')

    return `
      <fieldset class="xyz-contact-form-choice-group">
        <legend>How can we help?</legend>
        <div class="xyz-contact-form-choice-grid">${serviceInputs}</div>
      </fieldset>
      <fieldset class="xyz-contact-form-choice-group">
        <legend>What is your budget?</legend>
        <div class="xyz-contact-form-choice-grid">${budgetInputs}</div>
      </fieldset>
    `
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
    const message = form.elements.message.value
    const services = Array.from(form.querySelectorAll('input[name="services"]:checked')).map((input) => input.value)
    const budget = form.querySelector('input[name="budget"]:checked')?.value || ''
    if (this.presetDefinition && services.length === 0) {
      this._errorText = 'Please select at least one service.'
      this._status = 'error'
      this._update()
      return
    }
    this._status = 'pending'
    this._errorText = null
    this._update()

    try {
      const body = JSON.stringify({
        fields: {
          name,
          email,
          message,
          ...(this.presetDefinition ? { services: services.join('; '), budget } : {}),
        },
      })
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
    // No conduit-url yet, or, on the demo page, not yet checked.
    if (!this.conduitUrl && !this.demo) {
      this.innerHTML = `
        <article class="xyz-contact-form-widget">
          ${this._renderCaption()}
          <p class="xyz-contact-form-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
        </article>
      `
      return
    }

    this.innerHTML = `
      <article class="xyz-contact-form-widget">
        ${this._renderCaption()}
        <form class="xyz-contact-form-form"${this.caption ? ` aria-labelledby="${this._captionId}"` : ''}>
          <label class="xyz-contact-form-field">
            <span class="xyz-contact-form-label">Name</span>
            <input
              type="text"
              name="name"
              required
              autocomplete="name"
              class="xyz-contact-form-input"
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
            />
          </label>
          <label class="xyz-contact-form-field">
            <span class="xyz-contact-form-label">Message</span>
            <textarea
              name="message"
              required
              rows="4"
              class="xyz-contact-form-input xyz-contact-form-textarea"
            ></textarea>
          </label>
          ${this._renderPresetFields()}
          <button type="submit" class="xyz-contact-form-btn"></button>
          <p class="xyz-contact-form-status" role="status" aria-live="polite"></p>
        </form>
      </article>
    `
    this.querySelector('form').addEventListener('submit', (event) => this._submit(event))
    this._update()
  }

  // The form's state: in demo mode its controls are disabled; while a
  // message is sent they only look it (read-only, aria-disabled), since
  // disabling the focused control would move the focus off it. Then the
  // button's label and the status line.
  _update() {
    const form = this.querySelector('form')
    if (!form) return
    const pending = this._status === 'pending'
    const button = form.querySelector('button')
    for (const control of form.querySelectorAll('input, textarea')) {
      control.disabled = this.demo
      control.readOnly = pending
    }
    button.disabled = this.demo
    button.setAttribute('aria-disabled', String(pending))
    button.textContent = this.demo || pending ? 'Sending…' : this.buttonText
    const status = form.querySelector('.xyz-contact-form-status')
    status.dataset.state = this.demo ? 'demo' : this._status
    status.textContent = this.demo ? 'Demo mode — submission disabled.' : this._status === 'success' ? this.successMessage : (this._errorText ?? '')
  }
}

customElements.define('xyz-contact-form', XyzContactForm)
