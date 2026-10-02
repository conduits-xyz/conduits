// Lists the pages from catalog.json, as catalog.js lists widgets
// (catalog.js also has embed links, search and copy buttons).

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
  // The empty .card-socials keeps "Read" right-aligned in .card-footer.
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
