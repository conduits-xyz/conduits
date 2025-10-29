const { Api, expect, jwt, fakeConduit, pickRandomlyFrom } = require('../fixture');
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

    beforeAll(async function () {
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
      // console.log('>>>>', res.body.errors);
      for (const error of res.body.errors) {
        const [key, value] = Object.entries(error)[0];
        expect(key).to.match(/.*Type|ObjectKey|ApiKey|status/);
        expect(value).to.match(/.* required/, value);
      }
    });

    it('can create new conduits', async function () {
      // Add N conduits for testing: update, delete and pagination. Since
      // a REST layer test should be isolated from the DATA layer, we don't
      // directly access the model to insert these records.
      const suriTypes = ['airtable', 'googleSheets', 'email'];
  
      const conduits = [];
      for (let i = 0, imax = conf.conduitsCount; i < imax; i++) {
        const conduit = fakeConduit({suriType: pickRandomlyFrom(suriTypes)});
        const res = await Api()
          .post('/conduits')
          .set('Authorization', `Token ${jakeUser.token}`)
          .send({ conduit });
        // console.log('>>>>', res.body.errors);
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
      expect(res.body).to.have.property('conduit');

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
      // deliberately set status of ctId2 to 'active' and ctId3 to 'inactive'
      let res = await Api()
        .patch(`/conduits/${ctId2}`)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: { status: 'active' } });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('conduit');

      expect(res.body.conduit.status).to.eql('active');

      res = await Api()
        .patch(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: { status: 'inactive' } });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('conduit');

      expect(res.body.conduit.status).to.eql('inactive');
    });

    // TODO: should throttle be a percentage?
    it('should allow changing throttle', async function () {
      // deliberately set status of ctId2 to 'active' and ctId3 to 'inactive'
      let res = await Api()
        .patch(`/conduits/${ctId2}`)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: { throttle: false } });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('conduit');

      expect(res.body.conduit.throttle).to.eql(false);

      res = await Api()
        .patch(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: { throttle: true } });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('conduit');

      expect(res.body.conduit.throttle).to.eql(true);
    });

    it('should DELETE inactive conduit', async function () {
      const deleteInactive = await Api()
        .delete(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(deleteInactive.status).to.equal(200);
      expect(deleteInactive.body).to.have.property('conduit');

      // verify...
      // note this eliminates the need to test deletion of non-existent endpoint
      const getDeleted = await Api()
        .get(`/conduits/${ctId3}`)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(getDeleted.status).to.equal(404);
      expect(getDeleted.body).to.have.property('errors');
      expect(getDeleted.body.errors.conduit).to.equal('not found');
    });

    it('should reject DELETE of an active conduit', async function () {
      const res = await Api()
        .delete(`/conduits/${ctId2}`)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(res.status).to.equal(403);
      expect(res.body).to.have.property('errors');
      expect(res.body.errors.conduit).to.equal('cannot delete when active');
    });

    it('should reject updates to immutable conduit properties', async function () {
      const conduitUri = { conduit: { curi: 'td-12345.trickle.cc' } };
      const res = await Api()
        .patch(`/conduits/${ctId1}`)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send(conduitUri);
      expect(res.status).to.equal(403);
      expect(res.body).to.have.property('errors');
      expect(res.body.errors.conduit).to.equal('is immutable');
    });

    it('should allow replacing suri and suri object key', async function () {
      const conduit = await Api()
        .get('/conduits/' + ctId1)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(conduit.body).to.haveOwnProperty('conduit');
      const { curi, suriType, suriObjectKey } = conduit.body.conduit;
      const suriTypes = ['airtable', 'googleSheets', 'email'].filter(v => v != suriType);
      const putData = await fakeConduit({suriType: pickRandomlyFrom(suriTypes)});

      const res = await Api()
        .put('/conduits/' + ctId1)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: putData });

      expect(res.status).to.equal(200);
      expect(res.body.conduit).to.not.eql(conduit.body.conduit);

      // immutable properties should not change
      expect(res.body.conduit.curi).to.eql(curi); // immutable

      // The user is responsible for changing the object key if the suri
      // type changes. Or more formally, changing suriType and suriObjectKey
      // is allowed only using PUT method.
      expect(res.body.conduit.suriType).to.not.eql(suriType);
      expect(res.body.conduit.suriObjectKey).to.not.eql(suriObjectKey);

      // mutable properties
      expect(res.body.conduit.suriType).to.eql(putData.suriType);
      expect(res.body.conduit.suriObjectKey).to.eql(putData.suriObjectKey);

      expect(res.body.conduit.allowlist).to.eql(putData.allowlist);
      expect(res.body.conduit.racm).to.eql(putData.racm);
      expect(res.body.conduit.hiddenFormField).to.eql(
        putData.hiddenFormField
      );
    });

    it('should allow editing mutable conduit properties', async function () {
      const conduit = await Api()
        .get('/conduits/' + ctId1)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(conduit.body).to.haveOwnProperty('conduit');
      const { curi, suriType, suriObjectKey } = conduit.body.conduit;
      const suriTypes = ['airtable', 'googleSheets', 'email'].filter(v => v != suriType);
      const patchData = await fakeConduit();

      // patch doesn't allow changing key properties
      delete patchData.suriType;
      delete patchData.suriObjectKey;

      const res = await Api()
        .patch('/conduits/' + ctId1)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: patchData });

      expect(res.status).to.equal(200);
      expect(res.body.conduit).to.not.eql(conduit.body.conduit);

      expect(res.body.conduit).to.have.property('curi');
      expect(res.body.conduit).to.have.property('suriType');
      expect(res.body.conduit).to.have.property('suriObjectKey');

      // immutable properties should not change
      expect(res.body.conduit.curi).to.eql(curi); // immutable

      // Changing suriType and suriObjectKeyvis not allowed using PATCH
      expect(res.body.conduit.suriType).to.eql(suriType);
      expect(res.body.conduit.suriObjectKey).to.eql(suriObjectKey);

      // mutable properties
      expect(res.body.conduit.allowlist).to.eql(patchData.allowlist);
      expect(res.body.conduit.racm).to.eql(patchData.racm);
      expect(res.body.conduit.hiddenFormField).to.eql(
        patchData.hiddenFormField
      );
    });

    it('should reject invalid updates to mutable conduit properties', async function () {
      // all updates require suriType and suriObjectKey
      const conduit = await Api()
        .get('/conduits/' + ctId1)
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(conduit.body).to.haveOwnProperty('conduit');
      // prettier-ignore
      // const {curi, suriType } = conduit.body.conduit;

      const putData = await fakeConduit();
      // delete required properties to trigger error validation
      delete putData.suriType;
      delete putData.suriObjectKey;
      putData.throttle = 'bad throttle - catch me!';
      putData.status = 'bad status - catch me!';

      const res = await Api()
        .put('/conduits/' + ctId1)
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ conduit: putData });

      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('errors');
      for (const error of res.body.errors) {
        const [key, value] = Object.entries(error)[0];
        expect(key).to.match(/.*Type|ObjectKey|status|throttle/);
        expect(value).to.match(/.*required|one of|must be/, value);
      }
    });
  });
});
