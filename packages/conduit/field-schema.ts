import type { ConduitFields } from './sheets.ts'

// A conduit's fields and their types (ConduitConfig.fields in
// @conduits/gateway; `fields:` in conduits.yaml): what each field's
// value is in every request and response, whatever the source. The
// gateway refuses a write whose values don't fit (valueProblems), gives
// the source each value as it stores it (toStoredValues), and types
// every value it reads back (toClientValues). See docs/gateway-api.md
// "Fields".

export const FIELD_TYPES = ['text', 'textarea', 'email', 'tel', 'url', 'number', 'date', 'single_select', 'multi_select'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const CHOICE_TYPES: readonly FieldType[] = ['single_select', 'multi_select']

export interface FieldSchema {
  type: FieldType
  // single_select and multi_select only: the options, in the order a
  // form shows them.
  options?: string[]
}

// By field name, as clients send it (before fieldMap).
export type FieldSchemas = Record<string, FieldSchema>

// A multi_select list is stored as one value, its options joined by
// this, as Google Forms stores a checkbox answer in a sheet. No option
// can contain a comma (fieldDefinitionProblems), so splitting gives
// them back exactly, and a list of options can be written with commas.
// The rule is the same for both choice types, so changing a field from
// one to the other never makes its options invalid.
export const MULTI_SELECT_SEPARATOR = ', '

// A field value as clients send and receive it: a value a source stores,
// or a multi_select field's list of options.
export type FieldValue = string | number | boolean | null | string[]
export type RequestFields = Record<string, FieldValue>

export interface ValueProblem {
  field: string
  detail: string
}

// What is wrong with one field's definition, for a config compiler or a
// dashboard to report before the conduit is used. Empty when it is
// valid.
export function fieldDefinitionProblems(definition: { type: unknown; options?: unknown }): string[] {
  if (!FIELD_TYPES.includes(definition.type as FieldType)) return [`type must be one of ${FIELD_TYPES.join(', ')}`]
  const isChoice = CHOICE_TYPES.includes(definition.type as FieldType)
  if (!isChoice) return definition.options === undefined ? [] : ['only single_select and multi_select take options']
  if (!Array.isArray(definition.options) || definition.options.length === 0) return ['needs at least one option']
  const problems: string[] = []
  const seen = new Set<string>()
  for (const option of definition.options) {
    if (typeof option !== 'string' || option.trim() === '') {
      problems.push('every option must be non-empty text')
      continue
    }
    if (option !== option.trim()) problems.push(`option '${option}' has spaces at its start or end`)
    if (option.includes(',')) problems.push(`option '${option}' contains a comma, which an option can't`)
    const key = option.toLowerCase()
    if (seen.has(key)) problems.push(`option '${option}' is listed twice`)
    seen.add(key)
  }
  return problems
}

// The WHATWG rule a browser applies to <input type="email">, so a form
// and the API accept the same addresses.
const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}

const isEmpty = (value: FieldValue) => value === null || value === '' || (Array.isArray(value) && value.length === 0)
const listed = (options: string[]) => options.join(', ')

// What the value of one field of type `schema` must be, or undefined
// when `value` fits.
function valueProblem(field: string, value: FieldValue, schema: FieldSchema): string | undefined {
  switch (schema.type) {
    case 'text':
    case 'textarea':
    case 'tel':
      return typeof value === 'string' ? undefined : `${field} must be text.`
    case 'email':
      return typeof value === 'string' && EMAIL_PATTERN.test(value) ? undefined : `${field} must be an email address.`
    case 'url':
      return typeof value === 'string' && isWebAddress(value) ? undefined : `${field} must be a web address starting with http:// or https://.`
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : `${field} must be a number.`
    case 'date':
      return typeof value === 'string' && isCalendarDate(value) ? undefined : `${field} must be a date written YYYY-MM-DD.`
    case 'single_select': {
      const options = schema.options ?? []
      return typeof value === 'string' && options.includes(value) ? undefined : `${field} must be one of: ${listed(options)}.`
    }
    case 'multi_select': {
      const options = schema.options ?? []
      if (!Array.isArray(value)) return `${field} must be a list of options.`
      const unknown = value.filter((option) => !options.includes(option))
      if (unknown.length > 0) return `${field} has ${listed(unknown)}, not among: ${listed(options)}.`
      const repeated = value.find((option, index) => value.indexOf(option) !== index)
      return repeated === undefined ? undefined : `${field} lists ${repeated} twice.`
    }
  }
}

// The values in `fields` that the conduit's fields refuse, one problem
// per field. An empty value (null, '' or an empty list) is accepted for
// every type. A field the conduit doesn't declare may have any value
// but a list (whether it may be sent at all is checkKnownFields').
export function valueProblems(fields: RequestFields, schemas: FieldSchemas): ValueProblem[] {
  const problems: ValueProblem[] = []
  for (const [field, value] of Object.entries(fields)) {
    const schema = schemas[field]
    if (!schema) {
      if (Array.isArray(value)) problems.push({ field, detail: `${field} doesn't take a list.` })
      continue
    }
    if (isEmpty(value)) continue
    const detail = valueProblem(field, value, schema)
    if (detail) problems.push({ field, detail })
  }
  return problems
}

// The number `text` writes, or undefined when it isn't one.
function numberIn(text: string): number | undefined {
  const trimmed = text.trim()
  const number = Number(trimmed)
  return trimmed !== '' && Number.isFinite(number) ? number : undefined
}

// A form's values (all strings) as the JSON a client would send, by
// their fields: a number field's numeric text as a number, a
// multi_select's single value as a one-option list. Anything else is
// left for valueProblems to judge.
export function fromFormValues(fields: RequestFields, schemas: FieldSchemas): RequestFields {
  return Object.fromEntries(
    Object.entries(fields).map(([field, value]) => {
      const type = schemas[field]?.type
      if (type === 'number' && typeof value === 'string') return [field, value.trim() === '' ? null : (numberIn(value) ?? value)]
      if (type === 'multi_select' && typeof value === 'string') return [field, value === '' ? [] : [value]]
      return [field, value]
    }),
  )
}

// The fields as the source stores them: empty values as null, each list
// joined into one value. For fields valueProblems accepted.
export function toStoredValues(fields: RequestFields): ConduitFields {
  return Object.fromEntries(
    Object.entries(fields).map(([field, value]) => {
      if (isEmpty(value)) return [field, null]
      return [field, Array.isArray(value) ? value.join(MULTI_SELECT_SEPARATOR) : value]
    }),
  )
}

// The fields as clients receive them, typed by their schema: a number
// field's value as a number, a multi_select's as a list (empty when
// nothing is stored), every other declared field's as text, and an
// empty value as null. A stored value that doesn't fit its type (typed
// into the sheet by hand) is returned as text, unchanged. A field
// without a schema is returned as the source gave it.
export function toClientValues(fields: ConduitFields, schemas: FieldSchemas): RequestFields {
  return Object.fromEntries(
    Object.entries(fields).map(([field, value]) => {
      const schema = schemas[field]
      if (!schema) return [field, value]
      const empty = value === null || value === ''
      if (schema.type === 'multi_select') return [field, empty ? [] : String(value).split(MULTI_SELECT_SEPARATOR)]
      if (empty) return [field, null]
      if (schema.type === 'number') return [field, typeof value === 'number' ? value : (numberIn(String(value)) ?? String(value))]
      return [field, String(value)]
    }),
  )
}
