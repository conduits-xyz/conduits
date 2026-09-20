// Manual QA harness for exercising conduits.xyz end to end: write via a
// write-only conduit, read + update via a read/update conduit, then read
// again via a read-only conduit and visualize validity.
//
// Wire format: the gateway's request/response shape matches Airtable's
// own — a record is always `{fields: {...}}`, a list response is
// `{records: [{id, fields, createdTime}, ...]}`. This file flattens each
// record to a plain `{id, name, email, valid}` object immediately after
// fetching (see flattenRecord below) so the rest of the app's logic
// doesn't need to know about the envelope at all.

const STORAGE_KEY = 'conduit-validation-flow.conduitUrls'

// A real conduit is throttled to 5 requests/second by default — the
// fake-data and update-validity loops below space their own requests out
// by this much so a normal run doesn't trip that limit and 429 itself.
// Comfortably under 5/sec (200ms would be exactly 5/sec; some margin for
// real network latency on top).
const REQUEST_SPACING_MS = 220

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// kind drives the log line's color (see style.css's .console-line--*) —
// 'ok'/'error' for a request's own outcome, 'info' (default) for
// anything else. Each step's requests log to that step's own panel
// (targetId), not one shared firehose — see the per-step <details> in
// index.html.
function log(targetId, message, kind = 'info') {
  const target = document.getElementById(targetId)
  const line = document.createElement('div')
  line.className = `console-line console-line--${kind}`
  line.textContent = message
  target.appendChild(line)
  target.scrollTop = target.scrollHeight
}

function loadConduitUrls() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function saveConduitUrls(urls) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(urls))
}

let conduitUrls = loadConduitUrls()
let totalCount = 0
let rows = []
let unrefetched = false

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// .conduits/readyz confirms a curi resolves to an active conduit — no RACM or
// bearer-token gate, no data-source access — before this page ever
// tries a real read/write against it. Without this check up front, an
// inactive conduit (or a typo'd URL) surfaces as a wall of confusing
// 404s once step 2 starts firing real requests, with nothing pointing
// back at "step 1 was the actual problem."
async function checkReady(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/.conduits/readyz`)
    return response.ok
  } catch {
    return false
  }
}

function showStep(step) {
  const titles = [
    'Connect your conduits',
    'Write real data — no backend required',
    'Update records through access control',
    'See it come together',
  ]
  document.getElementById('step-title').textContent = `Step ${step} of 4 — ${titles[step - 1]}`
  // A real step-switcher, not an accumulating scroll: exactly one step
  // is visible at a time, same as any wizard/tab UI — the previous
  // steps' own state (URLs, submitted count, table) is preserved
  // underneath, just not shown, so stepping back via the progress bar
  // (below) picks up right where it left off.
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step-${i}`).hidden = i !== step
  }
  for (const el of document.querySelectorAll('.progress-step')) {
    const n = Number(el.dataset.step)
    const done = n < step
    el.classList.toggle('is-current', n === step)
    el.classList.toggle('is-done', done)
    // Only a completed step is real navigation — tabIndex/role reflect
    // that rather than making every dot look interactive.
    el.tabIndex = done ? 0 : -1
    el.setAttribute('role', done ? 'button' : 'listitem')
    // Replaces the number with a checkmark — a CSS ::before layered on
    // top of the number instead of replacing it (an earlier version of
    // this) just rendered both stacked illegibly in the same small
    // circle.
    el.querySelector('.progress-dot').textContent = done ? '✓' : String(n)
  }
  if (step >= 2) updateActiveConduitLabels()
}

// Every step past 1 names which specific conduit its own requests use —
// otherwise, once a step's own content is the only thing on screen, a
// wall of requests against "some conduit" (which one, again?) is exactly
// the kind of orientation the pileup layout used to paper over for free.
function updateActiveConduitLabels() {
  const labels = { 'conduit-1-label': conduitUrls['conduit-1'], 'conduit-2-label': conduitUrls['conduit-2'], 'conduit-3-label': conduitUrls['conduit-3'] }
  for (const [id, url] of Object.entries(labels)) {
    const el = document.getElementById(id)
    if (el) el.textContent = url ?? ''
  }
}

