// <xyz-reactions> — a thumbs-up/thumbs-down reactions widget backed
// by a real conduit. Zero dependencies, no build step: drop this file
// next to your page, add the element, done.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page, and this file has no import/export of its own — a classic
// <script> works identically and actually runs when opened directly
// from disk.
//
//   <script src="./xyz-reactions.js"></script>
//   <xyz-reactions
//     conduit-url="https://conduits.xyz/XXXXXXXX"
//     subject="my-blog-post-slug"
//     caption="Was this post helpful?"
//   ></xyz-reactions>
//
// See `static configFields` below for the full, authoritative list of
// optional attributes — also what any config UI could read
// to build a form for this widget.
//
// `caption` is optional — when set, the widget renders it itself and
// uses it as the button group's own accessible name (aria-labelledby),
// replacing the generic "Was this helpful?" default below. Set
// `heading-level` alongside it to also render it as an accessible
// heading of that level — the widget has no way to know what level is
// correct wherever it lands, so it never guesses; only the host page,
// which knows its own outline, sets this.
//
// Wire format: a vote is `POST {fields: {subject, reaction, votedAt}}`
// to conduit-url — the same envelope every conduit accepts (see
// docs/gateway-api.md). `subject` lets one conduit back reactions for
// many different pages/posts at once; a single-post site can omit it
// (every vote then shares one tally).
//
// Counts are computed client-side from a `GET conduit-url`, tallied by
// `reaction` for matching `subject` values — no server-side aggregation
// endpoint.
//
// One vote per browser per subject: recorded in localStorage (keyed on
// conduit-url + subject) so reloading the page shows "you already voted"
// instead of offering a second vote. This is a deterrent against casual
// re-voting, not a security boundary — clearing storage or switching
// browsers resets it.

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
  // <xyz-reactions>, and each needs its own id for aria-labelledby to
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
    // See xyz-waitlist.js's identical static property for what this is
    // and how it's meant to be read.
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
      this._votedReaction = this.demo ? null : this._readStoredVote()
      this._counts = { up: this._initialCount('initial-up'), down: this._initialCount('initial-down') }
      this._pending = false
      this._error = null
      this._captionId = `xyz-reactions-caption-${nextCaptionId++}`
      this._render()

      // If the caller didn't supply initial counts (e.g. this file opened
      // standalone, no server-rendered starting point), fetch real ones
      // once conduit-url is known. Skipped entirely when both were given —
      // that's the common case on a page that server-renders them.
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
        // Storage can throw (private browsing, disabled site data) — a
        // vote just isn't remembered across reloads in that case, the
        // widget still works.
        return null
      }
    }

    _writeStoredVote(reaction) {
      try {
        localStorage.setItem(this._storageKey(), reaction)
      } catch {
        // Same as above — best-effort only.
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
        // A failed refresh just keeps whatever counts were already
        // showing (initial attributes, or 0/0) — never blocks voting.
      }
    }

    async _vote(reaction) {
      if (this.demo || this._pending || this._votedReaction) return
      this._pending = true
      this._error = null
      // Optimistic bump — reconciled (or reverted) once the real request settles.
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
      // No conduit-url set yet (or not yet validated, in this file's own
      // demo page).
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
