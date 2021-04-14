const conf = require('../../../config');
const yup = require('yup');
const validator = require('validator');

const SERVICE_TARGETS_ENUM = conf.targets.settings.map((i) => i.type);
const HTTP_METHODS_ENUM = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOW_LIST_PROPS = ['ip', 'comment', 'status'];
const STATUS_ENUM = ['active', 'inactive'];
const HFF_PROPS = ['fieldName', 'include', 'policy', 'value'];
const HFF_POLICY = ['drop-if-filled', 'pass-if-match'];
const BOOLEAN_ENUM = [true, false];

// cache frequently used objects
const serviceTargets = conf.targets.settings.map((i) => i.type);

function hffPropsAreValid() {
  const props = this.parent.hiddenFormField ?? [];
  // console.log('>>>>', props /* this.parent.hiddenFormField */);
  return props.every((prop) => 
    Object.keys(prop).every((k) => HFF_PROPS.includes(k))
  );
}

const allowlist = yup.array(yup.object({
  ip: yup.string()
        .required('ip address is required')
        .test('valid-ip', 'invalid ip address', val => val && validator.isIP(val)),
  status: yup.string()
            .required('status is required').oneOf(STATUS_ENUM),
  comment: yup.string().default("")
}).noUnknown());

// Post conduit
const conduitSchemaForPost = yup.object({
  suriType: yup
    .string()
    .required('resource type is required')
    .oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey: yup.string().required('object key is required'),
  suriApiKey: yup.string().required('api key is required'),
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().required('status is required').oneOf(STATUS_ENUM),
  throttle: yup.boolean(),
  description: yup.string().ensure(),
  hiddenFormField: yup.array(yup.object({
    fieldName: yup.string().ensure('fieldName is required'), 
    include: yup.boolean(), 
    policy: yup.string().oneOf(HFF_POLICY), 
    value: yup.string()
  })),//.test('valid-props', 'unspecified properties present', hffPropsAreValid),
});

// Put conduit
const conduitSchemaForPut = yup.object({
  suriType: yup
    .string()
    .required('resource type is required')
    .oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey: yup.string().required('object key is required'),
  suriApiKey: yup.string().required('api key is required'),
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().oneOf(STATUS_ENUM),
  throttle: yup.boolean(),
  description: yup.string().ensure(),
  hiddenFormField: yup.array(),
});

// Patch conduit
const conduitSchemaForPatch = yup.object({
  suriType: yup.string().oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey: yup.string(),
  suriApiKey: yup.string(),
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().oneOf(STATUS_ENUM),
  throttle: yup.boolean(),
  description: yup.string().ensure(),
  hiddenFormField: yup.array(),
});

// Post User
const userSchemaForPost = yup.object({
  firstName: yup.string().required('first name is required'),
  lastName: yup.string(),
  email: yup.string().email().required('email is required'),
  password: yup.string().required('password is required'),
});

function schemaFor(path, method) {
  const schemas = {
    conduit: {
      POST: conduitSchemaForPost,
      PUT: conduitSchemaForPut,
      PATCH: conduitSchemaForPatch,
    },
    user: {
      POST: userSchemaForPost,
      PUT: {},
      PATCH: {},
    },
  };

  return schemas[path][method];
}

/* 
YUP: noUnknown with/out validate({strict: true})

1. noUnknown *not* specified, strict is false:
  => unspecifed props *not* caught
  => caught by data layer which we are trying to eliminate
  !!!! [ { allowlist: 'unspecified properties present' } ]

2. noUnknown *not specified, strict is true:
  => unspecifed props *not* caught
  => caught by data layer which we are trying to eliminate
  !!!! [ { allowlist: 'unspecified properties present' } ]

3. noUnknown specified, strict is false:
  => unspecified props removed by yup! (which is good)
  => but tests for explicit unspecified prop detection fail [:-(]
      should reject unspecified props in allowlist:

      AssertionError: expected 201 to equal 422
      + expected - actual

      -201
      +422

4. noUnknown specified, strict is true:
  => unspecified props caught by yup!
  => tests for explicit prop detection pass!!!
    ✓ should reject unspecified props in allowlist
  !!!! [
    { 'allowlist[0]': 'allowlist[0] field has unspecified keys: foobar' }
  ]

Conclusion:
 => validate({strict: true, abortEarly: false})
    AND 
 => use noUnknown() on shapes
*/

module.exports = { schemaFor, serviceTargets };
