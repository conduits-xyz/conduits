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
