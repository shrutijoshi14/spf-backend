const express = require('express');
const router = express.Router();

const topupController = require('../controllers/topup.controller');
const authenticate = require('../middleware/authenticate');
const checkPermission = require('../middleware/checkPermission');

// ✅ Create Top-up
router.post('/', authenticate, checkPermission('loan.edit'), topupController.createTopup);

router.delete('/:id', authenticate, checkPermission('loan.edit'), topupController.deleteTopup);
router.put('/:id', authenticate, checkPermission('loan.edit'), topupController.updateTopup);

module.exports = router;
