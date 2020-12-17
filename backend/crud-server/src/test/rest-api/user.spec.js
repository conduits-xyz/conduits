const { Api, expect, jwt } = require('./fixture');
const { jake, conf, targets } = require('./context');


// NOTE:
// reword/rephrase resource-error messages to fit this pattern
const ERROR_PATTERN = /^invalid.*$|^missing.*$|not found|unsupported|cannot be blank|cannot be null|unspecified properties/;

describe('Conduits resource server REST API', () => {
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

    it('should disallow user registration with e-mail that is already in use', async () => {
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
      const userConduits = await Api()
        .get('/conduits')
        .set('Authorization', `Token ${res.body.user.token}`);
      expect(userConduits.status).to.equal(200);
      expect(userConduits.body).to.have.property('conduits');
    });
  });

  context('When authenticated', () => {
    let jakeUser,
      ctId1,
      ctId2 = undefined;

    before(
      'login and add new service endpoints for PUT, PATCH and DELETE',
      async function () {
        // login
        const res = await Api()
          .post('/users/login')
          .send({
            user: {
              email: jake.user.email,
              password: jake.user.password,
            },
          });
        jakeUser = res.body.user;
        // console.log('jakeUser: ', jakeUser);
        // WARN: this is only for debugging, real code should use
        // jwt.verify(...) in order to validate the signature with
        // a known secret.
        const jwtDecoded = jwt.decode(jakeUser.token);
        expect(jwtDecoded.email).to.equal(jakeUser.email);
        expect(jwtDecoded.id).to.equal(jakeUser.id);
    });

    after('logout', async () => {
      jakeUser.token = '';
    });

    it('should return logged in user information', async () => {
      const res = await Api()
        .get('/user')
        .set('Authorization', `Token ${jakeUser.token}`);
      expect(res.body.user.email).to.equal(jake.user.email);
    });

    it('should allow the user to update their information', async function () {
      const userName = {
        firstName: 'John',
        lastName: 'Doe',
      };
      const res = await Api()
        .put('/user')
        .set('Authorization', `Token ${jakeUser.token}`)
        .send({ user: userName });
      expect(res.body).to.have.property('user');
      expect(res.body.user).to.have.property('firstName');
      expect(res.body.user.firstName).to.equal(userName.firstName);
      expect(res.body.user).to.have.property('lastName');
      expect(res.body.user.lastName).to.equal(userName.lastName);
    });
  });
});
