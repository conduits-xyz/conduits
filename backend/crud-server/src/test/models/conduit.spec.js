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
    // on error, let mocha catch the error and treat it as a test failure
    await cdt.save();

    // on success, assert expected attributes to be present
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
      // if `save` did not throw then we have an error condition or have
      // to check the return value
      if (typeof expected === 'object') {
        Object.keys(expected).forEach((k) => {
          if (debug) {
            console.log('expected: ', expected, 'received: ', cdt.toJSON());
          }
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

  it('should reject null curi', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Conduit was saved with blank curi';
    const fields = ['curi']; // delete this field
    const set = { curi: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should reject duplicate curi', async () => {
    const expected = 'SequelizeUniqueConstraintError';
    const msg = 'Conduit with duplicate curi was saved';
    const nc = await newConduit(user.id, { gc: false, curi: cdt.curi });
    await test(nc, msg, expected);
  });

  it('should reject null suriType', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Conduit was saved with empty suriType';
    const fields = ['suriType']; // delete this field
    const set = { suriType: null }; // and set it to 'null'
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should reject null suriApiKey', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Conduit saved with null suriApiKey';
    const fields = ['suriApiKey']; // delete this field
    const set = { suriApiKey: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should reject null suriObjectKey', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Conduit saved with null suriObjectKey';
    const fields = ['suriObjectKey']; // delete this field
    const set = { suriObjectKey: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  it('should reject null status', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'null value was saved successfully';
    const fields = ['status']; // delete this field
    const set = { status: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  // equivalence with `status` set to undefined, or empty ('')
  it('should default to inactive when status is not set', async () => {
    const expected = { status: 'inactive' };
    const msg = 'status was not saved with default value';
    const fields = ['status']; // delete this field
    const nc = await newConduit(user.id, { rm: fields });
    await test(nc, msg, expected, fields);
  });

  it('should reject null throttle', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'null value was saved successfully';
    const fields = ['throttle']; // delete this field
    const set = { throttle: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  // equivalence with `throttle` set to undefined, or empty ('')
  it('should default to true when throttle is not set', async () => {
    const expected = { throttle: true };
    const msg = 'throttle was not saved with default value';
    const fields = ['throttle']; // delete this field
    const nc = await newConduit(user.id, { rm: fields });
    await test(nc, msg, expected, fields);
  });

  it('should reject null allowlist', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Conduit saved with null allowlist';
    const fields = ['allowlist']; // delete this field
    const set = { allowlist: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  // equivalence with `allowlist` set to undefined, or empty ([])
  it('should default to [] when allowlist is not set', async () => {
    const expected = { allowlist: [] };
    const msg = 'allowlist was not saved with default value';
    const fields = ['allowlist']; // delete this field
    const nc = await newConduit(user.id, { rm: fields });
    await test(nc, msg, expected, fields);
  });

  it('should reject null racm', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'null value was saved successfully';
    const fields = ['racm']; // delete this field
    const set = { racm: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  // equivalence with `racm` set to undefined, or empty ('')
  it('should default ["GET"] when racm is not set', async () => {
    const expected = { racm: ['GET'] };
    const msg = 'racm was not saved with default value';
    const fields = ['racm']; // delete this field
    const nc = await newConduit(user.id, { rm: fields });
    await test(nc, msg, expected, fields);
  });

  it('should reject null hff', async () => {
    const expected = 'SequelizeValidationError';
    const msg = 'Conduit saved with null HFF';
    const fields = ['hiddenFormField']; // delete this field
    const set = { hiddenFormField: null }; // and set it to null
    const nc = await newConduit(user.id, { rm: fields, set });
    await test(nc, msg, expected, fields);
  });

  // equivalence with `hff` set to undefined, or empty ([])
  it('should default to [] when hff is not set', async () => {
    const expected = { hiddenFormField: [] };
    const msg = 'HFF was not saved with default value';
    const fields = ['hiddenFormField']; // delete this field
    const nc = await newConduit(user.id, { rm: fields });
    await test(nc, msg, expected, fields);
  });

  it('should default to empty string when description is not set', async () => {
    const expected = { description: '' };
    const msg = 'description was not saved with default value';
    const fields = ['description']; // delete this field
    const nc = await newConduit(user.id, { rm: fields });
    await test(nc, msg, expected, fields);
  });
});
