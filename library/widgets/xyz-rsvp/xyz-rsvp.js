// <xyz-rsvp> — a name/email/attending RSVP form backed by a real
// conduit. Zero dependencies, no build step: drop this file next to
// your page, add the element, done.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page, and this file has no import/export of its own — a classic
// <script> works identically and actually runs when opened directly
// from disk.
//
//   <script src="./xyz-rsvp.js"></script>
//   <xyz-rsvp
//     conduit-url="https://conduits.xyz/XXXXXXXX"
//     caption="RSVP for our launch party"
//   ></xyz-rsvp>
//
// See `static configFields` below for the full, authoritative list of
// optional attributes — also what any config UI could read
// to build a form for this widget.
//
// `caption` — when set, the widget renders it itself and gives its
// own <form> an aria-labelledby pointing at it. Not a real heading by
// default: the widget can't know what heading level is correct
// wherever it lands. Set `heading-level` alongside it to opt in.
//
// A tri-state response to an already-scheduled thing, not a linear
// form: `attending` is `"yes"`, `"no"`, or `"maybe"`, and the guest-
// count field only appears once someone has actually said yes —
// asking "how many guests" before that is a real, avoidable rough
// edge. Genuinely different from <xyz-waitlist> ("notify me later," no
// event to respond to) rather than a relabeled variant of it.
//
// Wire format: `POST {fields: {name, email, attending, guestCount}}`
// — the same envelope every conduit accepts (see docs/gateway-api.md).
// `guestCount` is submitted as `null` whenever `attending` isn't
// `"yes"`, or when the field was left blank.

// Everything below is wrapped in an IIFE deliberately — this is a
// classic (non-module) script by design (see the top of this file),
// and classic scripts share ONE global lexical scope across every
// <script> tag on the page. A host embedding more than one xyz-*
// widget loads more than one of these files together — without this
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
  // <xyz-rsvp>, and each needs its own id for aria-labelledby to
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

  class XyzRsvp extends HTMLElement {
    // See xyz-waitlist.js's identical static property for what this is
    // and how it's meant to be read.
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
      this._captionId = `xyz-rsvp-caption-${nextCaptionId++}`
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

    // Toggles the guest-count field's visibility in place — deliberately
    // not a full _render(), so picking an "attending" option never wipes
    // whatever the visitor already typed into name/email.
    _onAttendingChange() {
      const attending = this.querySelector('input[name="attending"]:checked')?.value
      const guestField = this.querySelector('.xyz-rsvp-guest-field')
      const guestInput = this.querySelector('input[name="guestCount"]')
      const showGuestCount = attending === 'yes'
      guestField.hidden = !showGuestCount
      if (!showGuestCount) guestInput.value = ''
    }

    async _submit(event) {
      event.preventDefault()
      if (this.demo || this._status === 'pending') return

      const name = this.querySelector('input[name="name"]').value
      const email = this.querySelector('input[name="email"]').value
      const attending = this.querySelector('input[name="attending"]:checked')?.value
      if (!attending) return
      const guestCountRaw = this.querySelector('input[name="guestCount"]').value
      const guestCount = attending === 'yes' && guestCountRaw !== '' ? Number(guestCountRaw) : null

      this._status = 'pending'
      this._errorText = null
      this._render()

      try {
        const response = await fetch(this.conduitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { name, email, attending, guestCount } }),
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
      if (!this.conduitUrl && !this.demo) {
        this.innerHTML = `
          <article class="xyz-rsvp-widget">
            ${this._renderCaption()}
            <p class="xyz-rsvp-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
          </article>
        `
        return
      }

      const pending = this.demo || this._status === 'pending'
      const caption = this.caption

      this.innerHTML = `
        <article class="xyz-rsvp-widget">
          ${this._renderCaption()}
          <form class="xyz-rsvp-form"${caption ? ` aria-labelledby="${this._captionId}"` : ''}>
            <label class="xyz-rsvp-field">
              <span class="xyz-rsvp-label">Name</span>
              <input
                type="text"
                name="name"
                required
                autocomplete="name"
                class="xyz-rsvp-input"
                ${pending ? 'disabled' : ''}
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
                ${pending ? 'disabled' : ''}
              />
            </label>
            <fieldset class="xyz-rsvp-field xyz-rsvp-attending-fieldset">
              <legend class="xyz-rsvp-label">Will you attend?</legend>
              <label class="xyz-rsvp-attending-choice">
                <input type="radio" name="attending" value="yes" required ${pending ? 'disabled' : ''} />
                Yes
              </label>
              <label class="xyz-rsvp-attending-choice">
                <input type="radio" name="attending" value="no" required ${pending ? 'disabled' : ''} />
                No
              </label>
              <label class="xyz-rsvp-attending-choice">
                <input type="radio" name="attending" value="maybe" required ${pending ? 'disabled' : ''} />
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
                ${pending ? 'disabled' : ''}
              />
            </label>
            <button type="submit" class="xyz-rsvp-btn" ${pending ? 'disabled' : ''}>
              ${pending ? 'Sending…' : escapeHtml(this.buttonText)}
            </button>
            <p class="xyz-rsvp-status" data-state="${this.demo ? 'demo' : this._status}" role="status" aria-live="polite">${
              this.demo ? 'Demo mode — submission disabled.' : this._status === 'success' ? escapeHtml(this.successMessage) : escapeHtml(this._errorText ?? '')
            }</p>
          </form>
        </article>
      `

      const form = this.querySelector('form')
      form.addEventListener('submit', (event) => this._submit(event))
      for (const input of this.querySelectorAll('input[name="attending"]')) {
        input.addEventListener('change', () => this._onAttendingChange())
      }
      if (this._status === 'success') form.reset()
    }
  }

  customElements.define('xyz-rsvp', XyzRsvp)
})()
