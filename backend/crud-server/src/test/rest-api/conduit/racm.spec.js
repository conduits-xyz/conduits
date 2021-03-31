const { Api, expect, fakeConduit } = require('../fixture');
const { jake } = require('../context');

describe('Conduit endpoint - racm', () => {
  let ctId1, token;

  // v.a:
  // scope hoisting (?) requires global values to be fetched in a before block
  before(function () {
    ctId1 = jake.testData.ctId1;
    token = jake.token;
  });

  it('should allow valid racm methods', async function () {
    const conduit = fakeConduit();
    conduit.racm = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    const res = await Api()
      .patch(`/conduits/${ctId1}`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('conduit');
    expect(res.body.conduit).to.have.property('racm');

    /* prettier-ignore */
    expect(res.body.conduit.racm).to.have.members([
      'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
    ]);
  });

  it('should reject invalid racm methods', async function () {
    const conduit = fakeConduit();
    conduit.racm = ['PUT', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'PATCH'];
    const res = await Api()
      .patch(`/conduits/${ctId1}`)
      .set('Authorization', `Token ${token}`)
      .send({ conduit });
    expect(res.status).to.equal(422);
    expect(res.body).to.have.property('errors');
  });
});
