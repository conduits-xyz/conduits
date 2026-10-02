// A moderated submission flow over three conduits with different
// access: submit through a write-only conduit, read and update through a
// read/update conduit, then read through a read-only conduit and chart
// validity.
//
// Records are `{fields: {...}}` and lists are `{records: [{id, fields,
// createdTime}, ...]}`, as in Airtable's API. flattenRecord turns each
// into `{id, name, email, valid}` right after fetching.

const STORAGE_KEY = 'conduit-validation-flow.conduitUrls'

// Conduits are throttled to 5 requests a second by default, so the
// fake-data and validity loops wait this long between requests (200ms
// would be exactly 5 a second).
const REQUEST_SPACING_MS = 220

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// `kind` sets the line's colour (style.css .console-line--*): 'ok' or
// 'error' for a request's outcome, 'info' otherwise. Each step logs to
// its own panel (targetId).
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

// .conduits/readyz confirms a curi is an active conduit, without RACM,
// a token or source access, so a wrong URL or inactive conduit is caught
// in step 1 rather than as 404s in step 2.
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
  // One step is shown at a time; the others keep their state, so going
  // back with the progress bar returns to it.
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step-${i}`).hidden = i !== step
  }
  for (const el of document.querySelectorAll('.progress-step')) {
    const n = Number(el.dataset.step)
    const done = n < step
    el.classList.toggle('is-current', n === step)
    el.classList.toggle('is-done', done)
    // Only completed steps are focusable and act as buttons.
    el.tabIndex = done ? 0 : -1
    el.setAttribute('role', done ? 'button' : 'listitem')
    // The checkmark replaces the number; drawing it over the number left
    // both unreadable.
    el.querySelector('.progress-dot').textContent = done ? '✓' : String(n)
  }
  if (step >= 2) updateActiveConduitLabels()
}

// Each step after the first names the conduit its requests use.
function updateActiveConduitLabels() {
  const labels = { 'conduit-1-label': conduitUrls['conduit-1'], 'conduit-2-label': conduitUrls['conduit-2'], 'conduit-3-label': conduitUrls['conduit-3'] }
  for (const [id, url] of Object.entries(labels)) {
    const el = document.getElementById(id)
    if (el) el.textContent = url ?? ''
  }
}

// Clicking a completed step's dot, or pressing Enter or Space on it,
// goes back to that step.
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
// Each URL must pass its own Check (.conduits/readyz) before "Proceed to
// step 2" is enabled. Editing a checked URL unchecks it.

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

  // A URL restored from localStorage must be checked again; the conduit
  // may have been deactivated since.
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

// --- Schema errors ---
//
// A field the gateway doesn't recognize on a sheet that already has
// columns. pushRecord can add `valid` only to a blank sheet; on a sheet
// from an earlier run it must be added by hand. Shown as a banner,
// since few visitors open the request log.
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

// Shows the banner and returns true when this is the error; callers
// still run their own error handling.
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
    // Every create sends `valid: ''` so the first write adds a `valid`
    // column. Writes add columns only to a blank sheet
    // (docs/gateway-api.md), and step 3's PATCH can't add one: an
    // anonymous caller can't change the owner's sheet.
    const fields = { ...data, valid: '' }
    const response = await fetch(conduitUrls['conduit-1'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    // Logs the body as sent, `valid` included.
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

// Not yet validated: `valid` is missing (rows seeded by the test fake)
// or '' (a blank cell; see rowToFields in sheets.ts).
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
