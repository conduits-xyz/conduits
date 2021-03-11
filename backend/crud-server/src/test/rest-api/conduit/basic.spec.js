const { Api, expect, jwt, fakeConduit } = require('../fixture');
const { jake, conf } = require('../context');

describe('Conduit endpoint - basic', () => {
  context('When not authenticated', () => {
    it('should not allow creating conduit', async function () {
      const res = await Api().post('/conduits').send(fakeConduit());
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('errors');
      expect(res.body.errors.authorization).to.equal(
        'token not found or malformed'
      );
    });

    it('should not GET conduit information', async function () {
      const res = await Api().get('/conduits');
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('errors');
      expect(res.body.errors.authorization).to.equal(
        'token not found or malformed'
      );
    });
  });

  context('When authenticated', () => {
    let jakeUser = undefined,
      ctId1,
      ctId2,
      ctId3;

    before('login as Jake', async function () {
      // login
      const res = await Api()
        .post('/users/login')
        .send({
          user: {
            email: jake.user.email,
            password: jake.user.password,
          },
        });

      expect(res.body).to.have.property('user');
      jakeUser = res.body.user;

      // WARN: this is only for debugging, real code should use
      // jwt.verify(...) in order to validate the signature with
      // a known secret.
      const jwtDecoded = jwt.decode(jakeUser.token);
      expect(jwtDecoded.email).to.equal(jakeUser.email);
      expect(jwtDecoded.id).to.equal(jakeUser.id);

      // cache token for subsequent tests
      jake.token = jakeUser.token;
    });

    it('can create new conduits', async function () {
      // Add N conduits for testing: update, delete and pagination. Since
      // a REST layer test should be isolated from the DATA layer, we don't
      // directly access the model to insert these records.
      const conduits = [];
      for (let i = 0, imax = conf.conduitsCount; i < imax; i++) {
        const res = await Api()
          .post('/conduits')
          .set('Authorization', `Token ${jakeUser.token}`)
          .send({ conduit: fakeConduit() });
        expect(res.status).to.equal(201);
        expect(res.body).to.have.property('conduit');
        expect(res.body.conduit).to.have.property('id');
        expect(res.body.conduit.id).to.be.not.null;
        conduits.push(res.body.conduit.id);
      }

      // cache a couple of the conduit ids for subsequent test
      [ctId1, ctId2, ctId3] = conduits;
      jake.testData.ctId1 = ctId1;
      jake.testData.ctId2 = ctId2;
    });

    it('should GET conduit details by ID', async function () {
      const res = await Api()
        .get(`/conduits/${ctId1}`)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.conduit).to.have.property('suriApiKey');
      expect(res.body.conduit).to.have.property('suriType');
      expect(res.body.conduit).to.have.property('suriObjectKey');
      expect(res.body.conduit).to.have.property('curi');
      expect(res.body.conduit).to.have.property('allowlist');
      expect(res.body.conduit).to.have.property('racm');
      expect(res.body.conduit).to.have.property('throttle');
      expect(res.body.conduit).to.have.property('status');
    });

    it('should GET multiple conduit details', async function () {
      const res = await Api()
        .get('/conduits')
        .query({ start: ctId2 + 1, count: conf.conduitsPerPage })
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.conduits.length).to.equal(conf.conduitsPerPage);
    });

    it('should allow changing conduit status', async function () {
      const res = await Api()
        .patch(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: { status: 'inactive' } });
      expect(res.status).to.equal(200);
      expect(res.body.conduit.status).to.eql('inactive');
    });

    it('should DELETE inactive service endpoint', async function () {
      const deleteInactive = await Api()
        .delete(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(deleteInactive.status).to.equal(200);

      const getDeleted = await Api()
        .get(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(getDeleted.status).to.equal(404);
      expect(getDeleted.body).to.have.property('errors');
      expect(getDeleted.body.errors.conduit).to.equal('not found');
    });
  });
});
