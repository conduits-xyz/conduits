import { toWidgetFields } from '@conduits/conduit'
import { firstWidget, renderHostedPage } from '@conduits/presentation'

import type { GatewayContext } from './context.ts'
import { htmlResponse } from './response.ts'
import { requireConduitConfig, requireConduitTable } from './require-context.ts'

// The "bare" conduit-path action for a GET dispatch.ts has already
// decided prefers HTML and has a page configured for (see
// content-negotiation.ts and dispatch.ts's own bare-GET branch) — the
// HTML sibling of controller.ts's actions.list, sharing the identical
// resolveConduitConfig/loadConduitTable middleware pipeline. A v1
// PageSpec is guaranteed by PageSpecV1Schema (validated wherever the
// config was authored) to have exactly one Block and one Widget —
// firstWidget() reads that pair, never re-validated here.
export interface GatewayPageActions {
  renderPage(context: GatewayContext): Promise<Response>
}

export function createGatewayPageActions(): GatewayPageActions {
  return {
    async renderPage(context) {
      const config = requireConduitConfig(context)
      const page = config.presentation
      if (!page) return htmlResponse('Not Found', 404)

      const widget = firstWidget(page)
      const submitted = context.url.searchParams.get('submitted') === '1'

      if (widget.type === 'xyz-table') {
        const table = requireConduitTable(context)
        const cursor = context.url.searchParams.get('cursor') ?? undefined
        const { fieldMap } = config.suriConfig
        const { records, nextCursor } = await table.listRecords({ cursor, limit: widget.props.pageSize })
        const rows = records.map((record) => toWidgetFields(record.fields, fieldMap))
        return htmlResponse(renderHostedPage(page, { curi: config.curi, submitted, table: { rows, cursor, nextCursor } }))
      }

      return htmlResponse(renderHostedPage(page, { curi: config.curi, submitted }))
    },
  }
}
