// Everything here describes untrusted, raw parsed YAML — deliberately
// loose. Real validation (required fields, cross-field checks like
// bearerToken.requiredFor being a subset of methods) happens in
// compile.ts and sources/*, not here; these types exist only so that
// code isn't reading off a bare `unknown` with no structure at all.

export type RawConduitsFile = {
  conduits?: unknown
}

export type RawAllowlistEntry =
  | string
  | {
      ip?: unknown
      comment?: unknown
    }

export type RawHiddenField = {
  name?: unknown
  policy?: unknown
  value?: unknown
  forward?: unknown
}
