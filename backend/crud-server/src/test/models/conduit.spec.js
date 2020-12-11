const {
  expect,
  generateTestData,
  fakeConduit,
  makeCuri,
} = require('./fixture');

const { models, dotEnvValues, config } = require('./context');

/**
 * Unit tests for the database model
 * - order of tests as written is significant
 * - when adding new tests make sure the sequence of tests
 *   test the lifecycle of the model instances
 */

/* 
  If `gc` is `true` then function generates a curi (conduit-uri) and
  then use that to build the conduit object. Otherwise it uses the 
  value provided in `curi` to build the conduit object.

  If `rm` is non-empty then function removes listed field names from the
  generated conduit object.

  If `set` is non-empty then function sets the listed key-value pairs
  onto the generated conduit object.
*/
async function newConduit(
  uid,
  { rm = [], set = {}, gc = true, curi = null } = {}
) {
  curi = gc === true ? await makeCuri('td') : curi;
  const cdt = fakeConduit({ userId: uid, curi });
  // remove attributes listed in `rm` from cdt
  rm.forEach((fn) => delete cdt[fn]);

  // set attribues listed in `set` onto cdt
  Object.keys(set).forEach((k) => (cdt[k] = set[k]));

  return models.Conduit.build(cdt);
}

/*
  Assumes `cdt` is **not** null and is constructed to match test requirements, 
  and verifies that the model layer produces an `expected` outcome.

  If `expected` is a string then `test` will look for exceptions and
  use the fields listed in `check` to be present in the errors array
  that is assumed to be present in the exception thrown.

  If `expected` is an object then `test` will use the `keys` to be present
  in `cdt` after saving and match the values of those `keys` in `expected`.
*/
async function test(
  cdt,
  msg,
  expected = 'success',
  check = [],
  debug = false
) {
  if (expected === 'success') {
    // let mocha catch the error and count as a test failure
    await cdt.save();

    const json = await cdt.toJSON();
    expect(json).to.be.an('object');
    expect(json).to.have.property('id');
    expect(json).to.have.property('curi');
    expect(json).to.have.property('suriApiKey');
    expect(json).to.have.property('suriType');
    expect(json.curi.length).to.equal(config.conduit.settings.curiLen);
  } else {
    try {
      await cdt.save();
      // if `save` did not throw then we have an error
      if (typeof expected === 'object') {
        Object.keys(expected).forEach((k) => {
          if (Array.isArray(expected[k])) {
            // ensure expected array has all the members without
            // regard to ordering...
            expect(cdt[k]).to.have.members(expected[k]);
          } else {
            expect(cdt[k]).to.eql(expected[k]);
          }
        });
      } else {
        throw new Error(msg);
      }
    } catch (e) {
      expect(e.name, msg).to.equal(expected);
      // TODO: add check to see the error message from server matches
      //       our expectation. At the moment we are only checking to
      //       see the field name is returned. But the field value can
      //       be erroneous for multiple reasons!
      if (debug) {
        console.log(e.errors[0].message);
      }
      check.forEach((fn) => expect(e.errors[0].path).to.equal(fn));
    }
  }
}

