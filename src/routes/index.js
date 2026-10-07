const express = require('express');
const router = express.Router();

const eventRoutes = require('./eventRoutes');
const registrationRoutes = require('./registrationRoutes');

router.use('/events', eventRoutes);
router.use('/registrations', registrationRoutes);

module.exports = router;