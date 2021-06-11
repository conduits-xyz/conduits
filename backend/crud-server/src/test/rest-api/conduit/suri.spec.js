const { Api, expect, fakeConduit } = require('../fixture');
const { jake } = require('../context');

describe('Conduit endpoint - suri', () => {
  let token;

  before(async () => {
    token = jake.token;
  });

  it('should reject invalid suriType', async function () {
    const conduit = fakeConduit();
    conduit.suriType = 'foo';
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');
    // console.log('>>>>', res.body.errors);
    // we look for 1 or 2 errors since email may be valid
    expect(res.body.errors.length).to.satisfy((n) => n >= 1 && n <= 2);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/.*Type|ObjectKey/);
      expect(value).to.match(
        /(invalid (airtable|google|email))|(.* following values)/,
        value
      );
    }
  });

  it('should reject invalid suriObjectKey', async function () {
    const suriTypes = ['airtable', 'googleSheets', 'email'];

    for (const suriType of suriTypes) {
      const conduit = fakeConduit({ suriType });
      conduit.suriObjectKey = 'https://api.firetable.com/v0/';
      const res = await Api()
        .post(`/conduits`)
        .set('Authorization', `Token ${token}`)
        .send({ conduit });
      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('errors');
      // console.log('>>>>', res.body.errors);
      expect(res.body.errors.length).to.equal(1);
      for (const error of res.body.errors) {
        const [key, value] = Object.entries(error)[0];
        expect(key).to.match(/.*ObjectKey/);
        expect(value).to.match(/invalid (airtable|google|email)/, value);
      }
    }
  });

  it('should reject invalid suriType and invalid suriObjectKey', async function () {
    const conduit = fakeConduit();
    conduit.suriType = 'foo';
    conduit.suriObjectKey = 'http://api.foo.com/v0/';
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');
    // console.log('>>>>', res.body.errors);
    expect(res.body.errors.length).to.equal(2);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/.*Type|ObjectKey/);
      expect(value).to.match(
        /(invalid (airtable|google|email))|(.* following values)/,
        value
      );
    }
  });
});
