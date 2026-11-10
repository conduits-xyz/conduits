// Raw parsed YAML, loosely typed. compile.ts and sources/* validate it
// (required fields, and checks such as bearerToken.requiredFor being a
// subset of methods).

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

export type RawRouteEntry = {
  host?: unknown
  path?: unknown
}
