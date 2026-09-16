// <xyz-feedback> — a scored-rating feedback widget backed by a real
// conduit. Zero dependencies, no build step: drop this file next to
// your page, add the element, done.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page, and this file has no import/export of its own — a classic
// <script> works identically and actually runs when opened directly
// from disk.
//
//   <script src="./xyz-feedback.js"></script>
//   <xyz-feedback
//     conduit-url="https://conduits.xyz/api/XXXXXXXX"
//     scale="5"
//     subject="checkout-flow"
//     caption="How did we do?"
//   ></xyz-feedback>
//
// See `static configFields` below for the full, authoritative list of
// optional attributes — also what any config UI could read
// to build a form for this widget.
//
// `scale` is `"5"` (default — star rating, 1 to 5) or `"10"`
// (NPS-style, 0 to 10, "how likely are you to recommend this?"
// framing). One widget, one attribute — not two separate elements,
// since the two scales share everything but the label and the number
// of choices.
//
// `caption` — when set, the widget renders it itself and gives its
// own <form> an aria-labelledby pointing at it. Not a real heading by
// default: the widget can't know what heading level is correct
// wherever it lands. Set `heading-level` alongside it to opt in.
//
// Wire format: `POST {fields: {subject, rating, comment}}` to
// conduit-url — the same envelope every conduit accepts (see
// docs/gateway-api.md). `subject` is optional, same multi-post-per-
// conduit pattern <xyz-reactions> uses; `comment` is an optional
// free-text follow-up. `rating` is submitted as the raw number chosen
// — this widget never computes an NPS score (promoter/detractor/
// passive) or any other aggregate client-side; that's for whoever
// reads the conduit back via GET. Matches this project's own "we don't
// hold your data, no local copy" philosophy rather than inventing a
// client-side analytics feature.

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
  // <xyz-feedback>, and each needs its own id for aria-labelledby to
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

  class XyzFeedback extends HTMLElement {
    // See xyz-waitlist.js's identical static property for what this is
    // and how it's meant to be read.
    static configFields = [
      {
        attribute: 'conduit-url',
        label: 'Conduit',
        type: 'conduit-picker',
        default: null,
        requirement: 'required',
        description: 'Which conduit this widget submits ratings to.',
      },
      {
        attribute: 'scale',
        label: 'Rating scale',
        type: 'enum',
        default: '5',
        requirement: 'optional',
        options: [
          { value: '5', label: '5-star' },
          { value: '10', label: '10-point NPS' },
        ],
        description: 'Changes what the submitted rating means (1-5 vs 0-10) — behavioral, not just cosmetic.',
      },
      {
        attribute: 'subject',
        label: 'Subject',
        type: 'text',
        default: '',
        requirement: 'conditional',
        condition:
          'Needed when reusing one conduit across more than one embedding — without it, ratings from different embeddings are tallied together with no way to separate them after the fact.',
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
        default: 'Thanks for the feedback.',
        requirement: 'optional',
      },
      {
        attribute: 'button-text',
        label: 'Button label',
        type: 'text',
        default: 'Submit feedback',
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
      this._captionId = `xyz-feedback-caption-${nextCaptionId++}`
      this._render()
    }

    get conduitUrl() {
      return this.getAttribute('conduit-url') || ''
    }

    get subject() {
      return this.getAttribute('subject') || ''
    }

    // Anything other than exactly "10" is the 5-point star default —
    // an unrecognized value degrades to the common case rather than
    // rendering nothing.
    get scale() {
      return this.getAttribute('scale') === '10' ? 10 : 5
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
      return this.getAttribute('success-message') || 'Thanks for the feedback.'
    }

    get buttonText() {
      return this.getAttribute('button-text') || 'Submit feedback'
    }

    _renderCaption() {
      if (!this.caption) return ''
      const headingAttrs = this.headingLevel
        ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
        : ''
      return `<p class="xyz-feedback-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
    }

    async _submit(event) {
      event.preventDefault()
      if (this._status === 'pending') return

      const checked = this.querySelector('input[name="rating"]:checked')
      if (!checked) return
      const rating = Number(checked.value)
      const comment = this.querySelector('textarea[name="comment"]').value
      this._status = 'pending'
      this._errorText = null
      this._render()

      try {
        const response = await fetch(this.conduitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { subject: this.subject, rating, comment } }),
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

    _renderChoices() {
      const scale = this.scale
      const values = Array.from({ length: scale === 10 ? 11 : 5 }, (_, i) => (scale === 10 ? i : i + 1))
      const disabled = this._status === 'pending'

      const inputs = values
        .map(
          (value) => `
          <label class="xyz-feedback-choice">
            <input
              type="radio"
              name="rating"
              value="${value}"
              required
              ${disabled ? 'disabled' : ''}
            />
            <span class="xyz-feedback-choice-label">${scale === 10 ? value : '★'.repeat(value)}</span>
          </label>`,
        )
        .join('')

      if (scale === 10) {
        return `
          <fieldset class="xyz-feedback-scale xyz-feedback-scale--nps">
            <legend class="xyz-feedback-scale-legend">How likely are you to recommend this, from 0 to 10?</legend>
            ${inputs}
          </fieldset>
          <div class="xyz-feedback-scale-endpoints">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        `
      }

      return `
        <fieldset class="xyz-feedback-scale xyz-feedback-scale--stars">
          <legend class="xyz-feedback-scale-legend">Rate from 1 to 5 stars</legend>
          ${inputs}
        </fieldset>
      `
    }

    _render() {
      // No conduit-url set yet (or not yet validated, in this file's own
      // demo page).
      if (!this.conduitUrl) {
        this.innerHTML = `
          <article class="xyz-feedback-widget">
            ${this._renderCaption()}
            <p class="xyz-feedback-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
          </article>
        `
        return
      }

      const pending = this._status === 'pending'
      const caption = this.caption

      this.innerHTML = `
        <article class="xyz-feedback-widget">
          ${this._renderCaption()}
          <form class="xyz-feedback-form"${caption ? ` aria-labelledby="${this._captionId}"` : ''}>
            ${this._renderChoices()}
            <textarea
              name="comment"
              placeholder="Anything else? (optional)"
              rows="2"
              class="xyz-feedback-comment"
              ${pending ? 'disabled' : ''}
            ></textarea>
            <button type="submit" class="xyz-feedback-btn" ${pending ? 'disabled' : ''}>
              ${pending ? 'Sending…' : escapeHtml(this.buttonText)}
            </button>
            <p class="xyz-feedback-status" data-state="${this._status}" role="status" aria-live="polite">${
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

  customElements.define('xyz-feedback', XyzFeedback)
})()
