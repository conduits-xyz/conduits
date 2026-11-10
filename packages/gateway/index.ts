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
export type { GatewayDeps, GatewayClock } from './pipeline.ts'
export type { GatewayContext } from './context.ts'

export { createGatewayRouter } from './router.ts'
export { createMemoryThrottleStore, type ThrottleLimits, type ThrottleStore } from './middleware/throttle.ts'
export { createSqliteThrottleStore } from './middleware/sqlite-throttle-store.ts'
export { createMemoryIdempotencyStore, type Idempotency, type IdempotencyStore, type IdempotencyClaim, type StoredResponse } from './middleware/idempotency.ts'
export { createSqliteIdempotencyStore } from './middleware/sqlite-idempotency-store.ts'
export { generateRequestId } from './middleware/request-id.ts'
export { clientIpFrom } from './middleware/client-ip.ts'
export { generateBearerToken, hashBearerToken, verifyBearerToken } from './bearer-token.ts'
export { randomBase31 } from './random.ts'

// Problem Details (RFC 9457) for any host's own API, built the same way
// as the gateway's: problemResponder takes a table of codes and the URL
// that documents them. problemResponse is the gateway's own.
export { problemResponder, problemResponse, pointerSegment, type FieldError, type ProblemOptions } from './response.ts'
export { findUnknownMembers } from './request-members.ts'

// Route bindings, exported so packages/config and other hosts use the
// same type and validation.
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
