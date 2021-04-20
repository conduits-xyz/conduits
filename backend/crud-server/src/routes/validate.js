const { RestApiError } = require('../../../lib/error');

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
    // console.log('>>> print payload:', req.body[path]);
    const payload = req.body[path] ?? {};
    try {
      const validated = await schema.validate(payload, {
        abortEarly: false,
        strict: true,
      });
      res.locals.validatedBody = { [path]: validated };

      // console.log('1.0 ~~~~~~~~~~~', res.locals.validatedBody);
      // if (path === 'conduit') {
      //   if (_ignore.description !== 'ignore me') {
      //     console.log('~~~ request-validity: ', validated);
      //   }
      // }
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
