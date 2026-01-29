const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');

router.get('/stats', reportsController.getStats);
router.get('/transactions', reportsController.getTransactions);
router.get('/export', reportsController.exportReport);

module.exports = router;
