const router = require('express').Router();

const UserController = require('../../controllers/user');

router.get('/user', UserController.authorize, UserController.getById);

// Registration
router.post('/users', UserController.validate('POST'), UserController.create);

// Update User
router.put(
  '/user',
  UserController.validate('PUT'),
  UserController.authorize,
  UserController.replace
);

// Authentication
router.post('/users/login', UserController.loginAuth);

module.exports = router;
