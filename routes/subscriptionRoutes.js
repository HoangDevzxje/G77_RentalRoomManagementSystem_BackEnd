const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/SubscriptionController');
const { checkAuthorize } = require('../middleware/authMiddleware');

router.post('/buy', checkAuthorize(['landlord']), subscriptionController.buy);
router.get('/return', subscriptionController.paymentCallback);
router.get('/', checkAuthorize(['landlord']), subscriptionController.list);
module.exports = router;