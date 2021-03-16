// ///----
// /*
//   context.only('When authenticated', () => {
//     let jakeUser,
//       ctId1,
//       ctId2 = undefined;

//     before(
//       'login as Jake',
//       async function () {
//         // login
//         const res = await Api()
//           .post('/users/login')
//           .send({
//             user: {
//               email: jake.user.email,
//               password: jake.user.password,
//             },
//           });

//         expect(res.status).to.equal(200);
//         expect(res.body).to.have.property('user');

//         jakeUser = res.body.user;
//       }
//     );

//     after('logout', async () => {
//       jakeUser.token = '';
//     });

//     context('manage conduits..', function() {

//       context('basic request validation', function () {
//         it('should reject empty requests', async function () {
//           // equivalance with {conduit: {}}
//           const res = await Api()
//             .post('/conduits')
//             .set('Authorization', `Token ${jakeUser.token}`)
//             .send();
//           expect(res.status).to.equal(422);
//           expect(res.body).to.have.property('errors');

//           for (const error of res.body.errors) {
//             expect(error.msg).to.match(/.* is required/);
//             expect(error.param).to.match(/Type|ObjectKey|ApiKey|status/);
//           }
//         });

// */
// });

// /*
// */
// });
////////////////////////////////////////////////////////////////////////////////
// /***************** scratch area  **********/
// //---
// import assert from 'assert';
// import fs from 'fs';
// import { format } from 'util';
// import vm from 'vm';
// import validator from '../src/index';

// let validator_js = fs.readFileSync(require.resolve('../validator.js')).toString();

// function test(options) {
//   let args = options.args || [];
//   args.unshift(null);
//   if (options.error) {
//     options.error.forEach((error) => {
//       args[0] = error;
//       try {
//         assert.throws(() => validator[options.validator](...args));
//       } catch (err) {
//         let warning = format(
//           'validator.%s(%s) passed but should error',
//           options.validator, args.join(', ')
//         );
//         throw new Error(warning);
//       }
//     });
//   }
//   if (options.valid) {
//     options.valid.forEach((valid) => {
//       args[0] = valid;
//       if (validator[options.validator](...args) !== true) {
//         let warning = format(
//           'validator.%s(%s) failed but should have passed',
//           options.validator, args.join(', ')
//         );
//         throw new Error(warning);
//       }
//     });
//   }
//   if (options.invalid) {
//     options.invalid.forEach((invalid) => {
//       args[0] = invalid;
//       if (validator[options.validator](...args) !== false) {
//         let warning = format(
//           'validator.%s(%s) passed but should have failed',
//           options.validator, args.join(', ')
//         );
//         throw new Error(warning);
//       }
//     });
//   }
// }

// function repeat(str, count) {
//   let result = '';
//   for (; count; count--) {
//     result += str;
//   }
//   return result;
// }

// describe('Validators', () => {
//   it('should validate email addresses', () => {
//     test({
//       validator: 'isEmail',
//       valid: ['foo@bar.com','x@x.au','foo@bar.com.au'],
//       invalid: ['invalidemail@','invalid.com','@invalid.com'],
//     });
//   });

//   it('should validate email addresses with domain specific validation', () => {
//     test({
//       validator: 'isEmail',
//       args: [{ domain_specific_validation: true }],
//       valid: ['foobar@gmail.com','foo.bar@gmail.com'],
//     });
//   });

//   it('should validate URLs with custom protocols', () => {
//     test({
//       validator: 'isURL',
//       args: [{
//         protocols: ['rtmp'],
//       }],
//       valid: [
//         'rtmp://foobar.com',
//       ],
//       invalid: [
//         'http://foobar.com',
//       ],
//     });
//   });

//   it('should validate file URLs without a host', () => {
//     test({
//       validator: 'isURL',
//       args: [{
//         protocols: ['file'],
//         require_host: false,
//         require_tld: false,
//       }],
//       valid: [
//         'file://localhost/foo.txt',
//         'file:///foo.txt',
//         'file:///',
//       ],
//       invalid: [
//         'http://foobar.com',
//         'file://',
//       ],
//     });
//   });

//   it('should validate URLs with any protocol', () => {
//     test({
//       validator: 'isURL',
//       args: [{
//         require_valid_protocol: false,
//       }],
//       valid: [
//         'rtmp://foobar.com',
//         'http://foobar.com',
//         'test://foobar.com',
//       ],
//       invalid: [
//         'mailto:test@example.com',
//       ],
//     });
//   });

