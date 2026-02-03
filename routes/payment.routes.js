const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const checkPermission = require('../middleware/checkPermission');
const paymentController = require('../controllers/payment.controller');

router.post('/', authenticate, checkPermission('payment.create'), paymentController.addPayment);

router.get('/', authenticate, checkPermission('payment.view'), paymentController.getPayments);

router.put('/:id', authenticate, checkPermission('payment.edit'), paymentController.updatePayment);

router.delete(
  '/:id',
  authenticate,
  checkPermission('payment.delete'),
  paymentController.deletePayment
);

module.exports = router;
