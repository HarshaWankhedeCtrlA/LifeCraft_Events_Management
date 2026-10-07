const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/eventController');

router.get('/me', authenticate, ctrl.listMyRegistrations);
router.get('/:id/qr', authenticate, ctrl.getMyQr);  
router.get('/:id/certificate', authenticate, ctrl.getCertificate);  
module.exports = router;