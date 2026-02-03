const express = require('express');
const router = express.Router();
const trashController = require('../controllers/trash.controller');
const { authenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Only Admins can access trash
router.get('/', authenticate, authorize('ADMIN', 'SUPERADMIN'), trashController.getTrash);
router.post(
  '/restore',
  authenticate,
  authorize('ADMIN', 'SUPERADMIN'),
  trashController.restoreItem
);

module.exports = router;