//   it('should validate IP addresses', () => {
//     test({
//       validator: 'isIP',
//       args: [4],
//       valid: ['127.0.0.1','0.0.0.0','255.255.255.255'],
//       invalid: ['abc','256.0.0.0','0.0.0.256'],
//     });
//   });
// //---

// const SERVICE_TARGETS_ENUM = conf.targets.settings.map((i) => i.type);
// const HTTP_METHODS_ENUM = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
// const ALLOW_LIST_PROPS = ['ip', 'comment', 'status'];
// const STATUS_ENUM = ['active', 'inactive'];
// const BOOLEAN_ENUM = [true, false];

// const isMethodSupported = (value) => {
//   value.forEach(m => {
//     if (!HTTP_METHODS_ENUM.includes(m)) {
//       throw new Error(`${m} not supported`);
//     }
//   });

//   return true;
// }

// const allowlistValidation =   (value) => {
//   const validations = {
//     isValidPropertyList: (value) => {
//       if (
//         !value ||
//         !value.every((prop) =>
//           Object.keys(prop).every((k) => ALLOW_LIST_PROPS.includes(k))
//         )
//       ) {
//         throw new Error('unspecified properties present');
//       }

//       return true;
//     },
//     isValidProperty: (value) => {
//       console.log('~~~~', value);
//       if (!value || !value.every((entry) => entry.ip && entry.status)) {
//         throw new Error('missing required properties');
//       }

//       return true;
//     },
//     isValidIP: (value) => {
//       if (
//         !value ||
//         !value.every((entry) => entry.ip && validator.isIP(entry.ip))
//       ) {
//         throw new Error('invalid ip address');
//       }

//       return true;
//     },
//     isValidStatus: (value) => {
//       if (
//         !value ||
//         !value.every((entry) => STATUS_ENUM.includes(entry.status))
//       ) {
//         throw new Error('invalid status value');
//       }

//       return true;
//     },
//   };

//   let valid = true;
//   for (validation in validations) {
//     valid = valid && validations[validation](value);
//   }
//   return valid;
// };

// function validations(req, res, next) {

// }

// const validations = [
//   body('conduit.suriType')
//     .exists().withMessage('Resource type is required')
//     .bail()
//     .trim()
//     .notEmpty()
//     .withMessage('Resource type cannot be empty')
//     .isIn(SERVICE_TARGETS_ENUM),
//   body('conduit.suriObjectKey')
//     .exists()
//     .withMessage('Object key is required')
//     .bail()
//     .notEmpty()
//     .withMessage('Object key cannot be empty'),
//   body('conduit.suriApiKey')
//     .exists()
//     .withMessage('Api key is required')
//     .bail()
//     .trim()
//     .notEmpty()
//     .withMessage('Api key cannot be empty'),
//   body('conduit.racm') // Array
//     .optional()
//     .exists({checkFalsy: true})
//     .toArray()
//     .custom(isMethodSupported),
//   body('conduit.allowlist.*.ip') // Array
//     .optional()
//     .exists({checkFalsy: true})
//     .custom(allowlistValidation),
//   body('conduit.allowlist.*.status') // Array
//     .optional()
//     .exists({checkFalsy: true})
//     .custom(allowlistValidation),

//   body('conduit.status')
//     .exists()
//     .withMessage('Status is required')
//     .bail()
//     .isIn(STATUS_ENUM)
//     .withMessage('Status should be boolean'),
//   body('conduit.throttle')
//     .optional()
//     .exists()
//     .isIn(BOOLEAN_ENUM)
//     .toBoolean(true)
//     .withMessage('Throttle should be boolean'),
//   body('conduit.description')
//     .optional()
//     .exists({checkNull: true})
//     .trim()
//     .withMessage('Description cannot be null'),
// ];
// //--
// const validationSchema = Yup.object({
//   applicantID: Yup.string().required("Employee Number required."),
//   firstName: Yup.string()
//     .min(2, "Too Short!")
//     .max(30, "Max 30 characters allowed.")
//     .required("Firstname required."),
//   lastName: Yup.string()
//     .min(2, "Too Short!")
//     .max(30, "Max 30 characters allowed.")
//     .required("Lastname required."),
//   email: Yup.string().email("Invalid email format").required("Email required."),
//   address1: Yup.string()
//     .min(2, "Too short.")
//     .max(255, "Too Long!")
//     .required("Address required."),
//   address2: Yup.string().max(255, "Max 255 characters allowed."),
//   suburb: Yup.string()
//     .min(2, "Too Short!")
//     .max(30, "Max 30 characters allowed.")
//     .required("Suburb required."),
//   state: Yup.string()
//     .min(2, "Too Short!")
//     .max(30, "Max 30 characters allowed.")
//     .required("State required."),
//   business_unit_school: Yup.string()  +91-93607-07070
//     .min(2, "Too Short!")
//     .max(100, "Max 100 characters allowed.")
//     .required("Business unit required."),
// vehicles: Yup.array(
//     Yup.object({
//       registrationNumber: Yup.string(),
//       make: Yup.string().required("make Required"),
//     }).test(
//       "registrationNumber test",
//       // The error message that should appears if test failed
//       "at least one registrationNumber should be filled",
//       // Function that does the custom validation to this array
//       validateAgainstPrevious
//     )
//   ),

