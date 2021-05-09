const router = require('express').Router();

const ConduitController = require('../../controllers/conduit');

router.post(
  '/',
  ConduitController.validate('POST'),
  ConduitController.authorize,
  ConduitController.create
);

// get conduit by id
router.get('/:id', ConduitController.authorize, ConduitController.getById);

// get all conduits + batch (start & count)
router.get('/', ConduitController.authorize, ConduitController.getAll);

// replace conduit
router.put(
  '/:id',
  ConduitController.validate('PUT'),
  ConduitController.authorize,
  ConduitController.replace
);

// modify conduit
router.patch(
  '/:id',
  ConduitController.validate('PATCH'),
  ConduitController.authorize,
  ConduitController.modify
);

// delete conduit
router.delete('/:id', ConduitController.authorize, ConduitController.delete);

module.exports = router;
