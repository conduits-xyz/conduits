const router = require('express').Router();
const auth = require('../auth');

const UserController = require('../../controllers/user');

// get user by id
router.get(
  '/user',
  auth.required,
  UserController.authorize,
  UserController.getById
);

// registration
router.post('/users', UserController.validate('POST'), UserController.create);

// update User
router.put(
  '/user',
  auth.required,
  UserController.validate('PUT'),
  UserController.authorize,
  UserController.replace
);

// authentication
router.post('/users/login', UserController.loginAuth);

module.exports = router;
