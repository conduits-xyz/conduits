const { db, User } = require('./models');

db.sync({ force: true }).then(() => {
  const user = new User();
  user.firstName = 'Jake';
  user.lastName = 'Jacob';
  user.email = 'jake1000@jake.jake';
  user.password = 'jakejake';
  user.save();
});
