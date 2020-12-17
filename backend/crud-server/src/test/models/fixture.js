const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;
const jwt = require('jsonwebtoken');
const util = require('../../../../lib/util');
const helpers = require('../../../../lib/helpers');

const { models, dotEnvValues } = require('./context');

const generateUsers = async (count = 5) => {
  const fups = [];
  for (let i = 0; i < count; i++) fups.push(helpers.fakeUserProfile());
  return models.User.bulkCreate(fups);
};

const generateConduits = async (userId, count = 50) => {
  const fcts = [];
  for (let i = 0; i < count; i++) {
    const curi = await helpers.makeCuri('td');
    fcts.push(helpers.fakeConduit({ curi }));
  }
  for (const fct of fcts) fct.userId = userId;
  return models.Conduit.bulkCreate(fcts);
};

const generateTestData = async (userId) => {
  // create test conduits for gateway server
  const curis = {}; // <- store the conduits for gateway test

  const gatewayBaseConduit = {
    userId,
    suriType: dotEnvValues.parsed.CONDUIT_SERVICE_TYPE,
    suriApiKey: dotEnvValues.parsed.CONDUIT_SERVICE_API_KEY,
    suriObjectKey: dotEnvValues.parsed.CONDUIT_SERVICE_OBJECT_KEY,
    throttle: false,
    status: 'active',
  };

  const gatewayDropConduit = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test conduit with drop-if-filled HFF policy',
    curi: await helpers.makeCuri('td'),
    racm: ['POST'],
    // TODO:
    // - fix the validation rules or the design to improve the DX
    //   for "drop-if-filled".
    // - for starters, I think we should rename it to be "drop-if-match"
    //   to be in sync with "pass-if-match" policy
    // - figure out if there's a better way to get the "include" behaviour
    //   without having to specify it. How about "include-if-match"?
    // - Proposal:
    //   - drop-on-match:
    //     if request field value matches then drop the request
    //   - pass-on-match:
    //     if request field value matches then accept the request but
    //     exclude the request's field value
    //   - include-on-match:
    //     if request field value matches then accept the request and
    //     include the request's field value
    //   - ...
    hiddenFormField: [
      {
        fieldName: 'hiddenFormField',
        policy: 'drop-if-filled',
        include: false, // <- do not care
        value: 'hff-1-blah', // <- do not care
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'drop-if-filled',
        include: true, // <- do not care
        value: 'hff-2-bleep', // <- do not care
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'drop-if-filled',
        include: false, // <- do not care
        value: 'hff-3-whatever', // <- do not care
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'drop-if-filled',
        include: true, // <- do not care
        value: 'hff-4-whenever', // do not care
      },
    ],
  });
  curis.dropConduit = { host: gatewayDropConduit.curi };

  // FIX ME!
  // - We need a regexp matcher
  // - We need to include one more hidden field to ensure that
  //   multiple hidden fields are handled correctly
  const gatewayPassConduit = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test conduit with pass-if-match HFF policy',
    curi: await helpers.makeCuri('td'),
    racm: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'],
    hiddenFormField: [
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: true,
        value: 'hff-1',
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: false,
        value: 'hff-2',
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: true,
        value: 'hff-3',
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: false,
        value: 'hff-4',
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: true,
        value: 'hff-9',
      },
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: false,
        value: 'hff-10',
      },
    ],
  });
  curis.passConduit = { host: gatewayPassConduit.curi };

  // loopback-network needs to be setup to test allow-list feature
  // aor => accept or reject | based on client ip address
  const gatewayAorConduit1 = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test allow-list with one active ip checked',
    curi: await helpers.makeCuri('td'),
    racm: ['GET'],
    allowlist: [
      {
        ip: util.pickRandomlyFrom(helpers.testAllowedIpList),
        status: 'active',
        comment: 'clients with ip matching me should be be accepted',
      },
    ],
  });
  curis.aorConduit1 = {
    host: gatewayAorConduit1.curi,
    allowlist: gatewayAorConduit1.allowlist,
  };

  const gatewayAorConduit2 = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test allow-list with one inactive ip',
    curi: await helpers.makeCuri('td'),
    racm: ['GET'],
    allowlist: [
      {
        ip: util.pickRandomlyFrom(helpers.testInactiveIpList),
        status: 'inactive',
        comment: 'I am practically not there coz I am inactive',
      },
    ],
  });
  curis.aorConduit2 = {
    host: gatewayAorConduit2.curi,
    allowlist: gatewayAorConduit2.allowlist,
  };

  const gatewayAorConduit3 = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test allow-list with multiple ip addresses',
    curi: await helpers.makeCuri('td'),
    racm: ['POST'],
    allowlist: [
      {
        ip: util.pickRandomlyFrom(helpers.testAllowedIpList),
        status: 'active',
        comment: 'clients with ip matching me should be be accepted',
      },
      {
        ip: util.pickRandomlyFrom(helpers.testAllowedIpList),
        status: 'active',
        comment: 'clients with ip matching me should be be accepted',
      },
      {
        ip: util.pickRandomlyFrom(helpers.testInactiveIpList),
        status: 'inactive',
        comment: 'I am practically not there coz I am inactive',
      },
    ],
  });
  curis.aorConduit3 = {
    host: gatewayAorConduit3.curi,
    allowlist: gatewayAorConduit3.allowlist,
  };

  const gatewayUseCaseConduitA = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test conduitA has write-only permission',
    curi: await helpers.makeCuri('td'),
    racm: ['POST'],
    hiddenFormField: [
      {
        fieldName: 'hiddenFormField',
        policy: 'pass-if-match',
        include: true,
        value: 'hff-5',
      },
    ],
  });
  curis.conduitA = {
    host: gatewayUseCaseConduitA.curi,
    racm: gatewayUseCaseConduitA.racm,
  };

  const gatewayUseCaseConduitB = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test conduitB has get and patch permission',
    curi: await helpers.makeCuri('td'),
    racm: ['GET', 'PATCH'],
  });
  curis.conduitB = {
    host: gatewayUseCaseConduitB.curi,
    racm: gatewayUseCaseConduitB.racm,
  };

  const gatewayUseCaseConduitC = await models.Conduit.create({
    ...gatewayBaseConduit,
    description: 'test conduitA has read only permission',
    curi: await helpers.makeCuri('td'),
    racm: ['GET'],
  });
  curis.conduitC = {
    host: gatewayUseCaseConduitC.curi,
    racm: gatewayUseCaseConduitC.racm,
  };

  fs.writeFileSync(
    path.resolve('.test-data-curi.json'),
    JSON.stringify(curis, null, 2)
  );

  // flood user with random conduits
  generateConduits(userId, 25);

  // generate random users and conduits for integration test
  const users = await generateUsers(10);
  for (let i = 0; i < 10; i++) {
    await generateConduits(users[i].id);
  }
};

/* prettier-ignore */
module.exports = {
  expect,
  jwt,
  generateTestData,
  fakeUserProfile: helpers.fakeUserProfile,
  fakeConduit: helpers.fakeConduit,
  makeCuri: helpers.makeCuri,
  testAllowedIpList: helpers.testAllowedIpList,
  testInactiveIpList: helpers.testInactiveIpList,
};
