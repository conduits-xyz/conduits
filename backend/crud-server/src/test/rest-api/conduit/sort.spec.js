const { Api, expect } = require('../fixture');
const { jake, conf } = require('../context');

describe('Conduit endpoint - sort', () => {
  let ctId1, token;

  before(async () => {
    ctId1 = jake.testData.ctId1;
    token = jake.token;
    const activeConduit = {
      conduit: {
        description: 'test description',
      },
    };
    const res = await Api()
      .patch(`/conduits/${ctId1}`)
      .set('Authorization', `Token ${token}`)
      .send(activeConduit);

    expect(res.status).to.equal(200);
    expect(res.body.conduit.description).to.eql('test description');
  });

  it('should support default supporting based on updatedAt:DESC', async () => {
    const res = await Api()
      .get('/conduits')
      .query({ start: ctId1, count: conf.conduitsPerPage })
      .set('Authorization', `Token ${token}`);
    const { conduits } = res.body;
    expect(res.status).to.equal(200);
    // since we update the conduit in the before section, it should be the first conduit
    expect(conduits[0].id).to.equal(ctId1);
    expect(Date.parse(conduits[0].updatedAt)).to.be.greaterThan(
      Date.parse(conduits[1].updatedAt)
    );
    expect(Date.parse(conduits[1].updatedAt)).to.be.greaterThan(
      Date.parse(conduits[2].updatedAt)
    );
    expect(
      Date.parse(conduits[conduits.length - 2].updatedAt)
    ).to.be.greaterThan(Date.parse(conduits[conduits.length - 1].updatedAt));
  });

  it('can sort based on createdAt', async () => {
    const res = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'createdAt:DESC',
      })
      .set('Authorization', `Token ${token}`);
    const { conduits: conduitsDescending } = res.body;
    expect(res.status).to.equal(200);
    expect(Date.parse(conduitsDescending[0].createdAt)).to.be.greaterThan(
      Date.parse(conduitsDescending[1].createdAt)
    );

    // tests if the sorting works right using createdAt and not using updatedAt
    expect(conduitsDescending[0].id).to.not.equal(ctId1);
    const res1 = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'createdAt:ASC',
      })
      .set('Authorization', `Token ${token}`);
    const { conduits: conduitsAscending } = res1.body;
    expect(res1.status).to.equal(200);
    expect(Date.parse(conduitsAscending[0].createdAt)).to.be.lessThan(
      Date.parse(conduitsAscending[1].createdAt)
    );
  });

  it('can sort based on description', async () => {
    const res = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'description:DESC',
      })
      .set('Authorization', `Token ${token}`);
    const { conduits: conduitsDescending } = res.body;
    expect(res.status).to.equal(200);
    expect(
      conduitsDescending[0].description > conduitsDescending[1].description
    ).to.equal(true);
    const res1 = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'description:asc',
      })
      .set('Authorization', `Token ${token}`);
    const { conduits: conduitsAscending } = res1.body;
    expect(res1.status).to.equal(200);
    expect(
      conduitsAscending[0].description < conduitsAscending[1].description
    ).to.equal(true);
  });
  it('can sort based on status', async () => {
    const res = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'status:DESC',
      })
      .set('Authorization', `Token ${token}`);
    const { conduits: conduitsDescending } = res.body;

    expect(res.status).to.equal(200);
    expect(conduitsDescending[0].status).to.equal('inactive');
    const res1 = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'status:ASC',
      })
      .set('Authorization', `Token ${token}`);
    const { conduits: conduitsAscending } = res1.body;

    expect(res1.status).to.equal(200);
    expect(conduitsAscending[0].status).to.equal('active');
  });
  it('can sort based on id', async () => {
    const res = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'id:DESC',
      })
      .set('Authorization', `Token ${token}`);
    expect(res.status).to.equal(200);
    expect(res.body.conduits[0].id).to.be.greaterThan(
      res.body.conduits[1].id
    );
    const res1 = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'id:ASC',
      })
      .set('Authorization', `Token ${token}`);
    expect(res1.status).to.equal(200);
    expect(res1.body.conduits[0].id).to.be.lessThan(res1.body.conduits[1].id);
  });
  it('can sort based on curi', async () => {
    const res = await Api()
      .get('/conduits')
      .query({
        start: ctId1,
        count: conf.conduitsPerPage,
        sort: 'curi:DESC',
      })
      .set('Authorization', `Token ${token}`);
    expect(res.status).to.equal(200);
    const receivedCuri = res.body.conduits.map((conduit) => conduit.curi);
    const sortedCuri = receivedCuri.sort();
    expect(receivedCuri).to.equal(sortedCuri);
  });
});
