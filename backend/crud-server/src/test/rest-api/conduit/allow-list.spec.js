// Vijay, please move allow-list context from
// `conduit-advanced.spec` to here...

//        context('allowlist validation', function () {
//          // server should reject:
//          // - invalid ip address {null, bad ip address}
//          // - unspecified props in allowlist entry
//          // - invalid status {null, invalid enumeration}
//          // - null comment
//         it.only('should reject items with null valued props', async function () {
//           const conduit = fakeConduit();
//           conduit.allowlist = [{ ip: null, comment: null, status: null }];
//           const res = await Api()
//             .post(`/conduits`)
//             .set('Authorization', `Token ${jakeUser.token}`)
//             .send({ conduit });
//           expect(res.status).to.equal(422);
//           expect(res.body).to.have.property('errors');
//           for (const error of res.body.errors) {
//             expect(error.msg).to.match(/not supported|missing required|cannot be|invalid value|is required|should be/i);
//             expect(error.param).to.match(/Type|allowlist|ObjectKey|ApiKey|status|racm|throttle|description/);
//           }

//           // res.body.errors.forEach((error) =>
//           //   expect(error.allowlist).to.match(ERROR_PATTERN)
//           // );
//         });

//         it('should reject invalid props in allowlist', async function () {
//           const conduit = fakeConduit();
//           conduit.allowlist = [
//             {
//               ip: '192.168.1.0',
//               comments: 'test',
//               status: 'active',
//               unspecified: 'catch me',
//             },
//           ];
//           const res = await Api()
//             .post(`/conduits`)
//             .set('Authorization', `Token ${jakeUser.token}`)
//             .send({ conduit });
//           expect(res.status).to.equal(422);
//           expect(res.body).to.have.property('errors');
//           res.body.errors.forEach((error) =>
//             expect(error.allowlist).to.match(ERROR_PATTERN)
//           );
//         });
//   */
//         /*
//     // equivalence with `allowlist.ip` set to undefined, or empty
//     // TODO: change this to test for `required` properties (ip, status)
//     it('should not allow no ip address in allowlist', async () => {
//       const expected = 'SequelizeValidationError';
//       const msg = 'Saved with no ip address';
//       const fields = ['allowlist']; // delete this field and set new values
//       const set = {
//         allowlist: [
//           {
//             comments: 'test',
//             status: 'active',
//           },
//         ],
//       };
//       const nc = await newConduit(user.id, { rm: fields, set });
//       await test(nc, msg, expected, fields);
//     });

//     it('should not allow no status in allowlist', async () => {
//       const expected = 'SequelizeValidationError';
//       const msg = 'Saved with no status';
//       const fields = ['allowlist']; // delete this field and set new values
//       const set = {
//         allowlist: [
//           {
//             comments: 'test',
//             ip: '192.168.1.0',
//           },
//         ],
//       };
//       const nc = await newConduit(user.id, { rm: fields, set });
//       await test(nc, msg, expected, fields);
//     });

//     it('should not allow null ip address in allowlist', async () => {
//       const expected = 'SequelizeValidationError';
//       const msg = 'Saved with null ip address';
//       const fields = ['allowlist']; // delete this field and set new values
//       const set = {
//         allowlist: [
//           {
//             ip: null,
//             status: 'active',
//           },
//         ],
//       };
//       const nc = await newConduit(user.id, { rm: fields, set });
//       await test(nc, msg, expected, fields);
//     });

//     it('should not allow maligned ip address in allowlist', async () => {
//       const expected = 'SequelizeValidationError';
//       const msg = 'Saved with maligned ip address';
//       const fields = ['allowlist']; // delete this field and set new values
//       const set = {
//         allowlist: [
//           {
//             ip: '123.234.345',
//             status: 'inactive',
//           },
//         ],
//       };
//       const nc = await newConduit(user.id, { rm: fields, set });
//       await test(nc, msg, expected, fields);
//     });

//     it('should not allow out-of-range ip address in allowlist', async () => {
//       const expected = 'SequelizeValidationError';
//       const msg = 'Saved with out-of-range ip address';
//       const fields = ['allowlist']; // delete this field and set new values
//       const set = {
//         allowlist: [
//           {
//             ip: '123.234.345.456',
//             status: 'inactive',
//           },
//         ],
//       };
//       const nc = await newConduit(user.id, { rm: fields, set });
//       await test(nc, msg, expected, fields);
//     });

//     it("should allow only 'active' or 'inactive' status", async () => {
//       const expected = 'SequelizeValidationError';
//       const msg = "Conduit saved with 'random' allowlist status";
//       const fields = ['allowlist']; // delete this field and set new values
//       const set = {
//         allowlist: [
//           {
//             ip: '192.168.1.0',
//             status: 'random',
//           },
//         ],
//       };
//       const nc = await newConduit(user.id, { rm: fields, set });
//       await test(nc, msg, expected, fields);
//     });