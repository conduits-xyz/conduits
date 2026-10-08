// <xyz-contact-form>: a name, email and message form stored in a
// conduit. No dependencies or build step.
//
// A classic script, not a module: Chromium blocks module scripts on
// file:// pages.
//
//   <script src="./xyz-contact-form.js"></script>
//   <xyz-contact-form
//     conduit-url="https://conduits.xyz/XXXXXXXX"
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

// Wrapped in an IIFE: classic scripts share one global scope, so a
// top-level name also declared by another xyz-* widget would be a
// SyntaxError that stops the second widget from loading.
;(function () {
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
      // Custom elements default to display: inline. Setting block here,
      // before first paint, keeps the layout from depending on style.css.
      this.style.display ||= 'block'
      this._status = 'idle' // 'idle' | 'pending' | 'success' | 'error'
      this._errorText = null
      this._formValues = {}
      this._captionId = `xyz-contact-form-caption-${nextCaptionId++}`
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

    _renderPresetFields(pending) {
      const preset = this.presetDefinition
      if (!preset) return ''

      const selectedServices = new Set(this._formValues.services || [])
      const serviceInputs = preset.services
        .map(
          ([value, label], index) => `
            <label class="xyz-contact-form-choice">
              <input
                type="checkbox"
                name="services"
                value="${escapeHtml(value)}"
                ${selectedServices.has(value) ? 'checked' : ''}
                ${pending ? 'disabled' : ''}
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
                ${this._formValues.budget === value ? 'checked' : ''}
                ${pending ? 'disabled' : ''}
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

    async _submit(event) {
      event.preventDefault()
      if (this.demo || this._status === 'pending') return

      const name = this.querySelector('input[name="name"]').value
      const email = this.querySelector('input[name="email"]').value
      const message = this.querySelector('textarea[name="message"]').value
      const services = Array.from(this.querySelectorAll('input[name="services"]:checked')).map(
        (input) => input.value,
      )
      const budget = this.querySelector('input[name="budget"]:checked')?.value || ''
      this._formValues = { name, email, message, services, budget }
      if (this.presetDefinition && services.length === 0) {
        this._errorText = 'Please select at least one service.'
        this._status = 'error'
        this._render()
        return
      }
      this._status = 'pending'
      this._errorText = null
      this._render()

      try {
        const response = await fetch(this.conduitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              name,
              email,
              message,
              ...(this.presetDefinition ? { services: services.join('; '), budget } : {}),
            },
          }),
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

      const pending = this.demo || this._status === 'pending'
      const caption = this.caption
      const values = this._formValues

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
                value="${escapeHtml(values.name || '')}"
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
                value="${escapeHtml(values.email || '')}"
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
              >${escapeHtml(values.message || '')}</textarea>
            </label>
            ${this._renderPresetFields(pending)}
            <button type="submit" class="xyz-contact-form-btn" ${pending ? 'disabled' : ''}>
              ${pending ? 'Sending…' : escapeHtml(this.buttonText)}
            </button>
            <p class="xyz-contact-form-status" data-state="${this.demo ? 'demo' : this._status}" role="status" aria-live="polite">${
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

  customElements.define('xyz-contact-form', XyzContactForm)
})()
