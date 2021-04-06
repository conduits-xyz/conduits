const { RestApiError } = require('../../../lib/error');

/*
const signUpValidationSchemaArray = [
{ name: 'username', validation: string().trim().required() },
{ name: 'password', validation: string().trim().required() }
{ name: 'role', validation: string().trim().required() }
{ name: 'address', validation: addressSchema.default(null).nullable().when(role, isAdminRole(object().required()))}

const buildYupSchema = (fields: any[]) => {
    const newSchema = {};
    fields.forEach(field => newSchema[field.name] = field.validation);
    return object().shape(newSchema);
}

buildYupSchema(signUpValidationSchemaArray);
--------------
const signUpValidationSchemaArray = [
{ name: 'username', validation: {create: string().trim().required(), update: string().trim().optional()} },
{ name: 'password', validation: [string().trim().required() }
{ name: 'role', validation: string().trim().required() }
{ name: 'address', validation: addressSchema.default(null).nullable().when(role, isAdminRole(object().required()))}

const buildYupSchema = (what, fields: any[]) => {
    const newSchema = {};
    fields.forEach(field => newSchema[field.name] = field.validation[what]);
    return object().shape(newSchema);
}

buildYupSchema('create', signUpValidationSchemaArray);
*/

/// Returns a validation middleware that validates a request
/// to match a given schema, and optionally return error to
/// to a client.
///
/// `schema` is a validation schema object constructed using `yup` primitives
/// `path` identifies the payload to be validated against the schema
/// `onError` is a http status code to be returned on error
function validate({ schema, path, onError }) {
  async function middleware(req, res, next) {
    // console.log('!!!!!!!!!!!!', schema, path);
    // do something with schema
    const payload = req.body[path];
    // console.log('>>> print payload:', payload);
    try {
      /* const _ignore = */ await schema.validate(payload, {
        abortEarly: false,
      });
      // console.log('~~~ request-validity: ');
    } catch (errors) {
      const validationErrors = [];
      // let displayErrors = false;
      // if (req.method === 'POST' /*&& path === 'user'*/) {
      //   console.log('~~~~', req.method, req.body);
      //   displayErrors = true;
      // }
      for (const error of errors.inner) {
        // if (displayErrors) {
        //   console.log('~~~~~~~~~', error.path, error.errors[0]);
        // }
        validationErrors.push({ [error.path]: error.errors[0] });
      }
      if (onError) {
        // return next(new RestApiError(onError, {later: "I promise"}));
        // console.log(validationErrors);
        return next(new RestApiError(onError, validationErrors));
      }
    }
    next();
  }

  return middleware;
}

module.exports = { validate };
