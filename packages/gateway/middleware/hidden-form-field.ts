import type { HiddenFormFieldRule } from '../types.ts'
import type { ConduitFields } from '@conduits/conduit'

// A plain function, not middleware — evaluated once per record so a bulk
// request can keep each record's outcome independent.
//
// Every failure — a tripped honeypot (drop-if-filled) or a mismatched
// pass-if-match value — is handled identically: silently succeed without
// writing, never a 4xx.
export type HiddenFormFieldOutcome =
  // `fields` is the submitted set, minus any rule configured with
  // `include: false` — those are validated (or, for drop-if-filled,
  // watched as a honeypot) but never forwarded to the source, per that
  // field's own documented meaning ("whether the field is forwarded to
  // the target", docs/gateway-api.md).
  | { outcome: 'ok'; fields: ConduitFields }
  // Silently succeed without writing. `fields` is the submitted set with
  // the field that caused the drop (and any other include: false field)
  // already stripped out, ready to echo back in the faked response.
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
      // Always excluded, unconditionally — a drop-if-filled field is a
      // trap, never real data.
      const { [rule.fieldName]: _excluded, ...rest } = kept
      kept = rest
      continue
    }

    // pass-if-match. Stringified before comparing: a JSON body can send a
    // field's value as a raw number/boolean, and rule.value is always a
    // string — comparing the submitted value's own string form is what
    // makes a numeric-looking campaign token still match.
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
