const conf = require('../../config');
const yup = require('yup');
const validator = require('validator');

const SERVICE_TARGETS_ENUM = conf.targets.settings.map((i) => i.type);
const HTTP_METHODS_ENUM = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_ENUM = ['active', 'inactive'];
const HFF_POLICY = ['drop-if-filled', 'pass-if-match'];
const BOOLEAN_ENUM = [true, false];

// cache frequently used objects
const serviceTargets = conf.targets.settings.map((i) => i.type);

// allow list json blob
const allowlist = yup.array(
  yup
    .object({
      ip: yup
        .string()
        .required('ip address is required')
        .nullable()
        .test(
          'valid-ip',
          'invalid ip address',
          (val) => val && validator.isIP(val)
        ),
      status: yup
        .string()
        .required('status is required')
        .nullable()
        .oneOf(STATUS_ENUM),
      comment: yup.string().nullable().default(''),
    })
    .noUnknown()
);

// hidden form field json blob
const hiddenFormField = yup.array(
  yup
    .object({
      fieldName: yup
        .string()
        .required('fieldName is required')
        .nullable()
        .test(
          'is-valid-field-name',
          'invalid fieldName value',
          (val) => val && val.trim() !== ''
        ),
      include: yup
        .boolean()
        .required('invalid include value')
        .nullable()
        .oneOf(BOOLEAN_ENUM),
      policy: yup
        .string()
        .required('invalid policy value')
        .nullable()
        .oneOf(HFF_POLICY),
      value: yup.string().nullable().default(''),
    })
    .noUnknown()
);

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
  throttle: yup.boolean().oneOf(BOOLEAN_ENUM).default(true),
  description: yup.string().ensure(),
  hiddenFormField,
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
  throttle: yup.boolean().oneOf(BOOLEAN_ENUM).default(true),
  description: yup.string().ensure(),
  hiddenFormField,
});

// Patch conduit
const conduitSchemaForPatch = yup.object({
  suriType: yup.string().oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey: yup.string(),
  suriApiKey: yup.string(),
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().oneOf(STATUS_ENUM),
  throttle: yup.boolean().oneOf(BOOLEAN_ENUM).default(true),
  description: yup.string().ensure(),
  hiddenFormField,
});

// Post user
const userSchemaForPost = yup.object({
  firstName: yup.string().required('first name is required'),
  lastName: yup.string(),
  email: yup.string().email().required('email is required'),
  password: yup.string().required('password is required'),
});

// Put user
const userSchemaForPut = yup.object({
  firstName: yup.string().optional('first name is required'),
  lastName: yup.string().optional,
  email: yup.string().email().optional('email is required'),
  password: yup.string().optional('password is required'),
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
      PUT: userSchemaForPut,
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
  => work around is to use .test() but can only do one test
  => however we needed two tests:
     - one to catch unspecified properties
     - one to catch required properties

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
