// ///----

/// /////////////////////////////////////////////////////////////////////////////
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
