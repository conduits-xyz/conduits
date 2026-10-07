import { fromFormValues, toClientValues, toSourceFields, toStoredValues, toWidgetFields, valueProblems, type ConduitFields, type RequestFields } from '@conduits/conduit'

import { pointerSegment, problemResponse, type FieldError } from './response.ts'
import type { ConduitConfig } from './types.ts'

// A write's field values, between what a client sends and receives and
// what the source stores: the conduit's fields (field-schema.ts in
// @conduits/conduit) and its fieldMap.

// A write's values checked against the conduit's fields: the values to
// write (a form's read by their fields first), or 400 invalid_value
// with one error per refused value. `bulk`: the list is the body's
// records, in order; a null entry (a dropped record) is skipped.
export function checkFieldValues(
  fieldsList: (RequestFields | null)[],
  config: ConduitConfig,
  options: { bulk: boolean; form: boolean },
): RequestFields[] | Response {
  const read = fieldsList.map((fields) => (fields && options.form ? fromFormValues(fields, config.fields) : fields))
  const refused = refuseInvalidValues(read.map((fields) => fields ?? {}), config, options.bulk)
  return refused ?? read.filter((fields): fields is RequestFields => fields !== null)
}

function refuseInvalidValues(fieldsList: RequestFields[], config: ConduitConfig, bulk: boolean): Response | null {
  const errors: FieldError[] = fieldsList.flatMap((fields, index) =>
    valueProblems(fields, config.fields).map(({ field, detail }) => ({
      code: 'invalid_value' as const,
      field,
      pointer: `${bulk ? `/records/${index}` : ''}/fields/${pointerSegment(field)}`,
      detail,
    })),
  )
  if (errors.length === 0) return null
  return problemResponse('invalid_value', { detail: errors.length === 1 ? errors[0]!.detail : `${errors.length} values aren't allowed.`, errors })
}

// For the source: empty values as null, each list joined into one
// value, field names to column names.
export function toStoredFields(fields: RequestFields, config: ConduitConfig): ConduitFields {
  return toSourceFields(toStoredValues(fields), config.suriConfig.fieldMap)
}

// For the client: column names to field names, each value typed by its
// field.
export function toClientFields(fields: ConduitFields, config: ConduitConfig): RequestFields {
  return toClientValues(toWidgetFields(fields, config.suriConfig.fieldMap), config.fields)
}
