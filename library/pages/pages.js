import { card, escapeHtml } from '../catalog-card.js'

// The pages list, from catalog.json, as catalog.js lists the widgets.

const grid = document.querySelector('#pages-grid')

async function render() {
  try {
    const response = await fetch('../catalog.json')
    if (!response.ok) throw new Error('Library metadata could not be loaded.')
    const items = (await response.json()).filter((item) => item.kind === 'page')
    grid.innerHTML = items.map((item) => card(item, { socials: '', actions: `<a class="card-action" href="${escapeHtml(`${item.slug}/`)}">Read <span aria-hidden="true">↗</span></a>` })).join('')
    document.querySelector('#pages-count').textContent = `${items.length} pages`
  } catch (error) {
    grid.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`
  }
}

render()
