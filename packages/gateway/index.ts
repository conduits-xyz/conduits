export type {
  AllowlistEntry,
  HiddenFormFieldRule,
  SuriConfig,
  ConduitConfig,
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

// Route bindings — see docs/data-model.md's "route binding". Exported
// so both packages/config (compiling a route binding out of YAML) and
// a host projecting one out of its own store share the identical type
// and normalization/validation rules rather than each growing their
// own.
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
