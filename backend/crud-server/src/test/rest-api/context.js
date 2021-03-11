const conf = require('../../../../config').test.settings;
const targets = require('../../../../config').targets.settings;

const jake = {
  user: {
    firstName: 'Jake',
    lastName: 'Jacob',
    email: 'jake1000@jake.jacob',
    password: 'jakejake',
  },

  testData: {
    ctId1: undefined,
    ctId2: undefined,
  },

  token: undefined,
};

/* prettier-ignore */
module.exports = {
  jake,
  conf,
  targets
};