// Clicking (or Enter/Space-ing) a completed step's own dot jumps back to
// it — the progress bar is real navigation, not just a read-only
// tracker.
for (const el of document.querySelectorAll('.progress-step')) {
  const goToStep = () => {
    if (el.classList.contains('is-done')) showStep(Number(el.dataset.step))
  }
  el.addEventListener('click', goToStep)
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      goToStep()
    }
  })
}

// --- Step 1: conduit URLs ---
//
// Discipline over convenience: each conduit must be explicitly checked
// (its own button, its own .conduits/readyz round-trip) before "Proceed to step
// 2" ever enables — not one combined check fired at submit time. Typing
// into a field after it's been checked un-checks it again; a URL that's
// merely *typed* has never actually been confirmed reachable.

const conduitForm = document.getElementById('conduit-form')
const conduitSubmitButton = conduitForm.querySelector('button[type="submit"]')
const CONDUIT_NAMES = ['conduit-1', 'conduit-2', 'conduit-3']
const checkedState = Object.fromEntries(CONDUIT_NAMES.map((name) => [name, false]))

function updateProceedButton() {
  conduitSubmitButton.disabled = !Object.values(checkedState).every(Boolean)
}

for (const name of CONDUIT_NAMES) {
  const input = document.getElementById(name)
  const checkButton = document.querySelector(`[data-check="${name}"]`)
  const errorEl = document.querySelector(`.field-error[data-for="${name}"]`)
  input.value = conduitUrls[name] ?? ''

  // A previously-saved URL (from localStorage) is not re-verified on
  // load — the conduit could have been deactivated since. It always
  // has to be checked again this session.
  input.addEventListener('input', () => {
    checkedState[name] = false
    errorEl.textContent = ''
    errorEl.classList.remove('field-status--ok')
    updateProceedButton()
  })

  checkButton.addEventListener('click', async () => {
    if (!isValidUrl(input.value)) {
      errorEl.textContent = 'Enter a valid conduit URL.'
      errorEl.classList.remove('field-status--ok')
      checkedState[name] = false
      updateProceedButton()
      return
    }
    checkButton.disabled = true
    checkButton.textContent = 'Checking…'
    const ready = await checkReady(input.value)
    checkButton.disabled = false
    checkButton.textContent = 'Check'
    checkedState[name] = ready
    if (ready) {
      errorEl.textContent = '✓ Reachable'
      errorEl.classList.add('field-status--ok')
      conduitUrls[name] = input.value
      saveConduitUrls(conduitUrls)
    } else {
      errorEl.textContent = 'Not reachable — check the URL, and make sure this conduit is defined in conduits.yaml and the gateway has restarted since.'
      errorEl.classList.remove('field-status--ok')
    }
    updateProceedButton()
  })
}

conduitForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!Object.values(checkedState).every(Boolean)) return
  showStep(2)
})

// --- Schema errors: a field the gateway doesn't recognize on an
// already-established sheet. This demo's own bootstrap (see pushRecord
// below) can only register a field on a genuinely blank sheet — a sheet
// that already has other columns from an earlier run needs the missing
// one added by hand, directly in the sheet. Surfaced as
// its own actionable banner, not just a line in the collapsed request
// log most visitors never open.
const SCHEMA_ERROR_PATTERN = /^Unknown field: '(.+)'$/

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function showSchemaErrorBanner(bannerId, fieldName) {
  const banner = document.getElementById(bannerId)
  const safeName = escapeHtml(fieldName)
  banner.innerHTML =
    `This sheet doesn't have a <strong>${safeName}</strong> column yet — the public API can't add one silently ` +
    `(a deliberate security rule, not a bug). Add a column named <strong>${safeName}</strong> directly in the sheet, then retry.`
  banner.hidden = false
}

