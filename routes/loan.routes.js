const express = require('express');
const router = express.Router();

const loanController = require('../controllers/loan.controller');
const { authenticate } = require('../middleware/authenticate');
const checkPermission = require('../middleware/checkPermission');
const { validateCreateLoan } = require('../validators/loan.validator');

// ✅ Get all loans
router.get('/', authenticate, checkPermission('loan.view'), loanController.getAllLoans);

// ✅ Get loan details
router.get(
  '/:loanId/details',
  authenticate,
  checkPermission('loan.view'),
  loanController.getLoanDetails
);

// ✅ Create loan
router.post(
  '/',
  authenticate,
  checkPermission('loan.create'),
  validateCreateLoan,
  loanController.createLoan
);

// ✅ Delete loan
router.delete('/:id', authenticate, checkPermission('loan.delete'), loanController.deleteLoan);

// ✅ Update loan
router.put('/:id', authenticate, checkPermission('loan.edit'), loanController.updateLoan);

// ✅ Import Loans
router.post('/import', authenticate, loanController.importLoans);

module.exports = router;
