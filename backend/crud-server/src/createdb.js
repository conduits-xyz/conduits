const { db, User } = require('./models');

// TODO:
// - work on this to move to production
// - use transaction to ensure admin user is created
const createdb = async () => {
  try {
    await db.sync({ force: true });
    const user = new User();
    user.firstName = 'Jake';
    user.lastName = 'Jacob';
    user.email = 'jake1000@jake.jake';
    user.password = 'jakejake';
    await user.save();
  } catch (error) {
    console.log('Error!', error);
    return error;
  }
};

if (require.main === module) {
  (async () => {
    await createdb();
  })();
}

module.exports = {
  dbSync: createdb,
};