// Returns true (and shows the banner) if this specific, recoverable
// case applies — callers still fall through to their own generic
// error handling/logging either way.
async function checkSchemaError(response, bannerId) {
  if (response.status !== 400) return false
  let body
  try {
    body = await response.clone().json()
  } catch {
    return false
  }
  const match = typeof body?.error === 'string' && body.error.match(SCHEMA_ERROR_PATTERN)
  if (!match) return false
  showSchemaErrorBanner(bannerId, match[1])
  return true
}

// --- Step 2: submit / fake data ---

function flattenRecord(record) {
  return { id: record.id, ...record.fields }
}

async function pushRecord(data) {
  try {
    // `valid: ''` rides along on every create, not just the ones from
    // "Fake N" — this is what actually establishes `valid` as a real
    // sheet column from the very first write. A conduit's write path
    // only ever auto-creates columns while bootstrapping a genuinely
    // blank sheet (see docs/gateway-api.md); step 3's later PATCH can't
    // introduce a brand-new field name at all — that's a deliberate
    // security rule (an anonymous conduit can't grow its owner's real
    // spreadsheet), not a bug to work around, so this file has to be
    // the one place `valid` gets registered.
    const fields = { ...data, valid: '' }
    const response = await fetch(conduitUrls['conduit-1'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    // Logs the *actual* body sent, `valid` included — the whole point
    // of this log is showing real requests; quietly hiding part of the
    // payload would undercut that.
    log('log-step2', `POST ${JSON.stringify(fields)} → ${response.status}`, response.ok ? 'ok' : 'error')
    if (response.ok) {
      document.getElementById('schema-error-step2').hidden = true
    } else {
      await checkSchemaError(response, 'schema-error-step2')
    }
    return response.ok
  } catch (err) {
    log('log-step2', `POST failed: ${err.message}`, 'error')
    return false
  }
}

function updateTotalCount(delta) {
  totalCount += delta
  document.getElementById('total-count').textContent = String(totalCount)
  document.getElementById('to-step-3').disabled = totalCount === 0
}

document.getElementById('submit-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.target
  const data = { name: form.name.value, email: form.email.value }
  if (await pushRecord(data)) {
    updateTotalCount(1)
    unrefetched = true
    form.reset()
  }
})

for (const button of document.querySelectorAll('[data-fake-count]')) {
  button.addEventListener('click', async () => {
    const count = Number(button.dataset.fakeCount)
    let created = 0
    for (let i = 0; i < count; i++) {
      if (i > 0) await sleep(REQUEST_SPACING_MS)
      const ok = await pushRecord(fakePerson())
      if (ok) {
        created += 1
        updateTotalCount(1)
      }
    }
    unrefetched = true
    log('log-step2', `Created ${created}/${count} fake entries.`)
  })
}

const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie']
const LAST_NAMES = ['Rivera', 'Chen', 'Patel', 'Kim', 'Nguyen', 'Brown', 'Garcia', 'Singh']

function fakePerson() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
  const name = `${first} ${last}`
  const email = `${first}.${last}${Math.floor(Math.random() * 1000)}@example.com`.toLowerCase()
  return { name, email }
}

document.getElementById('to-step-3').addEventListener('click', async () => {
  showStep(3)
  await fetchRows()
})

// --- Step 3: read + update validity ---

// A field genuinely never validated yet is either missing entirely (the
// fake test client's seeded rows) or '' (a real sheet cell that's never
// had a value written to it — see rowToFields in sheets.ts, which reads
// a blank cell back as '' rather than null/undefined). Both count as
// "not yet validated" here.
function isUnvalidated(row) {
  return row.valid == null || row.valid === ''
}

async function fetchRows() {
  try {
    const response = await fetch(conduitUrls['conduit-2'])
    const body = await response.json()
    rows = body.records.map(flattenRecord)
    log('log-step3', `GET conduit-2 → ${rows.length} row(s)`, 'ok')
  } catch (err) {
    log('log-step3', `GET failed: ${err.message}`, 'error')
    rows = []
  }
  renderRows()
}

