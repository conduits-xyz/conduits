const validator = require('validator');

// cache frequently used objects and enumerations
const HFF_PROPS = ['fieldName', 'include', 'policy', 'value'];
const HFF_PROPS_SIG = ['fieldName', 'include', 'policy', 'value'].join('');
const HFF_POLICY = ['drop-if-filled', 'pass-if-match'];
const STATUS_ENUM = ['active', 'inactive'];
const BOOLEAN_ENUM = [true, false];
const ALLOW_LIST_PROPS = ['ip', 'comment', 'status'];

module.exports = (db, DataTypes) => {
  const Conduit = db.define('conduit', {
    suriApiKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    suriType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    suriObjectKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    curi: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
    },
    allowlist: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    racm: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['GET'],
    },
    throttle: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      validate: {
        isIn: {
          args: [BOOLEAN_ENUM],
          msg: 'invalid value',
        },
      },
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'inactive',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    hiddenFormField: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  });

  Conduit.prototype.toJSON = function () {
    return {
      id: this.id,
      suriApiKey: this.suriApiKey,
      suriType: this.suriType,
      suriObjectKey: this.suriObjectKey,
      curi: this.curi,
      allowlist: this.allowlist,
      racm: this.racm,
      throttle: this.throttle,
      status: this.status,
      description: this.description,
      hiddenFormField: this.hiddenFormField,
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

  const User = require('./user')(db, DataTypes);

  Conduit.belongsTo(User, {
    onDelete: 'cascade',
    allowNull: false,
    targetKey: 'id',
  });

  return Conduit;
};
