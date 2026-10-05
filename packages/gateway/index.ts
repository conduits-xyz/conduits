export type {
  AllowlistEntry,
  HiddenFormFieldRule,
  SuriConfig,
  ConduitConfig,
  ApiKeyRef,
  GatewayRuntime,
  GatewayObservation,
  RouteKind,
  StatusClass,
} from './types.ts'
export type { GatewayDeps } from './pipeline.ts'
export type { GatewayContext } from './context.ts'

export { createGatewayRouter } from './router.ts'
export { resetThrottle } from './middleware/throttle.ts'
export { generateBearerToken, hashBearerToken, verifyBearerToken } from './bearer-token.ts'

// Problem Details (RFC 9457) for any host's own API, built the same way
// as the gateway's: problemResponder takes a table of codes and the URL
// that documents them. problemResponse is the gateway's own.
export { problemResponder, problemResponse, pointerSegment, type FieldError, type ProblemOptions } from './response.ts'
export { findUnknownMembers } from './request-members.ts'

// Route bindings (docs/data-model.md "route binding"), exported so
// packages/config and other hosts use the same type and validation.
export type { RouteBinding, RouteMatch, ConduitAction } from './route-binding.ts'
export {
  RESERVED_SEGMENT,
  InvalidRoutePathError,
  normalizeHost,
  normalizeRoutePath,
  matchRouteBinding,
  createStaticRouteResolver,
  classifyConduitAction,
} from './route-binding.ts'
