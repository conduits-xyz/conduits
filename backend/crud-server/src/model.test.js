// NOTE:
// - do not add test cases directly in this file
// - instead create your test-suite in a separate file and `require` it here
// - you should know that mocha makes it super hard to share context, so
//   we employ some tricks to force sequentiality where required by splitting
//   test suites across logical functional boundaries, and use the `after`
//   hook.
require('./test/models/user.spec.js');
require('./test/models/conduit.spec.js');
