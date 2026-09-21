const state = { items: [], search: '', tag: 'all' }

function tagLabel(tag) {
  return tag.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

async function loadItems() {
  const response = await fetch('./catalog.json')
  if (!response.ok) throw new Error('Library metadata could not be loaded.')
  const items = await response.json()
  if (!Array.isArray(items)) throw new Error('Library metadata has an invalid format.')
  state.items = items.filter((item) => item.kind === 'widget')
  renderTagFilters()
  render()
}

function renderTagFilters() {
  const filters = document.querySelector('#tag-filters')
  if (!filters) return
  const tags = [...new Set(state.items.flatMap((item) => Array.isArray(item.tags) ? item.tags : []))].sort()
  filters.innerHTML = ['all', ...tags].map((tag) => `<button class="tag-filter${state.tag === tag ? ' is-active' : ''}" type="button" data-tag="${escapeAttribute(tag)}">${tag === 'all' ? 'All tags' : escapeHtml(tagLabel(tag))}</button>`).join('')
  filters.querySelectorAll('[data-tag]').forEach((tag) => tag.addEventListener('click', () => {
    state.tag = tag.dataset.tag
    filters.querySelectorAll('.tag-filter').forEach((candidate) => candidate.classList.toggle('is-active', candidate === tag))
    render()
  }))
}

function matches(item) {
  const query = state.search.trim().toLowerCase()
  const author = item.author || {}
  const tags = Array.isArray(item.tags) ? item.tags : []
  const tagText = [...new Set(tags.map((tag) => `${tag} ${tagLabel(tag)}`))].join(' ')
  const socialText = Object.values(author.social || {}).join(' ')
  const text = `${item.name} ${item.description} ${tagText} ${author.name || ''} ${socialText}`.toLowerCase()
  return (!query || text.includes(query)) &&
    (state.tag === 'all' || (Array.isArray(item.tags) && item.tags.includes(state.tag)))
}

function card(item) {
  const detailHref = escapeAttribute(`widgets/${item.slug}/`)
  const author = item.author || {}
  const socialLabels = { github: 'GitHub', x: 'X', bluesky: 'Bluesky' }
  const socialIcons = {
    github: '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path fill="currentColor" d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"/></svg>',
    x: '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path fill="currentColor" d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>',
    bluesky: '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path fill="currentColor" d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/></svg>',
  }
  const socialUrls = {
    github: (handle) => `https://github.com/${handle.replace(/^@/, '')}`,
    x: (handle) => `https://x.com/${handle.replace(/^@/, '')}`,
    bluesky: (handle) => `https://bsky.app/profile/${handle.replace(/^@/, '')}`,
  }
  const social = Object.entries(author.social || {}).map(([network, handle]) => {
    const label = `${socialLabels[network] || network}: ${handle}`
    const url = socialUrls[network]?.(handle)
    return url ? `<a class="card-author-social" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer noopener" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}">${socialIcons[network] || escapeHtml(socialLabels[network] || network)}</a>` : ''
  }).join('')
  const tags = Array.isArray(item.tags) ? item.tags : []
  const tagChips = tags.map((tag) => `<span class="card-tag">${escapeHtml(tagLabel(tag))}</span>`).join('')
  return `<article class="catalog-card">
    <div class="card-body">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="card-tags">${tagChips}</div>
      <div class="card-footer"><div class="card-socials">${social}</div><div class="card-actions"><a class="card-action" href="${detailHref}">View <span aria-hidden="true">↗</span></a><button class="card-action copy-button" data-copy="${escapeAttribute(item.slug)}">Copy <span aria-hidden="true">⧉</span></button></div></div>
    </div>
  </article>`
}

function render() {
  const visible = state.items.filter(matches)
  const grid = document.querySelector('#catalog-grid')
  const empty = document.querySelector('#empty-state')
  const count = document.querySelector('#catalog-count')
  if (!grid) throw new Error('Library catalog markup is missing.')
  grid.innerHTML = visible.map(card).join('')
  if (empty) empty.hidden = visible.length !== 0
  if (count) count.textContent = `${visible.length} widgets`
  renderFeatured()
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyEmbed(button)))
}

function renderFeatured() {
  const featuredList = document.querySelector('#featured-list')
  if (!featuredList) return
  const featured = window.conduitsLibraryConfig?.featuredWidgets || []
  featuredList.innerHTML = featured.map((slug) => state.items.find((item) => item.slug === slug)).filter(Boolean).slice(0, 3).map((item) => `<a class="featured-item" href="${escapeAttribute(`widgets/${item.slug}/`)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></a>`).join('')
}

async function copyEmbed(button) {
  const slug = button.dataset.copy
  const snippet = `<link rel="stylesheet" href="/library/widgets/${slug}/style.css">\n<script src="/library/widgets/${slug}/${slug}.js"></script>\n<${slug} conduit-url="YOUR_CONDUIT_URL"></${slug}>`
  try {
    await navigator.clipboard.writeText(snippet)
    button.textContent = 'Copied'
    setTimeout(() => { button.textContent = 'Copy embed' }, 1400)
  } catch {
    button.textContent = 'Open docs to copy'
  }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) }
function escapeAttribute(value) { return escapeHtml(value) }

document.querySelector('#search').addEventListener('input', (event) => { state.search = event.target.value; render() })
loadItems().catch((error) => { document.querySelector('#catalog-grid').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>` })
