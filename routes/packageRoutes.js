const express = require('express');
const router = express.Router();
const packageController = require('../controllers/PackageController');
const { checkAuthorize } = require('../middleware/authMiddleware');

router.post('/', checkAuthorize(['admin']), packageController.create);
router.get('/', checkAuthorize(['landlord', 'admin']), packageController.list);
router.get('/:id', checkAuthorize(['landlord', 'admin']), packageController.getById);
router.put('/:id', checkAuthorize(['admin']), packageController.update);
router.delete('/:id', checkAuthorize(['admin']), packageController.remove);

module.exports = router;