// <xyz-reactions>: thumbs-up and thumbs-down reactions stored in a
// conduit. No dependencies or build step.
//
// An ES module. A browser loads modules only over http(s), not from a
// file:// page (the widgets' README says how to serve a folder).
//
//   <script type="module" src="./xyz-reactions.js"></script>
//   <xyz-reactions
//     conduit-url="https://run.conduits.xyz/<namespace>/<leaf>"
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

// Errors are RFC 9457 Problem Details (docs/gateway-api.md#errors). A
// 429 and 503 ask the visitor to wait (too many requests here; the
// conduit's source is busy); another 4xx shows its detail (e.g. a
// missing sheet column); another 5xx or a network failure gets a generic
// message.
async function describeVoteFailure(response) {
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
    // Custom elements default to display: inline. Setting block here
    // keeps the layout from depending on style.css.
    this.style.display ||= 'block'
    this._votedReaction = this.demo ? null : this._readStoredVote()
    this._counts = { up: this._initialCount('initial-up'), down: this._initialCount('initial-down') }
    this._pending = false
    this._error = null
    this._captionId = `xyz-reactions-caption-${nextCaptionId++}`
    this._build()

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
      // A list read returns one page at a time; follow nextCursor to
      // count every reaction.
      const records = []
      let cursor = null
      do {
        const url = new URL(this.conduitUrl, location.href)
        if (cursor) url.searchParams.set('cursor', cursor)
        const response = await fetch(url)
        if (!response.ok) return
        const body = await response.json()
        if (Array.isArray(body.records)) records.push(...body.records)
        cursor = typeof body.nextCursor === 'string' ? body.nextCursor : null
      } while (cursor)
      const matching = records.filter((r) => (r.fields ? r.fields.subject : undefined) === this.subject)
      this._counts = {
        up: matching.filter((r) => r.fields.reaction === 'up').length,
        down: matching.filter((r) => r.fields.reaction === 'down').length,
      }
      this._update()
    } catch {
      // On failure, keep the counts already shown.
    }
  }

  // The Idempotency-Key for a submit of `body`: the same key while the
  // same body is sent again after a failure, so a retry creates one
  // record (docs/gateway-api.md, "Idempotency keys"); a new one for
  // another body or after a success.
  _idempotencyKey(body) {
    if (this._lastSubmit?.body !== body) this._lastSubmit = { body, key: crypto.randomUUID() }
    return this._lastSubmit.key
  }

  async _vote(reaction) {
    if (this.demo || this._pending || this._votedReaction) return
    this._pending = true
    this._error = null
    // Optimistic; corrected or reverted when the request settles.
    this._counts[reaction] += 1
    this._update()

    try {
      const body = JSON.stringify({ fields: { subject: this.subject, reaction, votedAt: new Date().toISOString() } })
      const response = await fetch(this.conduitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': this._idempotencyKey(body) },
        body,
      })
      if (response.ok) {
        this._lastSubmit = null
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
    this._update()
  }

  // Builds the markup once, when the element connects. A vote updates
  // it in place (_update), so a keyboard user keeps their place.
  _build() {
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
    const groupLabelAttrs = this.caption ? ` aria-labelledby="${this._captionId}"` : ' aria-label="Was this helpful?"'

    this.innerHTML = `
      <article class="xyz-reactions-widget">
        ${this._renderCaption()}
        <div class="xyz-reactions-row" role="group"${groupLabelAttrs}>
          <button type="button" class="xyz-reactions-btn" data-reaction="up">${escapeHtml(this.upLabel)} <span class="xyz-reactions-count"></span></button>
          <button type="button" class="xyz-reactions-btn" data-reaction="down">${escapeHtml(this.downLabel)} <span class="xyz-reactions-count"></span></button>
        </div>
        <p class="xyz-reactions-status" role="status" aria-live="polite"></p>
      </article>
    `
    for (const button of this.querySelectorAll('button[data-reaction]')) {
      button.addEventListener('click', () => this._vote(button.dataset.reaction))
    }
    this._update()
  }

  // The buttons' state and counts, and the status line. In demo mode the
  // buttons are disabled; while a vote is sent, and after it, they only
  // look it (aria-disabled), since disabling the focused button would
  // move the focus off it. _vote refuses a second vote.
  _update() {
    if (!this.querySelector('button[data-reaction]')) return
    const status = this.querySelector('.xyz-reactions-status')
    const voted = this._votedReaction
    for (const button of this.querySelectorAll('button[data-reaction]')) {
      const reaction = button.dataset.reaction
      button.disabled = this.demo
      button.setAttribute('aria-disabled', String(this._pending || Boolean(voted)))
      button.setAttribute('aria-pressed', String(voted === reaction))
      button.classList.toggle('xyz-reactions-btn--chosen', voted === reaction)
      button.querySelector('.xyz-reactions-count').textContent = String(this._counts[reaction])
    }
    status.dataset.state = this.demo ? 'demo' : this._error ? 'error' : 'success'
    status.textContent = this.demo ? 'Demo mode — voting disabled.' : this._error ? this._error : voted ? this.successMessage : ''
  }
}

customElements.define('xyz-reactions', XyzReactions)