function renderRows() {
  const tbody = document.querySelector('#data-table tbody')
  tbody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement('tr')
      tr.innerHTML = `<td></td><td></td><td></td>`
      tr.children[0].textContent = row.name
      tr.children[1].textContent = row.email
      tr.children[2].textContent = row.valid || '—'
      return tr
    }),
  )
  document.getElementById('no-data-message').hidden = rows.length > 0
  document.getElementById('to-step-4').disabled = unrefetched || rows.length === 0
}

document.getElementById('update-and-refetch').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const unvalidated = rows.filter(isUnvalidated)
  button.disabled = true
  for (const [i, row] of unvalidated.entries()) {
    if (i > 0) await sleep(REQUEST_SPACING_MS)
    const valid = Math.random() < 0.5 ? 'valid' : 'invalid'
    try {
      const response = await fetch(`${conduitUrls['conduit-2']}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { valid } }),
      })
      log('log-step3', `PATCH ${row.id} → ${response.status}, setting valid="${valid}"`, response.ok ? 'ok' : 'error')
      if (response.ok) {
        document.getElementById('schema-error-step3').hidden = true
      } else {
        await checkSchemaError(response, 'schema-error-step3')
      }
    } catch (err) {
      log('log-step3', `PATCH failed: ${err.message}`, 'error')
    }
  }
  button.disabled = false
  unrefetched = false
  await fetchRows()
  log('log-step3', 'Done refetching data.')
})

document.getElementById('to-step-4').addEventListener('click', async () => {
  showStep(4)
  log('log-step4', 'Fetching data using conduit-3 for visualization…')
  try {
    const response = await fetch(conduitUrls['conduit-3'])
    const body = await response.json()
    log('log-step4', `GET conduit-3 → ${body.records.length} row(s)`, 'ok')
    renderChart(body.records.map(flattenRecord))
  } catch (err) {
    log('log-step4', `GET failed: ${err.message}`, 'error')
  }
})

// --- Step 4: visualize ---

function renderChart(dataRows) {
  const total = dataRows.length
  const validCount = dataRows.filter((row) => row.valid === 'valid').length
  const invalidCount = dataRows.filter((row) => row.valid === 'invalid').length
  const validPercent = total ? Math.round((validCount / total) * 100) : 0
  const invalidPercent = total ? Math.round((invalidCount / total) * 100) : 0

  document.getElementById('valid-bar').style.width = `${validPercent}%`
  document.getElementById('invalid-bar').style.width = `${invalidPercent}%`
  document.getElementById('valid-percent').textContent = `${validPercent}%`
  document.getElementById('invalid-percent').textContent = `${invalidPercent}%`
}

// --- Reset ---

document.getElementById('reset-flow').addEventListener('click', () => {
  if (!confirm('Start over? This clears your conduit URLs and everything submitted in this walkthrough (not the underlying spreadsheet itself).')) return

  localStorage.removeItem(STORAGE_KEY)
  conduitUrls = {}
  totalCount = 0
  rows = []
  unrefetched = false

  for (const name of CONDUIT_NAMES) {
    checkedState[name] = false
    document.getElementById(name).value = ''
    const errorEl = document.querySelector(`.field-error[data-for="${name}"]`)
    errorEl.textContent = ''
    errorEl.classList.remove('field-status--ok')
  }
  updateProceedButton()

  document.getElementById('submit-form').reset()
  document.getElementById('total-count').textContent = '0'
  document.getElementById('to-step-3').disabled = true
  document.querySelector('#data-table tbody').replaceChildren()
  document.getElementById('no-data-message').hidden = false
  document.getElementById('to-step-4').disabled = true
  for (const id of ['log-step2', 'log-step3', 'log-step4']) document.getElementById(id).replaceChildren()
  for (const id of ['schema-error-step2', 'schema-error-step3']) document.getElementById(id).hidden = true
  renderChart([])

  showStep(1)
})

showStep(1)
