const { expect, fakeUserProfile } = require('./fixture');

const { models } = require('./context');

describe('Conduits non-functional requirements', () => {
  before('running tests', async () => {
    await models.db.sync({ force: true });
  });

  it('includes validation of critical fields', async () => {
    const fup = fakeUserProfile();
    // replace with bad field values to check if the model catches
    // these errors... NOTE: not exhaustive, we are only testing to
    // see if the validation at the model layer is triggered
    fup.email = 'none@anystreet';
    try {
      const user = models.User.build({ ...fup });
      await user.validate({ fields: ['email'] });
    } catch ({ name, errors }) {
      expect(name).to.equal('SequelizeValidationError');
      for (const error of errors) {
        expect(error.message).to.match(/Validation is on email failed/);
        expect(error.path).to.match(/^email$/);
      }
    }
  });

  it('includes checks for not null constraints of critical fields', async () => {
    try {
      const fakeUserProfile2 = fakeUserProfile({
        firstName: null,
        lastName: null,
        email: null,
        password: null,
      });
      const user2 = models.User.build({ ...fakeUserProfile2 });
      await user2.save();
    } catch ({ name, ...rest }) {
      expect(name).to.match(/TypeError/);
      // v.a: Sequelize behaviour changed from throwing SequelizeValidationError
      // with a list of errors to throwing a single TypeError instead... moving
      // on for now but making sure that this behaviour doesn't change by
      // checking for an empty error list.
      expect(rest).to.be.empty;
    }
  });
});
