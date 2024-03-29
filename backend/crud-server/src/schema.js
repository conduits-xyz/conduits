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

const suriObjectKey = yup.string().when('suriType', (suriType, schema) => {
  if (suriType === 'airtable') {
    return schema
      .required()
      .matches(
        /https:\/\/api.airtable.com\/v0\/.*/,
        'invalid airtable object'
      );
  } else if (suriType === 'googleSheets') {
    return schema
      .required()
      .matches(
        /https:\/\/docs.google.com\/spreadsheets\/d\/.*/,
        'invalid google sheet object'
      );
  } else {
    // assume email otherwise... by doing so we prevent a cascade of errors.
    // For instance if suriType validation had a bug (e.g airtable got modifed
    // to footable) then any non-null value for suriObjectKey would be accepted...
    //
    // NOTE: the error message may not make sense because the user may have
    // selected 'footable' instead of 'email' but the message would indicate
    // the email address being invalid. This is an acceptable trade off.
    return schema.required().email('invalid email address');
  }
});

// Post conduit
const conduitSchemaForPost = yup.object({
  suriType: yup
    .string()
    .required('resource type is required')
    .oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey,
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().required('status is required').oneOf(STATUS_ENUM),
  throttle: yup.boolean().oneOf(BOOLEAN_ENUM).default(true),
  description: yup.string().ensure(),
  hiddenFormField,
}).noUnknown();

// Put conduit
// Use PUT when replacing the entire resource. PUT is idempotent
// and generally should not induce side effects.
const conduitSchemaForPut = yup.object({
  suriType: yup
    .string()
    .required('resource type is required')
    .oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey,
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().oneOf(STATUS_ENUM),
  throttle: yup.boolean().oneOf(BOOLEAN_ENUM).default(true),
  description: yup.string().ensure(),
  hiddenFormField,
}).noUnknown();

// Patch conduit
// Use PATCH when modifying some attributes of an existing resource
// PATCH can have side effects. So, technically, PATCH is the right
// method to use to activate/deactivate a conduit. TODO: Check the UI.
const conduitSchemaForPatch = yup.object({
  curi: yup.string(), // respond with 403 instead of 422 when present
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist,
  status: yup.string().oneOf(STATUS_ENUM),
  throttle: yup.boolean().oneOf(BOOLEAN_ENUM).default(true),
  description: yup.string().ensure(),
  hiddenFormField,
}).noUnknown(true, (what) => what.unknown);

// Post user
const userSchemaForPost = yup.object({
  firstName: yup.string().required('first name is required'),
  lastName: yup.string(),
  email: yup.string().email().required('email is required'),
  password: yup.string().required('password is required'),
}).noUnknown();

// Put user
const userSchemaForPut = yup.object({
  firstName: yup.string().optional('first name is required'),
  lastName: yup.string().optional,
  email: yup.string().email().optional('email is required'),
  password: yup.string().optional('password is required'),
}).noUnknown();

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
