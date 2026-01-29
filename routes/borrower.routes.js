const express = require('express');
const router = express.Router();

const borrowerController = require('../controllers/borrower.controller');
const authenticate = require('../middleware/authenticate');
const checkPermission = require('../middleware/checkPermission');
const {
  validateCreateBorrower,
  validateUpdateBorrower,
} = require('../validators/borrower.validator');

router.get('/', authenticate, checkPermission('borrower.view'), borrowerController.getAll);

router.post(
  '/',
  authenticate,
  checkPermission('borrower.create'),
  validateCreateBorrower,
  borrowerController.createBorrower
);

router.put(
  '/:id',
  authenticate,
  checkPermission('borrower.edit'),
  validateCreateBorrower, // Note: Using Create validator or Update? Let's check Update
  borrowerController.update
);

router.delete('/:id', authenticate, checkPermission('borrower.delete'), borrowerController.remove);

module.exports = router;
