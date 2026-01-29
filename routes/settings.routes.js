const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const authenticate = require('../middleware/authenticate');

router.get('/', authenticate, settingsController.getSettings);
router.post('/', authenticate, settingsController.updateSettings);

// Data Management
router.get('/backup', authenticate, settingsController.backupDatabase);
router.get('/export/:type', authenticate, settingsController.exportData);

// Permissions
router.get('/permissions', authenticate, settingsController.getPermissions);
router.put('/permissions', authenticate, settingsController.updatePermissions);

module.exports = router;
