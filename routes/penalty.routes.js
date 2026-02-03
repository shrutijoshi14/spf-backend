const express = require('express');
const router = express.Router();

const penaltyController = require('../controllers/penalty.controller');
const { authenticate } = require('../middleware/authenticate');
const checkPermission = require('../middleware/checkPermission');

// ✅ Create Penalty
router.post('/', authenticate, checkPermission('loan.edit'), penaltyController.createPenalty);

router.delete('/:id', authenticate, checkPermission('loan.edit'), penaltyController.deletePenalty);
router.put('/:id', authenticate, checkPermission('loan.edit'), penaltyController.updatePenalty);

// ✅ Check Daily Penalties
router.get(
  '/check-daily',
  authenticate,
  checkPermission('loan.edit'),
  penaltyController.checkDailyPenalties
);

module.exports = router;
