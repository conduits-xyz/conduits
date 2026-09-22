// Not catalog.js: that's widget-specific (embed hrefs, search/tag
// filtering, copy-snippet button). Reads the same catalog.json so this
// list can't drift from each page.json.

function tagLabel(tag) {
  return tag.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}
function escapeAttribute(value) {
  return escapeHtml(value)
}

function card(item) {
  const detailHref = escapeAttribute(`${item.slug}/`)
  const tags = Array.isArray(item.tags) ? item.tags : []
  const tagChips = tags.map((tag) => `<span class="card-tag">${escapeHtml(tagLabel(tag))}</span>`).join('')
  // Empty .card-socials kept (not omitted) so .card-footer's
  // space-between layout still right-aligns "Read".
  return `<article class="catalog-card">
    <div class="card-body">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="card-tags">${tagChips}</div>
      <div class="card-footer"><div class="card-socials"></div><div class="card-actions"><a class="card-action" href="${detailHref}">Read <span aria-hidden="true">↗</span></a></div></div>
    </div>
  </article>`
}

async function render() {
  const grid = document.querySelector('#pages-grid')
  const count = document.querySelector('#pages-count')
  try {
    const response = await fetch('../catalog.json')
    if (!response.ok) throw new Error('Library metadata could not be loaded.')
    const all = await response.json()
    if (!Array.isArray(all)) throw new Error('Library metadata has an invalid format.')
    const items = all.filter((item) => item.kind === 'page')
    grid.innerHTML = items.map(card).join('')
    if (count) count.textContent = `${items.length} pages`
  } catch (error) {
    grid.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`
  }
}

render()
