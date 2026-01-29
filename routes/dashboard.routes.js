const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/authenticate');

router.get('/', authenticate, dashboardController.getDashboardData);
router.get('/history', authenticate, dashboardController.getHistory);

module.exports = router;
