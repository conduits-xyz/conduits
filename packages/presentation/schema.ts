import { z } from 'zod'

// The canonical widget catalog. A widget is a meaningful functional
// capability, not a layout primitive. Adding a new entry here is a real
// product decision (xyz-picker/xyz-uploader/
// xyz-calendar/xyz-payment are the named future direction, not
// speculative extras) — this union is deliberately closed, so an
// unrecognized or not-yet-implemented widget type is a validation
// error, never silently accepted.
export const XYZ_FORM_FIELD_TYPES = ['text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'checkbox', 'select'] as const
export type XyzFormFieldType = (typeof XYZ_FORM_FIELD_TYPES)[number]

export const XyzFormFieldSchema = z.object({
  // The submitted field name — becomes the conduit's own widget-facing
  // field name (see @conduits/conduit's field-map.ts), unchanged.
  name: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(XYZ_FORM_FIELD_TYPES).default('text'),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  // 'select' only — ignored for every other type.
  options: z.array(z.string()).optional(),
})
export type XyzFormField = z.infer<typeof XyzFormFieldSchema>

export const XyzFormPropsSchema = z.object({
  fields: z.array(XyzFormFieldSchema).min(1),
  submitLabel: z.string().optional(),
  successMessage: z.string().optional(),
})
export type XyzFormProps = z.infer<typeof XyzFormPropsSchema>

export const XyzTableColumnSchema = z.object({
  // The widget-facing field name to display — same namespace as
  // xyz-form's own field names and the conduit's read response.
  field: z.string().min(1),
  label: z.string().optional(),
})
export type XyzTableColumn = z.infer<typeof XyzTableColumnSchema>

export const XyzTablePropsSchema = z.object({
  columns: z.array(XyzTableColumnSchema).min(1),
  pageSize: z.number().int().positive().max(200).optional(),
  emptyMessage: z.string().optional(),
})
export type XyzTableProps = z.infer<typeof XyzTablePropsSchema>

// Discriminated on `type` — zod rejects any value whose `type` isn't
// one of the two literals below, which is exactly what keeps a
// not-yet-implemented widget name (xyz-picker, say) from being
// accidentally accepted before real support for it exists.
export const WidgetSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('xyz-form'), props: XyzFormPropsSchema }),
  z.object({ type: z.literal('xyz-table'), props: XyzTablePropsSchema }),
])
export type WidgetSpec = z.infer<typeof WidgetSpecSchema>
export type WidgetType = WidgetSpec['type']

// A Block is a structural/content grouping, not a widget and not a
// low-level layout primitive. Only what this version actually needs
// (title/description/widgets) — no layout, spacing, or visibility yet;
// those are real future fields on this same shape, not a reason to
// invent a separate concept now.
export const BlockSpecSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  widgets: z.array(WidgetSpecSchema).min(1),
})
export type BlockSpec = z.infer<typeof BlockSpecSchema>

// The canonical, general shape — arrays of Blocks and Widgets, so
// growing to N blocks/N widgets later is an app-layer capability change
// (loop over what's already an array), never a schema rewrite or a
// database migration. `version` is carried from day one so a future
// shape change has somewhere to branch from.
export const PageSpecSchema = z.object({
  version: z.literal(1),
  blocks: z.array(BlockSpecSchema).min(1),
})
export type PageSpec = z.infer<typeof PageSpecSchema>

// Version 1's own cardinality restriction (exactly one Block, exactly
// one Widget), layered on top of the general schema above rather than
// baked into it. Relaxing this later (more blocks, more widgets per
// block) never requires touching PageSpecSchema/
// BlockSpecSchema/WidgetSpecSchema themselves, only this refinement.
export const PageSpecV1Schema = PageSpecSchema.refine((page) => page.blocks.length === 1, {
  message: 'Version 1 supports exactly one Block per Page',
  path: ['blocks'],
}).refine((page) => page.blocks[0]!.widgets.length === 1, {
  message: 'Version 1 supports exactly one Widget per Block',
  path: ['blocks', 0, 'widgets'],
})

// The one Block/Widget a v1 PageSpec is guaranteed (by PageSpecV1Schema)
// to have — a small accessor so callers don't repeat the [0][0] indexing
// and its accompanying "this is only safe because v1 enforces exactly
// one" reasoning at every call site.
export function firstWidget(page: PageSpec): WidgetSpec {
  return page.blocks[0]!.widgets[0]!
}
