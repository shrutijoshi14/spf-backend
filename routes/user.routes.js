const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// All routes require login and SuperAdmin or Admin role
router.use(authenticate);
router.use(authorize('SUPERADMIN', 'ADMIN'));

router.get('/', userController.getAllUsers);
router.put('/:userId/role', userController.updateUserRole);
router.put('/:userId/status', userController.updateUserStatus);
router.put('/:userId', userController.updateUserDetails);
router.delete('/:userId', userController.deleteUser);

module.exports = router;
