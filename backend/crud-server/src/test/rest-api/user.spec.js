const { Api, expect, jwt } = require('./fixture');
const { jake } = require('./context');

describe('User endpoint)', () => {
  context('When not authenticated', () => {
    it('should allow registration of a new user', async () => {
      const { firstName, lastName, email, password } = jake.user;
      const res = await Api()
        .post('/users')
        .send({
          user: { firstName, lastName, email: email.toLowerCase(), password },
        });
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('user');
      expect(res.body.user.email).to.equal(email.toLowerCase());
    });

    it('should disallow user registration with existing e-mail', async () => {
      const { firstName, lastName, email, password } = jake.user;
      const res = await Api()
        .post('/users')
        .send({
          user: { firstName, lastName, email: email.toLowerCase(), password },
        });
      expect(res.status).to.equal(422);
      const errors = res.body.errors;
      for (const error of Object.keys(errors)) {
        expect(errors[error]).to.match(/^email.*$|^unknown.*$/);
      }
    });

    it('should return errors for bad registration data of user', async () => {
      let res = await Api().post('/users').send({ user: {} });
      expect(res.status).to.equal(422);

      res = await Api()
        .post('/users')
        .send({ user: { firstName: '', email: '' } });
      expect(res.status).to.equal(422);

      // empty body
      res = await Api().post('/users').send();
      expect(res.status).to.equal(422);
    });

    it('should not authenticate when user credentials are missing', async function () {
      const user = { ...jake.user };
      delete user.password;
      const res = await Api().post('/users/login').send({ user: user });
      expect(res.status).to.equal(422);
      expect(res.body.errors.message).to.equal('Missing credentials');
    });

    it('should not authenticate without valid user credentials', async function () {
      const user = { ...jake.user };
      user.password = 'jake';
      const res = await Api().post('/users/login').send({ user: user });
      expect(res.status).to.equal(422);
      expect(res.body).to.have.property('errors');
      expect(res.body.errors.credentials).to.equal(
        'email or password is invalid'
      );
    });

    it('should authenticate with valid user credentials', async function () {
      const res = await Api().post('/users/login').send(jake);
      expect(res.status).to.equal(200);
      expect(res.body.user).to.have.property('firstName');
      expect(res.body.user).to.have.property('lastName');
      expect(res.body.user).to.have.property('email');
      expect(res.body.user).to.have.property('token');
    });
  });

  context('When authenticated', () => {
    let jakeUser = undefined;

    before('login as Jake', async function () {
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
    });

    after('logout Jake', async () => {
      jakeUser.token = '';
    });

    it('should return logged in user information', async () => {
      const res = await Api()
        .get('/user')
        .set('Authorization', `Token ${jakeUser.token}`);

      expect(res.body).to.have.property('user');
      const user = res.body.user;

      expect(user.email).to.equal(jake.user.email);
      expect(user.firstName).to.equal(jake.user.firstName);
      expect(user.lastName).to.equal(jake.user.lastName);
    });

    it('should allow user to change name fields', async function () {
      const newName = {
        firstName: 'John',
        lastName: 'Doe',
      };
      const res = await Api()
        .put('/user')
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ user: newName });
      expect(res.body).to.have.property('user');
      const user = res.body.user;

      expect(user.email).to.equal(jake.user.email);
      expect(user.firstName).to.equal(newName.firstName);
      expect(user.lastName).to.equal(newName.lastName);

      // update jake on success for subsequent tests to pass
      jake.user = { ...jake.user, ...user };
      // console.log('jake is now: ', jake);
    });

    it('should allow user to change password', async function () {
      const newPass = {
        password: 'jakejacob',
      };
      const res = await Api()
        .put('/user')
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ user: newPass });
      expect(res.body).to.have.property('user');
      const user = res.body.user;

      expect(user.email).to.equal(jake.user.email);
      expect(user.firstName).to.equal(jake.user.firstName);
      expect(user.lastName).to.equal(jake.user.lastName);
      jake.user = { ...jake.user, ...newPass };
      // console.log('jake is now: ', jake);
    });

    xit('should allow user to change email', async function () {
      // implement this test when we have proper email change
      // functionality...
      //
      // https://www.troyhunt.com/everything-you-ever-wanted-to-know/
      // https://postmarkapp.com/guides/password-reset-email-best-practices
    });
  });
});
