// <xyz-reactions>: thumbs-up and thumbs-down reactions stored in a
// conduit. No dependencies or build step.
//
// A classic script, not a module: Chromium blocks module scripts on
// file:// pages.
//
//   <script src="./xyz-reactions.js"></script>
//   <xyz-reactions
//     conduit-url="https://conduits.xyz/XXXXXXXX"
//     subject="my-blog-post-slug"
//     caption="Was this post helpful?"
//   ></xyz-reactions>
//
// `static configFields` below lists the attributes.
//
// `caption` is rendered by the widget and names the button group
// (aria-labelledby) in place of "Was this helpful?". With
// `heading-level` it is also a heading of that level.
//
// A vote is `POST {fields: {subject, reaction, votedAt}}`
// (docs/gateway-api.md). `subject` lets one conduit hold reactions for
// many pages; without it, every vote shares one tally. Counts are
// tallied in the browser from `GET conduit-url`.
//
// One vote per browser per subject, remembered in localStorage by
// conduit-url and subject. This discourages repeat votes; it doesn't
// prevent them.

// Wrapped in an IIFE: classic scripts share one global scope, so a
// top-level name also declared by another xyz-* widget would be a
// SyntaxError that stops the second widget from loading.
;(function () {
  // Per instance, so captions get unique ids on a page with several
  // <xyz-reactions> elements.
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
  async function describeVoteFailure(response) {
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

  class XyzReactions extends HTMLElement {
    // The element's attributes, for a config UI (see xyz-waitlist.js).
    static configFields = [
      {
        attribute: 'conduit-url',
        label: 'Conduit',
        type: 'conduit-picker',
        default: null,
        requirement: 'required',
        description: 'Which conduit this widget posts/reads votes against.',
      },
      {
        attribute: 'subject',
        label: 'Subject',
        type: 'text',
        default: '',
        requirement: 'conditional',
        condition:
          'Needed when reusing one conduit across more than one embedding — without it, votes from different embeddings are tallied together with no way to separate them after the fact.',
      },
      {
        attribute: 'caption',
        label: 'Caption',
        type: 'text',
        default: '',
        requirement: 'optional',
        description:
          'Shown above the buttons; also becomes their accessible name (replacing the default "Was this helpful?").',
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
        attribute: 'up-label',
        label: '"Helpful" button label',
        type: 'text',
        default: 'Helpful',
        requirement: 'optional',
      },
      {
        attribute: 'down-label',
        label: '"Not helpful" button label',
        type: 'text',
        default: 'Not helpful',
        requirement: 'optional',
      },
      {
        attribute: 'initial-up',
        label: 'Starting "helpful" count',
        type: 'number',
        default: null,
        requirement: 'conditional',
        condition:
          "Only relevant if you're server-rendering this embed yourself, to avoid an initial client-side fetch. Most embeds should omit this — the widget fetches real counts on its own.",
      },
      {
        attribute: 'initial-down',
        label: 'Starting "not helpful" count',
        type: 'number',
        default: null,
        requirement: 'conditional',
        condition: 'Same as Starting "helpful" count.',
      },
    ]

    connectedCallback() {
      // Custom elements default to display: inline. Setting block here,
      // before first paint, keeps the layout from depending on style.css.
      this.style.display ||= 'block'
      this._votedReaction = this.demo ? null : this._readStoredVote()
      this._counts = { up: this._initialCount('initial-up'), down: this._initialCount('initial-down') }
      this._pending = false
      this._error = null
      this._captionId = `xyz-reactions-caption-${nextCaptionId++}`
      this._render()

      // Without counts from the page's attributes, fetch them once
      // conduit-url is known.
      if (!this.demo && !this.hasAttribute('initial-up') && !this.hasAttribute('initial-down') && this.conduitUrl) {
        this._refreshCounts()
      }
    }

    get conduitUrl() {
      return this.getAttribute('conduit-url') || ''
    }

    get demo() {
      return this.hasAttribute('demo')
    }

    get subject() {
      return this.getAttribute('subject') || ''
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

    get upLabel() {
      return this.getAttribute('up-label') || 'Helpful'
    }

    get downLabel() {
      return this.getAttribute('down-label') || 'Not helpful'
    }

    _renderCaption() {
      if (!this.caption) return ''
      const headingAttrs = this.headingLevel
        ? ` role="heading" aria-level="${escapeHtml(this.headingLevel)}"`
        : ''
      return `<p class="xyz-reactions-caption" id="${this._captionId}"${headingAttrs}>${escapeHtml(this.caption)}</p>`
    }

    _initialCount(attr) {
      const raw = this.getAttribute(attr)
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }

    _storageKey() {
      return `xyz-reactions:${this.conduitUrl}:${this.subject}`
    }

    _readStoredVote() {
      try {
        const value = localStorage.getItem(this._storageKey())
        return value === 'up' || value === 'down' ? value : null
      } catch {
        // Storage can throw (private browsing, blocked site data); the
        // vote then isn't remembered.
        return null
      }
    }

    _writeStoredVote(reaction) {
      try {
        localStorage.setItem(this._storageKey(), reaction)
      } catch {
        // As above.
      }
    }

    async _refreshCounts() {
      try {
        const response = await fetch(this.conduitUrl)
        if (!response.ok) return
        const body = await response.json()
        const records = Array.isArray(body.records) ? body.records : []
        const matching = records.filter((r) => (r.fields ? r.fields.subject : undefined) === this.subject)
        this._counts = {
          up: matching.filter((r) => r.fields.reaction === 'up').length,
          down: matching.filter((r) => r.fields.reaction === 'down').length,
        }
        this._render()
      } catch {
        // On failure, keep the counts already shown.
      }
    }

    async _vote(reaction) {
      if (this.demo || this._pending || this._votedReaction) return
      this._pending = true
      this._error = null
      // Optimistic; corrected or reverted when the request settles.
      this._counts[reaction] += 1
      this._render()

      try {
        const response = await fetch(this.conduitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { subject: this.subject, reaction, votedAt: new Date().toISOString() } }),
        })
        if (response.ok) {
          this._votedReaction = reaction
          this._writeStoredVote(reaction)
        } else {
          this._counts[reaction] -= 1
          this._error = await describeVoteFailure(response)
        }
      } catch {
        this._counts[reaction] -= 1
        this._error = 'Something went wrong. Please try again.'
      }
      this._pending = false
      this._render()
    }

    _render() {
      // No conduit-url yet, or, on the demo page, not yet checked.
      if (!this.conduitUrl && !this.demo) {
        this.innerHTML = `
          <article class="xyz-reactions-widget">
            ${this._renderCaption()}
            <p class="xyz-reactions-status" data-state="idle">${escapeHtml(this.unconfiguredMessage)}</p>
          </article>
        `
        return
      }

      const voted = this._votedReaction
      const disabled = this.demo || this._pending || Boolean(voted)
      const caption = this.caption
      const groupLabelAttrs = caption ? ` aria-labelledby="${this._captionId}"` : ' aria-label="Was this helpful?"'

      this.innerHTML = `
        <article class="xyz-reactions-widget">
          ${this._renderCaption()}
          <div class="xyz-reactions-row" role="group"${groupLabelAttrs}>
            <button
              type="button"
              class="xyz-reactions-btn${voted === 'up' ? ' xyz-reactions-btn--chosen' : ''}"
              data-reaction="up"
              ${disabled ? 'disabled' : ''}
              aria-pressed="${voted === 'up'}"
            >${escapeHtml(this.upLabel)} <span class="xyz-reactions-count">${this._counts.up}</span></button>
            <button
              type="button"
              class="xyz-reactions-btn${voted === 'down' ? ' xyz-reactions-btn--chosen' : ''}"
              data-reaction="down"
              ${disabled ? 'disabled' : ''}
              aria-pressed="${voted === 'down'}"
            >${escapeHtml(this.downLabel)} <span class="xyz-reactions-count">${this._counts.down}</span></button>
          </div>
          <p class="xyz-reactions-status" data-state="${this.demo ? 'demo' : this._error ? 'error' : 'success'}" role="status" aria-live="polite">${
            this.demo ? 'Demo mode — voting disabled.' : this._error ? escapeHtml(this._error) : voted ? escapeHtml(this.successMessage) : ''
          }</p>
        </article>
      `

      for (const button of this.querySelectorAll('button[data-reaction]')) {
        button.addEventListener('click', () => this._vote(button.dataset.reaction))
      }
    }
  }

  customElements.define('xyz-reactions', XyzReactions)
})()
