// const express = require('express');
// const router = express.Router();
// const db = require('../db');
// const bcrypt = require('bcryptjs');
// const { generateToken } = require('../utils/jwt');
// const auth = require('../middleware/authMiddleware');
// const nodemailer = require('nodemailer');
// const jwt = require('jsonwebtoken');

// // Only loggedin users can access this
// router.get('/profile', auth, (req, res) => {
//   res.json(req.user);
// });

// /* ================= Signup (only first superadmin) ================= */
// router.post('/signup', async (req, res) => {
//   try {
//     const { full_name, email, mobile, password, role } = req.body;

//     const [existingUser] = await db.promise().query(`SELECT * FROM users WHERE email=?`, [email]);

//     if (existingUser.length > 0) {
//       return res.status(400).json({ message: 'User already exists' });
//     }

//     const hash = await bcrypt.hash(password, 10);

//     db.query(
//       `INSERT INTO users (full_name,email,mobile,password,role) VALUES (?,?,?,?,?)`,
//       [full_name, email, mobile, hash, role],
//       (err) => {
//         if (err) {
//           console.error(err); // 👈 NOW YOU WILL SEE ERRORS
//           return res.status(500).json({ message: 'Database error' });
//         }
//         res.json({ message: 'Signup successful' });
//       }
//     );
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* ================= LOGIN ================= */
// router.post('/login', (req, res) => {
//   const { email, password } = req.body;

//   db.query(`SELECT * FROM users WHERE email=?`, [email], async (err, results) => {
//     if (err) return res.status(500).json(err);
//     if (results.length === 0) return res.status(400).json({ message: 'Invalid email/password' });

//     const user = results[0];
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return res.status(400).json({ message: 'Invalid email/password' });

//     const token = generateToken(user);
//     res.json({ token, role: user.role, full_name: user.full_name });
//   });
// });

// /* ================= FORGOT PASSWORD ================= */
// router.post('/forgot-password', async (req, res) => {
//   try {
//     const { email } = req.body;

//     const [users] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);

//     if (!users.length) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     const token = jwt.sign({ email }, process.env.JWT_SECRET, {
//       expiresIn: '1h',
//     });

//     await db
//       .promise()
//       .query(
//         'UPDATE users SET reset_token = ?, reset_token_expiry = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email = ?',
//         [token, email]
//       );

//     // mail logic...

//     res.json({ message: 'Reset link sent to email' });
//   } catch (err) {
//     console.error('Forgot password error:', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// /* ================= RESET PASSWORD ================= */
// router.post('/reset-password/:token', async (req, res) => {
//   const { token } = req.params;
//   const { password } = req.body;

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     const [users] = await db
//       .promise()
//       .query(
//         'SELECT * FROM users WHERE email = ? AND reset_token = ? AND reset_token_expiry > NOW()',
//         [decoded.email, token]
//       );

//     if (!users.length) {
//       return res.status(400).json({ message: 'Invalid or expired token' });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);

//     await db
//       .promise()
//       .query(
//         'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE email = ?',
//         [hashedPassword, decoded.email]
//       );

//     res.json({ message: 'Password reset successful' });
//   } catch {
//     res.status(400).json({ message: 'Invalid or expired token' });
//   }
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middleware/authenticate');
const {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} = require('../validators/auth.validator');

// Public routes
router.post('/signup', validateSignup, authController.signup);
router.post('/login', validateLogin, authController.login);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password/:token', validateResetPassword, authController.resetPassword);

// Protected routes
router.get('/profile', authenticate, authController.profile);
router.put('/profile', authenticate, authController.updateProfile);

module.exports = router;
