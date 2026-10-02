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
