const { Api, expect, fakeConduit } = require('../fixture');
const { jake } = require('../context');

// server should reject an allow list under following conditions:
// - invalid ip address {null, bad ip address}
// - unspecified props in allowlist entry
// - invalid status {null, invalid enumeration}
// - null comment
describe('Conduit endpoint - allow list', () => {
  let /* ctId1, */ token;

  // v.a:
  // scope hoisting (?) requires global values to be fetched in a before block
  before(function () {
    // ctId1 = jake.testData.ctId1;
    token = jake.token;
  });

  it('should reject items with null valued props', async function () {
    const conduit = fakeConduit();
    conduit.allowlist = [{ ip: null, comment: null, status: null }];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    expect(res.body.errors.length).to.equal(3);

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/allowlist/);
      expect(value).to.match(/.* required|invalid|active|inactive/, value);
    }
  });

  it('should reject unspecified props', async function () {
    const conduit = fakeConduit();
    conduit.allowlist = [
      {
        ip: '192.168.1.0',
        comment: 'test',
        status: 'active',
        foobar: 'catch me',
        random: 'unknown',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    expect(res.body.errors.length).to.equal(1);

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/allowlist/);
      expect(value).to.match(/unspecified|foobar|random/, value);
    }
  });

  // equivalence with null, undefined, or empty (ip, status) fields
  it('should reject when required props are not present', async () => {
    const conduit = fakeConduit();
    conduit.allowlist = [
      {
        comment: 'test',
        // ip:'192.168.1.0',
        // status: "is missing by design!"
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    expect(res.body.errors.length).to.equal(3);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/allowlist/);
      expect(value).to.match(/required|invalid/, value);
    }
  });

  it('should reject bad ip address', async () => {
    const conduit = fakeConduit();
    const badness = [
      {
        status: 'inactive',
        ip: '123.234.345', // maligned ip address
      },
      {
        status: 'active',
        ip: '123.234.345.456', // out of range
      },
    ];

    for (const bad of badness) {
      conduit.allowlist = [bad];
      const res = await Api()
        .post(`/conduits`)
        .set('Authorization', `Token ${token}`)
        .send({ conduit });
      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('errors');

      expect(res.body.errors.length).to.equal(1);

      for (const error of res.body.errors) {
        const [key, value] = Object.entries(error)[0];
        expect(key).to.match(/allowlist/);
        expect(value).to.match(/required|invalid/, value);
      }
    }
  });

  it('should reject invalid status', async function () {
    const conduit = fakeConduit();
    conduit.allowlist = [
      {
        ip: '192.168.1.0',
        status: 'random',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    expect(res.body.errors.length).to.equal(1);

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/allowlist/);
      expect(value).to.match(/active|inactive/, value);
    }
  });
});
