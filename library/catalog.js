const state = { items: [], search: '', category: 'all' }
const labels = { capture: 'Capture', feedback: 'Feedback', engagement: 'Engagement', events: 'Events', utilities: 'Utilities' }

async function loadItems() {
  const response = await fetch('./catalog.json')
  if (!response.ok) throw new Error('Library metadata could not be loaded.')
  const items = await response.json()
  if (!Array.isArray(items)) throw new Error('Library metadata has an invalid format.')
  state.items = items.filter((item) => item.kind === 'widget')
  render()
}

function matches(item) {
  const query = state.search.trim().toLowerCase()
  const author = item.author || {}
  const text = `${item.name} ${item.description} ${labels[item.category] || item.category} ${author.name || ''} ${author.websiteTitle || ''} ${author.twitter || ''}`.toLowerCase()
  return (!query || text.includes(query)) &&
    (state.category === 'all' || item.category === state.category)
}

function card(item) {
  const detailHref = escapeAttribute(`widgets/${item.slug}/`)
  const author = item.author || {}
  const authorName = author.name || 'Conduits'
  const authorHref = author.websiteUrl || author.url ? ` href="${escapeAttribute(author.websiteUrl || author.url)}"` : ''
  const authorLink = `<a${authorHref} class="card-author-link">${escapeHtml(authorName)}</a>`
  const social = author.twitter ? `<span class="card-author-social">@${escapeHtml(author.twitter)}</span>` : ''
  return `<article class="catalog-card">
    <div class="card-body">
      <div class="card-meta"><span>${escapeHtml(labels[item.category] || item.category)}</span><span class="card-author">By ${authorLink}${social}</span></div>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="card-footer"><a href="${detailHref}">View widget <span aria-hidden="true">↗</span></a><button class="copy-button" data-copy="${escapeAttribute(item.slug)}">Copy embed</button></div>
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
  featuredList.innerHTML = state.items.filter((item) => item.featured).slice(0, 3).map((item) => `<a class="featured-item" href="${escapeAttribute(`widgets/${item.slug}/`)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></a>`).join('')
}

async function copyEmbed(button) {
  const slug = button.dataset.copy
  const tag = state.items.find((item) => item.slug === slug)?.tag || slug
  const snippet = `<link rel="stylesheet" href="/library/widgets/${slug}/style.css">\n<script src="/library/widgets/${slug}/${slug}.js"></script>\n<${tag} conduit-url="YOUR_CONDUIT_URL"></${tag}>`
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
document.querySelectorAll('[data-category]').forEach((tag) => tag.addEventListener('click', () => {
  state.category = tag.dataset.category
  document.querySelectorAll('.category-tag').forEach((candidate) => candidate.classList.toggle('is-active', candidate === tag))
  render()
}))
loadItems().catch((error) => { document.querySelector('#catalog-grid').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>` })
