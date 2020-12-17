const conf = require('../../../../config').test.settings;
const targets = require('../../../../config').targets.settings;

const jake = {
  user: {
    firstName: 'Jake',
    lastName: 'Jacob',
    email: 'jake1000@jake.jake',
    password: 'jakejake',
  },
};

/* prettier-ignore */
module.exports = {
  jake,
  conf,
  targets
};
