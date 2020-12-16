/* prettier-ignore */
const { 
  expect,
  jwt,
  fakeUserProfile,
} = require('./fixture');

const { models, config } = require('./context');

context('User model', () => {
  const fup = fakeUserProfile();
  before('running tests', async () => {
    await models.db.sync({ force: true });
  });

  it('should store new user(s)', async () => {
    const user = models.User.build({ ...fup });

    user.password = fup.password;
    expect(user.passwordValid(fup.password)).to.be.true;
    const newUser = await user.save();

    expect(newUser).to.be.an('object');
    expect(newUser).to.have.property('firstName');
    expect(newUser).to.have.property('email');
    expect(newUser.firstName).to.equal(fup.firstName);
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

  it('should validate whether user exists', async function () {
    // valid user
    const validUser = await models.User.exists(fup.email, fup.password);
    expect(validUser).to.be.an('object');
    expect(validUser).to.have.property('email');
    expect(validUser.email).to.equal(fup.email);

    // non-existent user
    const nonExistentUser = await models.User.exists(
      'test.user@example.com',
      't3$TP@ssw0rd'
    );
    expect(nonExistentUser).to.be.undefined;
  });

  it('should validate if email is unique', async () => {
    const fup1 = fakeUserProfile();
    const user1 = models.User.build({ ...fup1 });
    user1.password = fup.password;
    await user1.save();

    const fup2 = fakeUserProfile();
    const user2 = models.User.build({ ...fup2 });
    user2.email = user1.email;
    user2.password = fup.password;

    try {
      await user2.save();
    } catch ({ name, errors }) {
      expect(name).to.equal('SequelizeUniqueConstraintError');
      for (const error of errors) {
        expect(error.message).to.match(/email must be unique/);
        expect(error.type).to.match(/unique violation/);
        expect(error.path).to.match(/^email$/);
      }
    }
  });

  it('should validate passwords', async () => {
    const user = await models.User.findOne({ where: { email: fup.email } });
    user.password = fup.password;
    // positive test case
    expect(user.passwordValid(fup.password)).to.be.true;
    // negative test case
    expect(user.passwordValid('bad password')).to.be.false;
  });

  it('should generate profile JSON', async () => {
    const user = await models.User.findOne({ where: { email: fup.email } });
    const profileJSON = user.toProfileJSONFor();
    expect(profileJSON.email).to.equal(fup.email);
    expect(profileJSON.firstName).to.equal(fup.firstName);
    expect(profileJSON.lastName).to.equal(fup.lastName);
  });

  it('should generate auth JSON', async () => {
    const user = await models.User.findOne({ where: { email: fup.email } });
    const authJSON = user.toAuthJSON();
    expect(authJSON).to.have.property('token');

    const jwtDecoded = jwt.verify(
      authJSON.token,
      config.system.settings.secret
    );
    expect(jwtDecoded.email).to.equal(user.email);
    expect(jwtDecoded.id).to.equal(user.id);
  });
});
