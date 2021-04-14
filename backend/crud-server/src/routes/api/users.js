const router = require('express').Router();
const User = require('../../models').User;
const auth = require('../auth');
const helpers = require('../../../../lib/helpers');
const passport = require('passport');
const { RestApiError } = require('../../../../lib/error');
const { validate } = require('../validate');
const { schemaFor } = require('../schema');

router.get('/user', auth.required, async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.payload.id } });
    if (!user) return next(new RestApiError(404, { user: 'not found' }));
    return res.json({ user: user.toAuthJSON() });
  } catch (error) {
    next(new RestApiError(500, error));
  }
});

const postValidation = validate({
  schema: schemaFor('user', 'POST'),
  path: 'user',
  onError: 422,
});

// Registration
router.post('/users', postValidation, async (req, res, next) => {
  try {
    const user = User.build(res.locals.validatedBody['user']);
    const result = await user.save();
    return res.json({ user: result.toAuthJSON() });
  } catch ({ name, errors, fields }) {
    if (name === 'SequelizeUniqueConstraintError') {
      const dberrors = {};
      for (let i = 0; i < fields.length; i++) {
        dberrors[fields[i]] = errors[i].message;
      }
      return next(new RestApiError(422, dberrors));
    } else {
      errors.unknown = `unknown error ${name}, please contact support`;
      return next(new RestApiError(500, errors));
    }
  }
});

// Update User
router.put('/user', auth.required, function (req, res, next) {
  User.findByPk(req.payload.id)
    .then(function (user) {
      if (!user) {
        return next(new RestApiError(404, { user: 'not found' }));
      }

      const userOptFields = ['firstName', 'lastName', 'password'];
      helpers.processInput(req.body.user, [], userOptFields, user, {});

      return user.save().then(function () {
        return res.json({ user: user.toAuthJSON() });
      });
    })
    .catch((reason) => {
      next(new RestApiError(500, reason));
    });
});

// Authentication
router.post('/users/login', function (req, res, next) {
  passport.authenticate(
    'local',
    { session: false },
    function (err, user, info) {
      if (err) {
        console.log('err: ', err);
        return next(new RestApiError(500, err));
      }

      if (user) {
        const userWithJwt = user.toAuthJSON();
        // console.log('user.with.jwt; ', userWithJwt);
        return res.json({ user: userWithJwt });
      } else {
        return next(new RestApiError(422, info));
      }
    }
  )(req, res, next);
});

module.exports = router;
