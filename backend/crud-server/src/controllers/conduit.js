// TODO

const Conduit = require('../models').Conduit;
const auth = require('../auth');
const helpers = require('../../../../lib/helpers');
const passport = require('passport');
const { RestApiError } = require('../../../lib/error');
const { validate } = require('../validate');
const { schemaFor } = require('../schema');
const { Op } = require('sequelize');
const conf = require('../../../../config');

const sortable = [
  'createdAt',
  'updatedAt',
  'description',
  'status',
  'id',
  'curi',
];

const createValidation = async (req, res, next) => {
  validate({
    schema: schemaFor('conduit', 'POST'),
    path: 'conduit',
    onError: 422,
  });
  next();
};

const authorize = async (req, res, next) => {
  next();
};

const create = async function (req, res, next) {
  let conduit;

  try {
    conduit = Conduit.build(res.locals.validatedBody.conduit);
    conduit.userId = req.payload.id;
    conduit.curi = await helpers.makeCuri(conf.conduit.settings.prefix);
    await conduit.save();

    return res.status(201).json({
      conduit: {
        id: conduit.id,
        curi: conduit.curi,
      },
    });
  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return next(new RestApiError(422, error));
    }
    // In case the generated curi is a duplicate, we try once more
    if (error.name === 'SequelizeUniqueConstraintError') {
      conduit.curi = await helpers.makeCuri(conf.conduit.settings.prefix);
      await conduit.save();
      return res.status(201).json({
        conduit: {
          id: conduit.id,
          curi: conduit.curi,
        },
      });
    } else {
      return next(new RestApiError(500, error));
    }
  }
};

const getAll = async (req, res, next) => {
  const query = req.query;
  try {
    let conduits = undefined;
    const start = Number(query.start),
      count = Number(query.count);
    const gatewayUser = req.app.locals.gatewayUser;

    // sorting
    // default ordering is based on createdAt and updatedAt
    let order = [['updatedAt', 'DESC']];

    if (query.sort) {
      if (typeof query.sort === 'string') {
        query.sort = query.sort.split(',').map((sortItem) => sortItem.trim());
      }

      if (Array.isArray(query.sort)) {
        order = query.sort
          .filter((f) => {
            f = f.trim().split(':');
            if (sortable.includes(f[0]) && f[1].match(/asc|desc/i)) return f;
            return [];
          })
          .map((o) => {
            return o.split(':');
          });
      }
    }
    if (Number.isSafeInteger(start) && Number.isSafeInteger(count)) {
      conduits = await Conduit.findAll({
        where: {
          id: {
            [Op.gte]: start,
            [Op.lt]: start + count,
          },
          userId: req.payload.id,
        },
        order,
      });
    } else {
      if (gatewayUser?.id === req.payload.id) {
        // fetch conduits in active status; check status enums in model.js
        conduits = await Conduit.findAll({
          where: { status: 'active' },
          order,
        });
      } else {
        conduits = await Conduit.findAll({
          where: { userId: req.payload.id },
          order,
        });
      }
    }

    if (!conduits) {
      return next(new RestApiError(404, { conduit: 'not found' }));
    }

    return res.json({ conduits: conduits.map((i) => i.toJSON()) });
  } catch (error) {
    next(new RestApiError(500, error));
  }
};

const getById = async (req, res, next) => {
  try {
    const conduit = await Conduit.findOne({
      where: {
        id: req.params.id,
        userId: req.payload.id,
      },
    });

    if (!conduit) {
      return next(new RestApiError(404, { conduit: 'not found' }));
    }

    return res.json({ conduit: conduit.toJSON() });
  } catch (error) {
    next(new RestApiError(500, error));
  }
};

const updateValidation = async (req, res, next) => {
  validate({
    schema: schemaFor('conduit', 'PUT'),
    path: 'conduit',
    onError: 422,
  });
  next();
};

// router.put('/:id', auth.required,
const update = async (req, res, next) => {
  try {
    const conduit = await Conduit.findByPk(req.params.id);
    if (!conduit) {
      return next(new RestApiError(404, { conduit: 'not found' }));
    }

    if (res.locals.validatedBody.conduit.curi) {
      return next(new RestApiError(403, { conduit: 'is immutable' }));
    }

    await conduit.update(res.locals.validatedBody.conduit);
    res.status(200).json({ conduit: conduit.toJSON() });
  } catch (error) {
    return next(new RestApiError(500, error));
  }
};

// const updateValidation = async (req, res, next) => {
//   validate({
//     schema: schemaFor('conduit', 'PATCH'),
//     path: 'conduit',
//     onError: 422,
//   });
//   next();
// };

// // router.patch('/:id', auth.required,
// const patchConduit = async (req, res, next) => {
//     try {
//       const conduit = await Conduit.findByPk(req.params.id);
//       if (!conduit) {
//         return next(
//           new RestApiError(404, { conduit: `'${req.params.id}' not found` })
//         );
//       }

//       if (req.body.conduit.curi) {
//         return next(new RestApiError(403, { conduit: 'is immutable' }));
//       }

//       // FIXME!
//       // Since the mode of access to supported service types is vastly
//       // different, we should not allow service type for an existing
//       // conduit to be changed. Tests, UI and this logic needs to
//       // fixed
//       if (
//         req.body.conduit.suriType &&
//         serviceTargets.includes(req.body.conduit.suriType) === false
//       ) {
//         return next(
//           new RestApiError(422, {
//             suriType: `'${req.body.conduit.suriType}' unsupported`,
//           })
//         );
//       }

//       await conduit.update(await req.body.conduit);
//       return res.status(200).json({ conduit: conduit.toJSON() });
//     } catch (error) {
//       return next(new RestApiError(500, error));
//     }
//   };

const deleteConduit = async (req, res, next) => {
  try {
    const conduit = await Conduit.findOne({ where: { id: req.params.id } });
    if (!conduit) {
      return next(new RestApiError(404, { conduit: 'not found' }));
    }

    if (conduit.status === 'active') {
      return next(
        new RestApiError(403, { conduit: 'cannot delete when active' })
      );
    }

    const count = await Conduit.destroy({ where: { id: req.params.id } });
    if (count <= 1) {
      // less than 1 is okay; indicates some other client removed it!
      return res.status(200).json({ conduit: { id: req.params.id } });
    }

    // we have a serious error and we should abort rather than continue
    console.error('== unexpected error while removing an active conduit ==');
    console.error('== count: ', count);
    console.error('== request:', req);
    process.exit(911);
  } catch (error) {
    return next(new RestApiError(500, error));
  }
};

module.exports = {
  createValidation,
  authorize,
  getAll,
  getById,
  create,
  updateValidation,
  update,
  delete: deleteConduit,
};
