const authRoutes = require('./authRoute');

const routes = (app) => {
    app.use('/auth', authRoutes);
}

module.exports = routes