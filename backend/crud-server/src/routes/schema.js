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
/*
validate: {
  isValidPropertyList: (value) => {
    if (
      !value ||
      !value.every((prop) =>
        Object.keys(prop).every((k) => ALLOW_LIST_PROPS.includes(k))
      )
    ) {
      throw new Error('unspecified properties present');
    }
  },
  isValidProperty: (value) => {
    if (!value || !value.every((entry) => entry.ip && entry.status)) {
      throw new Error('missing required properties');
    }
  },
  isValidIP: (value) => {
    if (
      !value ||
      !value.every((entry) => entry.ip && validator.isIP(entry.ip))
    ) {
      throw new Error('invalid ip address');
    }
  },
  isValidStatus: (value) => {
    if (
      !value ||
      !value.every((entry) => STATUS_ENUM.includes(entry.status))
    ) {
      throw new Error('invalid status value');
    }
  },
},

bevrage: yup.string().test('is-tea',
'${path} is not tea',
value => value === 'tea')
*/

/*
      validate: {
        isValidPropertyList: (value) => {
          if (
            !value ||
            !value.every((prop) =>
              Object.keys(prop).every((k) => HFF_PROPS.includes(k))
            )
          ) {
            throw new Error('unspecified properties present');
          }
        },

        isValidProperty: (value) => {
          if (
            !value ||
            !value.every(
              (entry) => Object.keys(entry).sort().join('') === HFF_PROPS_SIG
            )
          ) {
            throw new Error('missing required properties');
          }
        },
        isValidField: (value) => {
          if (
            !value ||
            value.some(
              (entry) => !entry.fieldName || entry.fieldName.trim() === ''
            )
          ) {
            throw new Error('invalid fieldName value');
          }
        },
        isValidPolicy: (value) => {
          if (
            !value ||
            !value.every((entry) => HFF_POLICY.includes(entry.policy))
          ) {
            throw new Error('invalid policy value');
          }
        },
        isValidInclude: (value) => {
          if (
            !value ||
            !value.every((entry) => BOOLEAN_ENUM.includes(entry.include))
          ) {
            throw new Error('invalid include value');
          }
        },
      },
*/
function allowlistPropsAreValid() {
  // In this case, parent is the entire array
  const props = this.parent.allowlist ?? [];
  // console.log('~~~~~~~~~~~~~~', props /*, this.parent.*/);
  return props.every((prop) =>
      Object.keys(prop).every((k) => ALLOW_LIST_PROPS.includes(k))
  );
};

function allowlistPropsRequired() {
  // In this case, parent is the entire array
  const props = this.parent.allowlist ?? [];
  // console.log('~~~~~~~~~~~~~~', props /*, this.parent.*/);
  return props.every((prop) =>
      Object.keys(prop).every((entry) => entry.ip && validator.isIP(entry.ip))
  );
};


function hffPropsAreValid() {
  const props = this.parent.hiddenFormField ?? [];
  // console.log('>>>>', props /* this.parent.hiddenFormField */);
  return props.every((prop) => 
    Object.keys(prop).every((k) => HFF_PROPS.includes(k))
  );
}

// Post conduit
const conduitSchemaForPost = yup.object({
  suriType: yup
    .string()
    .required('resource type is required')
    .oneOf(SERVICE_TARGETS_ENUM),
  suriObjectKey: yup.string().required('object key is required'),
  suriApiKey: yup.string().required('api key is required'),
  racm: yup.array().ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
  allowlist: yup.array(yup.object({
    ip: yup.string().nullable().test('valid-ip', 'invalid ip address', val => val && validator.isIP(val)),
    status: yup.string().ensure('status is required').oneOf(STATUS_ENUM),
    comment: yup.string()
  })).test('valid-props', 'unspecified properties present', allowlistPropsAreValid)
     /* .test('requied-props', 'required properties missing', allowlistPropsRequired) */,

  status: yup.string().required('status is required').oneOf(STATUS_ENUM),
  throttle: yup.boolean(),
  description: yup.string().ensure(),
  hiddenFormField: yup.array(yup.object({
    fieldName: yup.string().ensure('fieldName is required'), 
    include: yup.boolean(), 
    policy: yup.string().oneOf(HFF_POLICY), 
    value: yup.string()
  })).test('valid-props', 'unspecified properties present', hffPropsAreValid),
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
  allowlist: yup.array(),
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
  allowlist: yup.array(),
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

module.exports = { schemaFor, serviceTargets };
