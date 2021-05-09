const router = require('express').Router();
const auth = require('../auth');

/*
REST API:
- on success: return 200, 201
- on error: return 400, 404, ...

On error the API returns a list of one or more errors in the specified
format below. The key in each item can be one of:
 { field-name, location, or error-domain}

Example:
{
  "errors": [
    {
      "status": "is required",  // field name
    },
    {
      "body": "cannot be empty" // location in request
    },
    {
      "authorization": 'token not found or malformed' // error domain
    }
  ]
}

*/

// v.a:
// we mount users at root since it supports /user
// and /users endpoints. TODO: check what is the
// best practice here. If it were not for the variation
// we might as well fix it here.
router.use('/', require('./users'));

// v.a:
// the implementation should not care about where the
// it is being rooted to since that can change. For
// example, in the future I might rename 'conduits'
// to 'pipes'... mounting the functionality here
// implies I could make a single change in the next
// line and everything else should work as before.

// protected routes require authentication (auth.required)
router.use('/conduits', auth.required, require('./conduits'));

module.exports = router;
