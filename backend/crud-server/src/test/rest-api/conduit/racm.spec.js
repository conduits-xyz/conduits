//         it('should reject invalid target service parameters', async function () {
//           const fc = fakeConduit();
//           // invalid values should be caught
//           fc.suriType = 'smartsheet is gone!';
//           fc.racm = ['PUT', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'PATCH'];
//           fc.throttle = "not-a-boolean";
//           fc.status = "not-good-status-value"
//           fc.description = null;

//           const res = await Api()
//             .post('/conduits')
//             .set('Authorization', `Token ${jakeUser.token}`)
//             .send({ conduit: fc });
//           expect(res.status).to.equal(422);
//           expect(res.body).to.have.property('errors');

//           for (const error of res.body.errors) {
//             expect(error.msg).to.match(/not supported|cannot be|invalid value|is required|should be/i);
//             expect(error.param).to.match(/Type|ObjectKey|ApiKey|status|racm|throttle|description/);
//           }
//        });
const { Api, expect, fakeConduit, ERROR_PATTERN } = require('../fixture');
const { jake } = require('../context');


describe('Conduit endpoint - racm', () => {
    let ctId1, token;

    before(async () => {
        ctId1 = jake.testData.ctId1;
        token = jake.token;
        const activeConduit = {
            conduit: {
                racm: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            },
          };
        
        const res = await Api()
            .patch(`/conduits/${ctId1}`)
            .set('Authorization', `Token ${token}`)
            .send(activeConduit);
        expect(res.status).to.equal(200);
        expect(res.body.conduit).to.have.property('racm');
        expect(res.body.conduit.racm).to.have.members(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
        // should this test use deep equal
        // const deepEqualInAnyOrder = require('deep-equal-in-any-order');
        // const chai = require('chai');

        // chai.use(deepEqualInAnyOrder);

        // const { expect } = chai;

        // expect([1, 2]).to.deep.equalInAnyOrder([2, 1]);
        // expect([1, 2]).to.not.deep.equalInAnyOrder([2, 1, 3]);
    });

    it('should reject invalid racm parameters', async function () {
        const conduit = fakeConduit();
        conduit.racm = [
            ['PUT', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'PATCH'],
        ];
        const res = await Api()
            .post(`/conduits`)
            .set('Authorization', `Token ${token}`)
            .send({ conduit });
        expect(res.status).to.equal(422);
        expect(res.body).to.have.property('errors');
        // console.log(res.body.conduit);
    });
});