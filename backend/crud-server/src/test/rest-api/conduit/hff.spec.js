const { Api, expect, fakeConduit } = require('../fixture');
const { jake } = require('../context');

describe('Conduit endpoint - hff', () => {
  let ctId1, token;

  before(async () => {
    ctId1 = jake.testData.ctId1;
    token = jake.token;
    const activeConduit = {
      conduit: {
        hiddenFormField: [
          {
            fieldName: 'campaign',
            policy: 'pass-if-match',
            include: true,
            value: 'black friday sale',
          },
        ],
      },
    };

    const res = await Api()
      .patch(`/conduits/${ctId1}`)
      .set('Authorization', `Token ${token}`)
      .send(activeConduit);
    expect(res.status).to.equal(200);
    expect(res.body.conduit).to.have.property('hiddenFormField');
  });

  it('should reject empty hff', async function () {
    const conduit = fakeConduit();
    conduit.hiddenFormField = [{}];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');
    // console.log('~~~~', res.body.errors);
    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      // console.log('Key:', key, '  - Value: ', value);
      expect(key).to.match(/hiddenFormField.*fieldName|include|policy/);
      expect(value).to.match(/.*required|value/, value);
    }
  });

  it('should reject invalid props in hff', async function () {
    const conduit = fakeConduit();
    conduit.hiddenFormField = [
      {
        fieldName: 'campaign',
        policy: 'pass-if-match',
        include: true,
        value: 'black friday sale',
        unspecified: 'random',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/hiddenFormField/);
      expect(value).to.match(/unspecified/, value);
    }
  });

  it('should not allow no fieldName', async () => {
    const conduit = fakeConduit();
    conduit.hiddenFormField = [
      {
        policy: 'pass-if-match',
        include: true,
        value: 'black friday sale',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/hiddenFormField.*fieldName/);
      expect(value).to.match(/.*fieldName/, value);
    }
  });

  it('should not allow null fieldName', async () => {
    const conduit = fakeConduit();
    conduit.hiddenFormField = [
      {
        fieldName: null,
        policy: 'pass-if-match',
        include: true,
        value: 'black friday sale',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/hiddenFormField.*fieldName/);
      expect(value).to.match(/.*fieldName must be a `string` type/, value);
    }
  });

  it('should not allow blank fieldName', async () => {
    const conduit = fakeConduit();
    conduit.hiddenFormField = [
      {
        fieldName: '     ',
        policy: 'pass-if-match',
        include: true,
        value: 'black friday sale',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/hiddenFormField/);
      expect(value).to.match(/invalid fieldName value/, value);
    }
  });

  it("should allow only 'pass-if-match' or 'drop-if-filled' policy", async () => {
    const conduit = fakeConduit();
    conduit.hiddenFormField = [
      {
        fieldName: 'campaign',
        policy: 'random',
        include: true,
        value: 'black friday sale',
      },
    ];
    const res = await Api()
      .post(`/conduits`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');

    for (const error of res.body.errors) {
      const [key, value] = Object.entries(error)[0];
      expect(key).to.match(/.*policy/);
      expect(value).to.match(
        /policy must be one of the following values: drop-if-filled, pass-if-match/,
        value
      );
    }
  });
});
