// The library's catalog cards: the widgets list (catalog.js) and the
// pages list (pages/pages.js) draw an item with these.

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function tagLabel(tag) {
  return tag.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

// An item's card. `socials` and `actions` are HTML for the footer; an
// empty `socials` keeps the actions right-aligned.
export function card(item, { socials, actions }) {
  const tags = Array.isArray(item.tags) ? item.tags : []
  const tagChips = tags.map((tag) => `<span class="card-tag">${escapeHtml(tagLabel(tag))}</span>`).join('')
  return `<article class="catalog-card">
    <div class="card-body">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="card-tags">${tagChips}</div>
      <div class="card-footer"><div class="card-socials">${socials}</div><div class="card-actions">${actions}</div></div>
    </div>
  </article>`
}