// postcode: Yup.string().required("Postcode required."),
//   phone: Yup.number()
//     .required("Phone number required")
//     .typeError("You must specify a number"),
//   mobile: Yup.number().required("").typeError("You must specify a number"),
// });

// function validateAgainstPrevious() {
//   // In this case, parent is the entire array
//   const { parent } = this;

//   // filtered array vechicles that doens't have registrationNumber
//   const filteredArray = parent.filter((e) => !e.registrationNumber);

//   // If length of vehicles that doesn't have registrationNumber is equals to vehicles  array length then return false;
//   if (filteredArray.length === parent.length) return false;

//   return true;
// }

// import * as yup from 'yup';

// let schema = yup.object().shape({
//   name: yup.string().required(),
//   age: yup.number().required().positive().integer(),
//   email: yup.string().email(),
//   website: yup.string().url(),
//   createdOn: yup.date().default(function () {
//     return new Date();
//   }),
// });

// // check validity
// schema
//   .isValid({
//     name: 'jimmy',
//     age: 24,
//   })
//   .then(function (valid) {
//     valid; // => true
//   });

//   value.forEach(m => {
//     if (!HTTP_METHODS_ENUM.includes(m)) {
//       throw new Error(`${m} not supported`);
//     }
//   });

// let schema = yup.mixed().test({
//   name: 'max',
//   exclusive: true,
//   params: { max },
//   message: '${path} must be less than ${max} characters',
//   test: (value) => value == null || value.length <= max,
// });

// let conduitSchema = yup.object({
//   suriType: yup.string.required('resource type is required').oneOf(SERVICE_TARGETS_ENUM),
//   suriObjectKey: yup.string.required('object key is required'),
//   suriApiKey: yup.string.required('api key is required'),
//   racm: yup.array.ensure().of(yup.string().oneOf(HTTP_METHODS_ENUM)),
//   allowlist,
//   status: yup.string.required('status is required').oneOf(STATUS_ENUM),
//   throttle: yup.boolean()
//   description: yup.string.ensure(),
//   hiddenFormField
// })

//   body('conduit.status')
//     .exists()
//     .withMessage('Status is required')
//     .bail()
//     .isIn(STATUS_ENUM)
//     .withMessage('Status should be boolean'),
//   body('conduit.throttle')
//     .optional()
//     .exists()
//     .isIn(BOOLEAN_ENUM)
//     .toBoolean(true)
//     .withMessage('Throttle should be boolean'),
//   body('conduit.description')
//     .optional()
//     .exists({checkNull: true})
//     .trim()
//     .withMessage('Description cannot be null'),
// ];

// const conduitReqdFields = [
//   {suriType: [optional, isString, trim, {isIn: SERVICE_TARGETS_ENUM}]},
//   {suriObjectKey: [isString, trim]},
//   {suriApiKey: [isString, trim]}
// ];

// const conduitOptFields = {
//   throttle: { validations: [isBoolean], defaultValue: true },
//   status: { validations: [isString, trim, {isIn: STATUS_ENUM}] },
//   description: [isString, trim,],
//   allowlist: [toArray, allowlistValidation ],
//   racm: [toArray, isMethodSupported],
//   hiddenFormField: [],
// }

// for (key in Object(optional).keys()) {
//   const validations = optional[key].validations;
//   const {key, validations} = {...item}
//   args[0] = valid;
//   validations.forEach(v => {
//     if (validator[v](...args) !== true) {

//     }
//   }
//   if (validator[options.validator](...args) !== true) {
//     let warning = format(
//       'validator.%s(%s) failed but should have passed',
//       options.validator, args.join(', ')
//     );
//     throw new Error(warning);
//   }
// });

// const conduitOptFields = [
//   'throttle', // default: true
//   'status', // default: inactive
//   'description', // nulls allowed
//   'hiddenFormField', // default: []
//   'allowlist', // default: []
//   'racm', // default: []
// ];
// //---
