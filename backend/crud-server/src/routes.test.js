// NOTE:
// - do not add test cases directly in this file
// - instead create your test-suite in a separate file and `require` it here
// - you should know that mocha makes it super hard to share context, so
//   we employ some tricks to force sequentiality where required by splitting
//   test suites across logical functional boundaries, and use the `after`
//   hook.
require('./test/rest-api/cors.spec.js');
require('./test/rest-api/user.spec.js');
require('./test/rest-api/conduit.spec.js');

// Rest API - pending migration of Siraj's model refactor changes
// - Auth
// - Secrets
// - Allow List


