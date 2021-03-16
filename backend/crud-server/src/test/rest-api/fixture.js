const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');
const server = require('../../server');
const util = require('../../../../lib/util');
const helpers = require('../../../../lib/helpers');

const expect = chai.expect;
chai.use(chaiHttp);

const apiServer = server.app.listen(server.port);
const Api = () => chai.request(apiServer);

const ERROR_PATTERN = /^invalid.*$|^missing.*$|not found|unsupported|cannot be blank|cannot be null|unspecified properties present/;

before(async () => {
  console.log(`Resource API server is listening on port ${server.port}`);
});

after(async () => {
  console.log('Shutting down resource API server');
  apiServer.close();
});

/* prettier-ignore */
module.exports = {
  Api,
  expect,
  jwt,
  fakeConduit: helpers.fakeConduit,
  pickRandomlyFrom: util.pickRandomlyFrom,
  ERROR_PATTERN
};