context('Conduit model', () => {
  let cdt, user;
  before(async () => {
    const userObj = await models.User.create({
      firstName: dotEnvValues.parsed.USER_FIRST_NAME,
      lastName: dotEnvValues.parsed.USER_LAST_NAME,
      email: dotEnvValues.parsed.USER_EMAIL,
      password: dotEnvValues.parsed.USER_PASSWORD,
    });
    user = userObj.toJSON();
  });

  after('populate for integration test', async function () {
    this.timeout(4000); // <- needed to prevent timeout exceeded mocha error
    await generateTestData(user.id);
  });

  it('should store conduit', async () => {
    const expected = 'success';
    const msg = 'unable to save conduit';
    cdt = await newConduit(user.id);
    await test(cdt, msg, expected);
  });

  context('testing curi field...', () => {
    it('should not allow duplicate curi', async () => {
      const expected = 'SequelizeUniqueConstraintError';
      const msg = 'Conduit with duplicate curi was saved';
      const nc = await newConduit(user.id, { gc: false, curi: cdt.curi });
      await test(nc, msg, expected);
    });

    it('should not allow no curi', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved without a curi';
      const fields = ['curi'];
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    it('should not allow non-url curi', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with non-url curi';
      const fields = ['curi']; // delete this field
      const set = { curi: 'not-in-url-format' }; // and set it to 'not-in-url-format'
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant? if so remove this test
    it('should not allow blank curi', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with blank curi';
      const fields = ['curi']; // delete this field
      const set = { curi: '    ' }; // and set it to '    '
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing suriType field...', () => {
    it('should not allow no suriType', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with no suriType';
      const fields = ['suriType'];
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    it('should reject unsupported service types', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with empty suriType';
      const fields = ['suriType']; // delete this field
      const set = { suriType: 'random' }; // and set it to 'random'
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing suriApiKey field...', () => {
    it('should not allow no suriApiKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved without required suriApiKey';
      const fields = ['suriApiKey']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant? if so remove this test
    it('should not allow blank suriApiKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with blank suriApiKey';
      const fields = ['suriApiKey']; // delete this field
      const set = { suriApiKey: '    ' }; // and set it to '    '
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing suriObjectKey field...', () => {
    it('should not allow no suriObjectKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved without required suriObjectKey';
      const fields = ['suriObjectKey']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant? if so remove this test
    it('should not allow blank suriObjectKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with blank suriObjectKey';
      const fields = ['suriObjectKey']; // delete this field
      const set = { suriObjectKey: '    ' }; // and set it to '    '
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing status field...', () => {
    // equivalence with `status` set to undefined, or empty ('')
    it("should set default status to 'inactive' if no status is set", async () => {
      const expected = { status: 'inactive' };
      const msg = 'status was not saved with default value';
      const fields = ['status']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    it('should not allow null status', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'null value was saved successfully';
      const fields = ['status']; // delete this field
      const set = { status: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it("should allow only 'active' or 'inactive'", async () => {
      const expected = 'SequelizeValidationError';
      const msg = "'random' value was saved successfully";
      const fields = ['status']; // delete this field
      const set = { status: 'random' }; // and set it to 'random'
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing throttle field...', () => {
    // equivalence with `throttle` set to undefined, or empty ('')
    it('should set default throttle to true if no throttle is set', async () => {
      const expected = { throttle: true };
      const msg = 'throttle was not saved with default value';
      const fields = ['throttle']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    it('should not allow null throttle', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'null value was saved successfully';
      const fields = ['throttle']; // delete this field
      const set = { throttle: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it("should allow only 'true' or 'false' values", async () => {
      const expected = 'SequelizeValidationError';
      const msg = "Conduit saved with 'random' throttle";
      const fields = ['throttle']; // delete this field
      const set = { throttle: 'random' }; // and set it to 'random'
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing racm field...', () => {
    // equivalence with `racm` set to undefined, or empty ('')
    it('should set default racm to ["GET"] if no racm is set', async () => {
      const expected = { racm: ['GET'] };
      const msg = 'racm was not saved with default value';
      const fields = ['racm']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    it('should not allow blanks', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'blank string was saved successfully';
      const fields = ['racm']; // delete this field
      const set = { racm: '    ' }; // and set it to '    '
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow null racm', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'null value was saved successfully';
      const fields = ['racm']; // delete this field
      const set = { racm: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow invalid methods in racm list', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'invalid values saved successfully';
      const fields = ['racm']; // delete this field and set new values
      const set = { racm: ['HEAD', 'OPTIONS', 'CONNECT', 'TRACE'] };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should allow valid methods in racm list', async () => {
      const expected = { racm: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };
      const msg = 'racm was not saved with valid values';
      const fields = ['racm']; // delete this field and set new values
      const set = { racm: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing allowlist field...', () => {
    // equivalence with `allowlist` set to undefined, or empty ([])
    it('should set default allowlist to [] if allowlist is not specified', async () => {
      const expected = { allowlist: [] };
      const msg = 'allowlist was not saved with default value';
      const fields = ['allowlist']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    // equivalence with invalid value type
    it('should not allow blank allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with blank allowlist';
      const fields = ['allowlist']; // delete this field
      const set = { allowlist: '    ' }; // and set it to '    '
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow null allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with null allowlist';
      const fields = ['allowlist']; // delete this field
      const set = { allowlist: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow non-specified allowlist properties', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with non-specified allowlist properties';
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            ip: '192.168.1.0',
            comments: 'test',
            status: 'active',
            unspecified: 'catch me',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // equivalence with `allowlist.ip` set to undefined, or empty
    // TODO: change this to test for `required` properties (ip, status)
    it('should not allow no ip address in allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with no ip address';
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            comments: 'test',
            status: 'active',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow no status in allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with no status';
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            comments: 'test',
            ip: '192.168.1.0',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow null ip address in allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with null ip address';
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            ip: null,
            status: 'active',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow maligned ip address in allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with maligned ip address';
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            ip: '123.234.345',
            status: 'inactive',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow out-of-range ip address in allowlist', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with out-of-range ip address';
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            ip: '123.234.345.456',
            status: 'inactive',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it("should allow only 'active' or 'inactive' status", async () => {
      const expected = 'SequelizeValidationError';
      const msg = "Conduit saved with 'random' allowlist status";
      const fields = ['allowlist']; // delete this field and set new values
      const set = {
        allowlist: [
          {
            ip: '192.168.1.0',
            status: 'random',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing hidden form field...', () => {
    // equivalence with `allowlist` set to undefined, or empty ([])
    it('should set default hff to [] if hff is not specified', async () => {
      const expected = { hiddenFormField: [] };
      const msg = 'HFF was not saved with default value';
      const fields = ['hiddenFormField']; // delete this field
      const nc = await newConduit(user.id, { rm: fields });
      await test(nc, msg, expected, fields);
    });

    // equivalence with invalid value type
    it('should not allow blank hff', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with blank HFF';
      const fields = ['hiddenFormField']; // delete this field
      const set = { hiddenFormField: '    ' }; // and set it to '    '
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow null hff', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with null HFF';
      const fields = ['hiddenFormField']; // delete this field
      const set = { hiddenFormField: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    it('should not allow non-specified hff properties', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Saved with non-specified HFF properties';
      const fields = ['hiddenFormField']; // delete this field and set new values
      const set = {
        hiddenFormField: [
          {
            fieldName: 'campaign',
            policy: 'pass-if-match',
            include: true,
            value: 'black friday sale',
            unspecified: 'random',
          },
        ],
      };
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    context('testing fieldname property', () => {
      it('should not allow no fieldName', async () => {
        const expected = 'SequelizeValidationError';
        const msg = 'Saved without HFF fieldName property';
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              policy: 'pass-if-match',
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });

      it('should not allow null fieldName', async () => {
        const expected = 'SequelizeValidationError';
        const msg = 'Saved with null fieldName';
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              fieldName: null,
              policy: 'pass-if-match',
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });

      it('should not allow blank fieldName', async () => {
        const expected = 'SequelizeValidationError';
        const msg = 'Saved with blank fieldName';
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              fieldName: '    ',
              policy: 'pass-if-match',
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });
    });

    context('testing policy property', () => {
      it('should not allow no policy', async () => {
        const expected = 'SequelizeValidationError';
        const msg = 'Saved without HFF policy property';
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              fieldName: 'campaign',
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });

      it('should not allow null policy', async () => {
        const expected = 'SequelizeValidationError';
        const msg = 'Saved with null policy';
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              fieldName: 'campaign',
              policy: null,
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });

      it('should not allow blank policy', async () => {
        const expected = 'SequelizeValidationError';
        const msg = 'Saved with blank policy';
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              fieldName: 'campaign',
              policy: '    ',
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });

      it("should allow only 'pass-if-match' or 'drop-if-filled' policy", async () => {
        const expected = 'SequelizeValidationError';
        const msg = "Conduit saved with 'random' HFF policy";
        const fields = ['hiddenFormField']; // delete this field and set new values
        const set = {
          hiddenFormField: [
            {
              fieldName: 'campaign',
              policy: 'random',
              include: true,
              value: 'black friday sale',
            },
          ],
        };
        const nc = await newConduit(user.id, { rm: fields, set });
        await test(nc, msg, expected, fields);
      });
    });
  });
});
