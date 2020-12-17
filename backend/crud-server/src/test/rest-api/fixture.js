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

before(async () => {
  console.log(`Praas API server is listening on port ${server.port}`);
});

after(async () => {
  console.log('Shutting down app server');
  apiServer.close();
});

/* prettier-ignore */
module.exports = {
  Api,
  expect,
  jwt,
  fakeConduit: helpers.fakeConduit,
  pickRandomlyFrom: util.pickRandomlyFrom
};
