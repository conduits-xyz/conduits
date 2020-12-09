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
  and verifies that the model layer produces and `expected` outcome.
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
      if (debug) {
        console.log('unexpected flow will throw ', msg, cdt.toJSON());
      }
      throw new Error(msg);
    } catch (e) {
      expect(e.name).to.equal(expected);
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

    // TODO: redundant! remove this test
    it('should not allow undefined curi', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with undefined curi';
      const fields = ['curi']; // delete this field
      const set = { curi: undefined }; // and set it to undefined
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow null curi', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with null curi';
      const fields = ['curi']; // delete this field
      const set = { curi: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow empty curi', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with empty curi';
      const fields = ['curi']; // delete this field
      const set = { curi: '' }; // and set it to ''
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

    // TODO: redundant! remove this test
    it('should not allow undefined suriType', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with undefined suriType';
      const fields = ['suriType']; // delete this field
      const set = { suriType: undefined }; // and set it to undefined
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow null suriType', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with null suriType';
      const fields = ['suriType']; // delete this field
      const set = { suriType: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow empty suriType', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit was saved with empty suriType';
      const fields = ['suriType']; // delete this field
      const set = { suriType: '' }; // and set it to ''
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

    // TODO: redundant! remove this test
    it('should not allow undefined suriApiKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with undefined suriApiKey';
      const fields = ['suriApiKey']; // delete this field
      const set = { suriApiKey: undefined }; // and set it to undefined
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow null suriApiKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with null suriApiKey';
      const fields = ['suriApiKey']; // delete this field
      const set = { suriApiKey: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow empty suriApiKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with empty suriApiKey';
      const fields = ['suriApiKey']; // delete this field
      const set = { suriApiKey: '' }; // and set it to ''
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

    // TODO: redundant! remove this test
    it('should not allow undefined suriObjectKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with undefined suriObjectKey';
      const fields = ['suriObjectKey']; // delete this field
      const set = { suriObjectKey: undefined }; // and set it to undefined
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });  

    // TODO: redundant! remove this test
    it('should not allow null suriObjectKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with null suriObjectKey';
      const fields = ['suriObjectKey']; // delete this field
      const set = { suriObjectKey: null }; // and set it to null
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });

    // TODO: redundant! remove this test
    it('should not allow empty suriObjectKey', async () => {
      const expected = 'SequelizeValidationError';
      const msg = 'Conduit saved with empty suriObjectKey';
      const fields = ['suriObjectKey']; // delete this field
      const set = { suriObjectKey: '' }; // and set it to ''
      const nc = await newConduit(user.id, { rm: fields, set });
      await test(nc, msg, expected, fields);
    });
  });

  context('testing status field...', () => {
    it("should set default status to 'inactive' if no status is set", (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          delete cdt.status;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.status).to.equal('inactive');
              done();
            })
            .catch((_err) => {
              done(Error('status was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it("should set default status to 'inactive' if status is undefined", (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.status = undefined;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.status).to.equal('inactive');
              done();
            })
            .catch((_err) => {
              done(Error('status was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow null status', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.status = null;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('null value was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('status');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow empty status', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.status = '';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('empty value was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('status');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it("should allow only 'active' or 'inactive'", (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.status = 'random';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error("'random' value was saved successfully"));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('status');
              done();
            });
        })
        .catch((e) => done(e));
    });
  });

  context('testing throttle field...', () => {
    it('should set default throttle to true if no throttle is set', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          delete cdt.throttle;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.throttle).to.equal(true);
              done();
            })
            .catch((_err) => {
              done(Error('throttle was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should set default throttle to true if throttle is undefined', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.throttle = undefined;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.throttle).to.equal(true);
              done();
            })
            .catch((_err) => {
              done(Error('throttle was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow null throttle', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.throttle = null;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('null value was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('throttle');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow empty throttle', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.throttle = '';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('null value was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('throttle');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it("should allow only 'true' or 'false' values", (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.throttle = 'random';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error("Conduit saved with 'random' throttle"));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('throttle');
              done();
            });
        })
        .catch((e) => done(e));
    });
  });

  context('testing racm field...', () => {
    it('should set default racm to ["GET"] if no racm is set', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          delete cdt.racm;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.racm).to.eql(['GET']);
              done();
            })
            .catch((_err) => {
              done(Error('racm was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should set default racm to ["GET"] if racm is undefined', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.racm = undefined;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.racm).to.eql(['GET']);
              done();
            })
            .catch((_err) => {
              done(Error('racm was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow empty string', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.racm = '';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('empty string was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('racm');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow blanks', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.racm = '    ';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('blank string was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('racm');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow null racm', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.racm = null;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('null value was saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('racm');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow invalid methods in racm list', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.racm = ['HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('invalid values saved successfully'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('racm');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should allow valid methods in racm list', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.racm = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.racm).to.eql([
                'GET',
                'POST',
                'PUT',
                'PATCH',
                'DELETE',
              ]);
              done();
            })
            .catch((_err) => {
              done(Error('racm was not saved with valid values'));
            });
        })
        .catch((e) => done(e));
    });
  });

  context('testing allowlist field...', () => {
    it('should set default allowlist to [] if allowlist is not specified', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          delete cdt.allowlist;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.allowlist).to.eql([]);
              done();
            })
            .catch((_err) => {
              done(Error('allowlist was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should set default allowlist to [] if allowlist is undefined', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.allowlist = undefined;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.allowlist).to.eql([]);
              done();
            })
            .catch((_err) => {
              done(Error('allowlist was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow empty allowlist', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.allowlist = '';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Conduit saved with empty allowlist'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('allowlist');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow blank allowlist', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.allowlist = '    ';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Conduit saved with blank allowlist'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('allowlist');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow null allowlist', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.allowlist = null;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Conduit saved with null allowlist'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('allowlist');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow non-specified allowlist properties', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.allowlist = [
            {
              ip: '123.234.345.456',
              comment: 'test',
              status: 'active',
              unspecified: 'random',
            },
          ];
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Saved with non-specified allowlist properties'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('allowlist');
              done();
            });
        })
        .catch((e) => done(e));
    });

    context('testing ip address property', () => {
      it('should not allow no ip address in allowlist', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                comment: 'test',
                status: 'active',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with no ip address'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow undefined ip address in allowlist', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: undefined,
                comment: 'test',
                status: 'active',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with undefined ip address'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow null ip address in allowlist', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: null,
                comment: 'test',
                status: 'active',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with null ip address'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow empty ip address in allowlist', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '',
                comment: 'test',
                status: 'active',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with empty ip address'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow maligned ip address in allowlist', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '123.234.345',
                comment: 'test',
                status: 'active',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with maligned ip address'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow out-of-range ip address in allowlist', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '123.234.345.456',
                comment: 'test',
                status: 'active',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with out-of-range ip address'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });
    });

    context('testing status property', () => {
      it('should not allow no status', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '127.0.0.1',
                comment: 'test',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Conduit saved with no allowlist status'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow undefined status', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '127.0.0.1',
                comment: 'test',
                status: undefined,
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Conduit saved with undefined allowlist status'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow null status', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '127.0.0.1',
                comment: 'test',
                status: null,
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Conduit saved with null allowlist status'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow empty status', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '127.0.0.1',
                comment: 'test',
                status: '',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Conduit saved with null allowlist status'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it("should allow only 'active' or 'inactive' status", (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.allowlist = [
              {
                ip: '123.234.345.456',
                comment: 'test',
                status: 'random',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error("Conduit saved with 'random' allowlist status"));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('allowlist');
                done();
              });
          })
          .catch((e) => done(e));
      });
    });
  });

  context('testing hidden form field...', () => {
    it('should set default hff to [] if hff is not specified', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          delete cdt.hiddenFormField;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.hiddenFormField).to.eql([]);
              done();
            })
            .catch((_err) => {
              done(Error('HFF was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should set default hff to [] if hff is undefined', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.hiddenFormField = undefined;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then((objCdt) => {
              expect(objCdt.hiddenFormField).to.eql([]);
              done();
            })
            .catch((_err) => {
              done(Error('HFF was not saved with default value'));
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow empty hff', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.hiddenFormField = '';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Conduit saved with empty HFF'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('hiddenFormField');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow blank hff', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.hiddenFormField = '    ';
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Conduit saved with blank HFF'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('hiddenFormField');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow null hff', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.hiddenFormField = null;
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Conduit saved with null HFF'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('hiddenFormField');
              done();
            });
        })
        .catch((e) => done(e));
    });

    it('should not allow non-specified hff properties', (done) => {
      makeCuri('td')
        .then((curi) => fakeConduit({ userId: user.id, curi }))
        .then((cdt) => {
          cdt.hiddenFormField = [
            {
              fieldName: 'campaign',
              policy: 'pass-if-match',
              include: true,
              value: 'black friday sale',
              unspecified: 'random',
            },
          ];
          return models.Conduit.build(cdt);
        })
        .then((objCdt) => {
          objCdt
            .save()
            .then(() => {
              done(Error('Saved with non-specified HFF properties'));
            })
            .catch((e) => {
              expect(e.name).to.equal('SequelizeValidationError');
              expect(e.errors[0].path).to.equal('hiddenFormField');
              done();
            });
        })
        .catch((e) => done(e));
    });

    context('testing fieldname property', () => {
      it('should not allow no fieldName', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                policy: 'pass-if-match',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved without HFF fieldName property'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow undefined fieldName', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: undefined,
                policy: 'pass-if-match',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with undefined fieldName'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow null fieldName', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: null,
                policy: 'pass-if-match',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with null fieldName'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow empty fieldName', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: '',
                policy: 'pass-if-match',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with empty fieldName'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow blank fieldName', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: '    ',
                policy: 'pass-if-match',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with blank fieldName'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });
    });

    context('testing policy property', () => {
      it('should not allow no policy', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: 'campaign',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved without HFF policy property'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow undefined policy', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: 'campaign',
                policy: undefined,
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with undefined policy'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow null policy', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: 'campaign',
                policy: null,
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with null policy'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow empty policy', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: 'campaign',
                policy: '',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with empty policy'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it('should not allow blank policy', (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: 'campaign',
                policy: '    ',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error('Saved with blank policy'));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });

      it("should allow only 'pass-if-match' or 'drop-if-filled' policy", (done) => {
        makeCuri('td')
          .then((curi) => fakeConduit({ userId: user.id, curi }))
          .then((cdt) => {
            cdt.hiddenFormField = [
              {
                fieldName: 'campaign',
                policy: 'random',
                include: true,
                value: 'black friday sale',
              },
            ];
            return models.Conduit.build(cdt);
          })
          .then((objCdt) => {
            objCdt
              .save()
              .then(() => {
                done(Error("Conduit saved with 'random' HFF policy"));
              })
              .catch((e) => {
                expect(e.name).to.equal('SequelizeValidationError');
                expect(e.errors[0].path).to.equal('hiddenFormField');
                done();
              });
          })
          .catch((e) => done(e));
      });
    });
  });
});
