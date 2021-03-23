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

    it('should reject empty requests', async function () {
      // equivalance with {conduit: {}}
      const res = await Api()
        .post('/conduits')
        .set('Authorization', `Token ${jakeUser.token}`)
        .send();
      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('errors');
      
      let errors = res.body.errors;
      for(let i=0; i<errors.length; i++){
        let error = errors[i], key;
        for (key in error) {
          if (error.hasOwnProperty(key)) {
              expect(key).to.match(/Type|ObjectKey|ApiKey|status/);
              expect(error[key]).to.match(/.* is required/);
          }
        }
      }      
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
    //       it('should not DELETE an active service endpoint', async function () {
    //         const res = await Api()
    //           .delete(`/conduits/${ctId1}`)
    //           .set('Authorization', `Token ${jakeUser.token}`);
    //         expect(res.status).to.equal(403);
    //         expect(res.body).to.have.property('errors');
    //         expect(res.body.errors.conduit).to.equal('cannot delete when active');
    //       });

    //       it('should not DELETE non-existent conduits', async function () {
    //         const res = await Api()
    //           .delete('/conduits/non-existent')
    //           .set('Authorization', `Token ${jakeUser.token}`);
    //         expect(res.status).to.equal(404);
    //         expect(res.body).to.have.property('errors');
    //         expect(res.body.errors.conduit).to.equal('not found');
    //       });

    //     // PATCH method
    //     context('update existing service endpoints', function () {
    //       it('should not update service endpoint URI', async function () {
    //         const conduitUri = { conduit: { curi: 'td-12345.trickle.cc' } };
    //         const res = await Api()
    //           .patch(`/conduits/${ctId1}`)
    //           .set('Authorization', `Token ${jakeUser.token}`)
    //           .send(conduitUri);
    //         expect(res.status).to.equal(403);
    //         expect(res.body).to.have.property('errors');
    //         expect(res.body.errors.conduit).to.equal('is immutable');
    //       });

    //       it('should not update non-existent service endpoint', async function () {
    //         const res = await Api()
    //           .patch('/conduits/non-existent')
    //           .set('Authorization', `Token ${jakeUser.token}`);
    //         expect(res.status).to.equal(404);
    //         expect(res.body).to.have.property('errors');
    //         expect(res.body.errors.conduit).to.match(ERROR_PATTERN);
    //       });
    //     });
    //     });

    //     // PUT method
    //     context('overwrite existing service endpoints', function () {
    //       it('should overwrite an existing service endpoint', async function () {
    //         const conduit = await Api()
    //           .get('/conduits/' + ctId1)
    //           .set('Authorization', `Token ${jakeUser.token}`);
    //         expect(conduit.body).to.haveOwnProperty('conduit');

    //         const putData = await fakeConduit();

    //         const res = await Api()
    //           .put('/conduits/' + ctId1)
    //           .set('Authorization', `Token ${jakeUser.token}`)
    //           .send({ conduit: putData });
    //         expect(res.status).to.equal(200);
    //         expect(res.body.conduit).to.not.eql(conduit.body.conduit);
    //         expect(res.body.conduit.suriApiKey).to.equal(putData.suriApiKey);
    //         expect(res.body.conduit.suriObjectKey).to.equal(
    //           putData.suriObjectKey
    //         );
    //         expect(res.body.conduit.suriType).to.equal(putData.suriType);
    //         expect(res.body.conduit.allowlist).to.eql(putData.allowlist);
    //         expect(res.body.conduit.racm).to.eql(putData.racm);
    //         expect(res.body.conduit.hiddenFormField).to.eql(
    //           putData.hiddenFormField
    //         );
    //       });

    //       it('should reject an invalid service endpoint', async function () {
    //         const invalidConduit = await fakeConduit();
    //         delete invalidConduit.suriType;

    //         const res = await Api()
    //           .put('/conduits/' + ctId1)
    //           .set('Authorization', `Token ${jakeUser.token}`)
    //           .send({ conduit: invalidConduit });
    //         expect(res.status).to.equal(422);
    //         expect(Object.keys(res.body.errors)).to.include('suriType');
    //         expect(res.body.errors.suriType).to.match(ERROR_PATTERN);
    //       });

    //       it('should not update service endpoint URI', async function () {
    //         const conduitUri = { conduit: { curi: 'td-12345.trickle.cc' } };
    //         const res = await Api()
    //           .put(`/conduits/${ctId1}`)
    //           .set('Authorization', `Token ${jakeUser.token}`)
    //           .send(conduitUri);
    //         expect(res.status).to.equal(403);
    //         expect(res.body).to.have.property('errors');
    //         expect(res.body.errors.conduit).to.equal('is immutable');
    //       });

    //       it('should not update non-existent service endpoint', async function () {
    //         const res = await Api()
    //           .put('/conduits/non-existent')
    //           .set('Authorization', `Token ${jakeUser.token}`);
    //         expect(res.status).to.equal(404);
    //         expect(res.body).to.have.property('errors');
    //         expect(res.body.errors.conduit).to.equal('not found');
    //       });
    //     });
  });
});
