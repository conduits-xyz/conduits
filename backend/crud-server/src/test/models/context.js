const dotEnv = require('dotenv-safe');
const path = require('path');

const config = require('../../../../config');
const models = require('../../models');

const dotEnvValues = dotEnv.config({
  allowEmptyValues: true,
  example: path.resolve('.env.conduit-user.example'),
  path: path.resolve('.env.conduit-user'),
});

/* prettier-ignore */
module.exports = {
  config,
  models,
  dotEnvValues
};
