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

    // console.log('~~~~~~~~~~', res.body.errors);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/.*Type|ObjectKey|ApiKey|status|allowlist/);
      // expect(value).to.match(/.* required|invalid/, value);
    }
  });

  it('should reject unspecified props in allowlist', async function () {
    const conduit = fakeConduit();
    conduit.allowlist = [
      {
        ip: '192.168.1.0',
        comment: 'test',
        status: 'active',
        foobar: 'catch me',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    // console.log('!!!!', res.body.errors);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/allowlist/);
      expect(value).to.match(/unspecified/, value);
    }
  });


  it('should not allow allowlist with missing required props', async () => {
    const conduit = fakeConduit();
    conduit.allowlist = [
        {
          comment: 'test',
          ip: '192.168.1.0',
          // status: "is missing by design!" 
        },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');
    // console.log('~~~~', res.body.errors);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/allowlist/);
      expect(value).to.match(/required/, value);
    }
  });


  /*
  // equivalence with `allowlist.ip` set to undefined, or empty
  // TODO: change this to test for `required` properties (ip, status)
  it('should not allow no ip address in allowlist', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Saved with no ip address';
    const fields = ['allowlist']; // delete this field and set new values
    const set = {
      allowlist: [
        {
          comments: 'test',
          status: 'active',
        },
      ],
    };
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should not allow no status in allowlist', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Saved with no status';
    const fields = ['allowlist']; // delete this field and set new values
    const set = {
      allowlist: [
        {
          comments: 'test',
          ip: '192.168.1.0',
        },
      ],
    };
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should not allow null ip address in allowlist', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Saved with null ip address';
    const fields = ['allowlist']; // delete this field and set new values
    const set = {
      allowlist: [
        {
          ip: null,
          status: 'active',
        },
      ],
    };
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should not allow maligned ip address in allowlist', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Saved with maligned ip address';
    const fields = ['allowlist']; // delete this field and set new values
    const set = {
      allowlist: [
        {
          ip: '123.234.345',
          status: 'inactive',
        },
      ],
    };
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should not allow out-of-range ip address in allowlist', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Saved with out-of-range ip address';
    const fields = ['allowlist']; // delete this field and set new values
    const set = {
      allowlist: [
        {
          ip: '123.234.345.456',
          status: 'inactive',
        },
      ],
    };
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it("should allow only 'active' or 'inactive' status", async () => {
    const expected = 'SequelizeValidationError';
    const msg = "Conduit saved with 'random' allowlist status";
    const fields = ['allowlist']; // delete this field and set new values
    const set = {
      allowlist: [
        {
          ip: '192.168.1.0',
          status: 'random',
        },
      ],
    };
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });
*/
});
