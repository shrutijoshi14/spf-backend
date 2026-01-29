const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
// const { verifyToken } = require('../middleware/auth'); // Optionally add auth

router.get('/', notificationController.getNotifications);
router.put('/:id/read', notificationController.markAsRead);
router.delete('/', notificationController.clearAll);

module.exports = router;
