import { DEFAULT_XYZ_STYLES } from './styles.ts'
import { firstWidget, type PageSpec, type XyzFormProps, type XyzTableProps } from './schema.ts'

// Every interpolated value below can originate from a conduit owner's
// own authoring (block title/description, field labels) or from real
// provider data (a table cell) — never trusted as markup. One escape
// function, used everywhere text/attribute content is interpolated.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface TableRenderData {
  rows: Record<string, unknown>[]
  cursor?: string
  nextCursor?: string | null
}

export interface RenderPageContext {
  curi: string
  // Set once a hosted xyz-form's own PRG redirect (see
  // @conduits/gateway's controller.ts) lands back here with
  // ?submitted=1 — swaps the form for a success message instead of
  // re-rendering an empty form with no memory of what just happened.
  submitted?: boolean
  table?: TableRenderData
}

// A small, genuinely optional enhancement — the form/table above still
// work with zero JavaScript (real <form>/<table> markup, native
// submission and pagination); this only disables the submit button
// during a real submit to avoid an accidental double-post. Registering
// both tags as real custom elements is what makes xyz-form/xyz-table
// actual Conduits web components rather than plain markup that merely
// looks like one — the functional contract never depends on this
// script actually running.
const WIDGET_SCRIPT = `(function () {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('xyz-form')) {
    customElements.define('xyz-form', class extends HTMLElement {
      connectedCallback() {
        var form = this.querySelector('form');
        var button = form && form.querySelector('button[type="submit"]');
        if (form && button) {
          form.addEventListener('submit', function () {
            button.disabled = true;
            button.textContent = 'Submitting…';
          });
        }
      }
    });
  }
  if (!customElements.get('xyz-table')) {
    customElements.define('xyz-table', class extends HTMLElement {});
  }
})();`

function renderFieldInput(field: XyzFormProps['fields'][number]): string {
  const id = `field-${escapeHtml(field.name)}`
  const required = field.required ? ' required' : ''
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : ''

  if (field.type === 'textarea') {
    return `<textarea id="${id}" name="${escapeHtml(field.name)}"${required}${placeholder}></textarea>`
  }
  if (field.type === 'select') {
    const options = (field.options ?? [])
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join('')
    return `<select id="${id}" name="${escapeHtml(field.name)}"${required}>${options}</select>`
  }
  if (field.type === 'checkbox') {
    return `<input type="checkbox" id="${id}" name="${escapeHtml(field.name)}">`
  }
  return `<input type="${escapeHtml(field.type)}" id="${id}" name="${escapeHtml(field.name)}"${required}${placeholder}>`
}

function renderField(field: XyzFormProps['fields'][number]): string {
  const id = `field-${escapeHtml(field.name)}`
  const label = escapeHtml(field.label ?? field.name)
  if (field.type === 'checkbox') {
    return `<div class="xyz-field xyz-field-checkbox">${renderFieldInput(field)}<label for="${id}">${label}</label></div>`
  }
  const requiredMark = field.required ? ' *' : ''
  return `<div class="xyz-field"><label for="${id}">${label}${requiredMark}</label>${renderFieldInput(field)}</div>`
}

function renderXyzForm(props: XyzFormProps, ctx: RenderPageContext): string {
  if (ctx.submitted) {
    const message = escapeHtml(props.successMessage || 'Thanks — your submission was received.')
    return `<xyz-form><div class="xyz-success" role="status">${message} <a href="/${escapeHtml(ctx.curi)}">Submit another response</a></div></xyz-form>`
  }

  const redirectTarget = `/${ctx.curi}?submitted=1`
  const fields = props.fields.map(renderField).join('')
  const submitLabel = escapeHtml(props.submitLabel || 'Submit')

  return `<xyz-form><form method="post" action="" enctype="application/x-www-form-urlencoded">
<input type="hidden" name="_redirect" value="${escapeHtml(redirectTarget)}">
${fields}
<button type="submit" class="xyz-submit">${submitLabel}</button>
</form></xyz-form>`
}

function renderXyzTable(props: XyzTableProps, table: TableRenderData | undefined): string {
  const rows = table?.rows ?? []
  const headerRow = props.columns.map((column) => `<th>${escapeHtml(column.label ?? column.field)}</th>`).join('')

  const bodyRows =
    rows.length === 0
      ? `<tr><td class="xyz-table-empty" colspan="${props.columns.length}">${escapeHtml(props.emptyMessage || 'No records yet.')}</td></tr>`
      : rows
          .map((row) => `<tr>${props.columns.map((column) => `<td>${escapeHtml(row[column.field])}</td>`).join('')}</tr>`)
          .join('')

  const nextLink =
    table?.nextCursor != null
      ? `<div class="xyz-table-nav"><a href="?cursor=${encodeURIComponent(table.nextCursor)}">Next →</a></div>`
      : ''

  return `<xyz-table><div class="xyz-table-wrapper"><table class="xyz-table"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>${nextLink}</xyz-table>`
}

function documentShell(title: string, headerHtml: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${DEFAULT_XYZ_STYLES}</style>
</head>
<body>
<main class="xyz-page">
${headerHtml}
${bodyHtml}
</main>
<script>${WIDGET_SCRIPT}</script>
</body>
</html>`
}

// The full hosted page for a v1 PageSpec — exactly one Block, exactly
// one Widget (enforced by PageSpecV1Schema before this ever runs, not
// re-checked here). Pure: everything it needs about the conduit's own
// data (a table's rows, whether a submission just landed here via PRG)
// arrives already resolved in `ctx` — this function never fetches
// anything itself.
export function renderHostedPage(page: PageSpec, ctx: RenderPageContext): string {
  const block = page.blocks[0]!
  const widget = firstWidget(page)
  const title = escapeHtml(block.title || ctx.curi)
  const header = [
    block.title ? `<h1 class="xyz-block-title">${escapeHtml(block.title)}</h1>` : '',
    block.description ? `<p class="xyz-block-description">${escapeHtml(block.description)}</p>` : '',
  ].join('')
  const body = widget.type === 'xyz-form' ? renderXyzForm(widget.props, ctx) : renderXyzTable(widget.props, ctx.table)
  return documentShell(title, header, body)
}

// A hosted-page visitor must never land on raw API JSON because a
// provider or validation operation failed (see @conduits/gateway's
// dispatch.ts, which calls this only for a >=400 response from the
// same curi's write path once content negotiation says the caller
// prefers HTML) — a generic failure state: no field-level error
// protocol, no echoed field values.
export function renderHostedFailurePage(page: PageSpec, ctx: { curi: string }): string {
  const block = page.blocks[0]
  const title = escapeHtml(block?.title || ctx.curi)
  const body = `<div class="xyz-error" role="alert">
<h1>Something went wrong</h1>
<p>We couldn't process your submission. Please check your entries and try again.</p>
<a href="/${escapeHtml(ctx.curi)}">← Back to the form</a>
</div>`
  return documentShell(title, '', body)
}
