import type { HiddenFormFieldRule } from '../types.ts'
import type { ConduitFields } from '@conduits/conduit'

// Called once per record, not as middleware, so each record in a bulk
// request has its own outcome. A tripped honeypot (drop-if-filled) or a
// pass-if-match mismatch both succeed silently without writing, never a
// 4xx.
export type HiddenFormFieldOutcome =
  // The submitted fields without those configured `include: false`,
  // which are checked but not sent to the source (docs/gateway-api.md).
  | { outcome: 'ok'; fields: ConduitFields }
  // Succeed without writing. `fields` excludes the triggering field and
  // every `include: false` field, for the response.
  | { outcome: 'dropped'; fields: ConduitFields }

export function checkHiddenFormField(rules: HiddenFormFieldRule[], fields: ConduitFields): HiddenFormFieldOutcome {
  let kept = fields

  for (const rule of rules) {
    const submitted = kept[rule.fieldName]

    if (rule.policy === 'drop-if-filled') {
      if (submitted != null && submitted !== '') {
        const { [rule.fieldName]: _dropped, ...rest } = kept
        return { outcome: 'dropped', fields: rest }
      }
      // Always excluded: a drop-if-filled field is a trap, not data.
      const { [rule.fieldName]: _excluded, ...rest } = kept
      kept = rest
      continue
    }

    // pass-if-match. Compared as strings: JSON may send a number or
    // boolean, and rule.value is a string.
    if (String(submitted ?? '') !== rule.value) {
      const { [rule.fieldName]: _dropped, ...rest } = kept
      return { outcome: 'dropped', fields: rest }
    }
    if (!rule.include) {
      const { [rule.fieldName]: _excluded, ...rest } = kept
      kept = rest
    }
  }

  return { outcome: 'ok', fields: kept }
}
