// const db = require('../db');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { generateToken } = require('../utils/jwt');

// exports.signup = async ({ full_name, email, mobile, password, role }) => {
//   const [existing] = await db.promise().query('SELECT * FROM users WHERE email=?', [email]);

//   if (existing.length) {
//     throw { status: 400, message: 'User already exists' };
//   }

//   const hash = await bcrypt.hash(password, 10);

//   await db
//     .promise()
//     .query('INSERT INTO users (full_name,email,mobile,password,role) VALUES (?,?,?,?,?)', [
//       full_name,
//       email,
//       mobile,
//       hash,
//       role,
//     ]);

//   return 'Signup successful';
// };

// exports.login = async ({ email, password }) => {
//   const [users] = await db.promise().query('SELECT * FROM users WHERE email=?', [email]);

//   if (!users.length) {
//     throw { status: 400, message: 'Invalid email/password' };
//   }

//   const user = users[0];
//   const isMatch = await bcrypt.compare(password, user.password);

//   if (!isMatch) {
//     throw { status: 400, message: 'Invalid email/password' };
//   }

//   const token = generateToken(user);

//   return {
//     token,
//     role: user.role,
//     full_name: user.full_name,
//   };
// };

// exports.forgotPassword = async (email) => {
//   const [users] = await db.promise().query('SELECT * FROM users WHERE email=?', [email]);

//   if (!users.length) {
//     throw { status: 404, message: 'User not found' };
//   }

//   const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

//   await db
//     .promise()
//     .query(
//       'UPDATE users SET reset_token=?, reset_token_expiry=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email=?',
//       [token, email]
//     );

//   return 'Reset link sent to email';
// };

// exports.resetPassword = async (token, password) => {
//   const decoded = jwt.verify(token, process.env.JWT_SECRET);

//   const [users] = await db
//     .promise()
//     .query('SELECT * FROM users WHERE email=? AND reset_token=? AND reset_token_expiry > NOW()', [
//       decoded.email,
//       token,
//     ]);

//   if (!users.length) {
//     throw { status: 400, message: 'Invalid or expired token' };
//   }

//   const hashed = await bcrypt.hash(password, 10);

//   await db
//     .promise()
//     .query('UPDATE users SET password=?, reset_token=NULL, reset_token_expiry=NULL WHERE email=?', [
//       hashed,
//       decoded.email,
//     ]);

//   return 'Password reset successful';
// };

const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../utils/jwt');
const emailService = require('./email.service');

exports.signup = async ({ full_name, email, mobile, password, role }) => {
  const [existing] = await db.query('SELECT * FROM users WHERE email=?', [email]);

  if (existing.length) {
    throw { status: 400, message: 'User already exists with this email' };
  }

  const hash = await bcrypt.hash(password, 10);

  await db.query('INSERT INTO users (full_name,email,mobile,password,role) VALUES (?,?,?,?,?)', [
    full_name,
    email,
    mobile,
    hash,
    role || 'STAFF',
  ]);

  return 'Signup successful';
};

exports.login = async ({ email, password }) => {
  const [users] = await db.query('SELECT * FROM users WHERE email=?', [email]);

  if (!users.length) {
    throw { status: 400, message: 'Invalid email or password' };
  }

  const user = users[0];
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw { status: 400, message: 'Invalid email or password' };
  }

  if (user.status === 'DISABLED') {
    throw { status: 403, message: 'Account is disabled. Please contact support.' };
  }

  // Update last_login
  await db.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

  // Check if any SuperAdmin exists in the system
  const [superAdmins] = await db.query('SELECT user_id FROM users WHERE role = "SUPERADMIN"');
  let isFirstSuperAdmin = false;
  let superAdminAlreadyExists = superAdmins.length > 0;

  if (!superAdminAlreadyExists) {
    // If no SuperAdmin exists, the first person who logs in becomes SuperAdmin
    await db.query('UPDATE users SET role = "SUPERADMIN" WHERE user_id = ?', [user.user_id]);
    user.role = 'SUPERADMIN';
    isFirstSuperAdmin = true;
  }

  const token = generateToken(user);

  return {
    token,
    role: user.role,
    full_name: user.full_name,
    email: user.email,
    mobile: user.mobile,
    userId: user.user_id,
    isFirstSuperAdmin,
  };
};

exports.forgotPassword = async (email) => {
  const [users] = await db.query('SELECT * FROM users WHERE email=?', [email]);

  if (!users.length) {
    throw { status: 404, message: 'User not found' };
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

  await db.query(
    'UPDATE users SET reset_token=?, reset_token_expiry=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email=?',
    [token, email]
  );

  // Send Email
  try {
    await emailService.sendResetEmail(email, token);
    return { message: 'Reset link sent to your email', token: null };
  } catch (error) {
    console.warn('⚠️ Email send failed. Falling back to dev-mode token response.');

    // In dev environment, we return the token so the UI can auto-redirect
    if (process.env.NODE_ENV !== 'production') {
      return {
        message: 'DEV MODE: Email failed, but you can still reset using this session.',
        token,
      };
    }
    throw new Error('Failed to send reset email');
  }
};

exports.resetPassword = async (token, password) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await db.query(
      'SELECT * FROM users WHERE email=? AND reset_token=? AND reset_token_expiry > NOW()',
      [decoded.email, token]
    );

    if (!users.length) {
      throw { status: 400, message: 'Invalid or expired token' };
    }

    const hashed = await bcrypt.hash(password, 10);

    await db.query(
      'UPDATE users SET password=?, reset_token=NULL, reset_token_expiry=NULL WHERE email=?',
      [hashed, decoded.email]
    );

    return 'Password reset successful';
  } catch (err) {
    throw { status: 400, message: 'Invalid or expired token' };
  }
};

exports.updateProfile = async (userId, { full_name, email, mobile }) => {
  // Check if email is already taken by another user
  const [existing] = await db.query('SELECT * FROM users WHERE email=? AND user_id != ?', [
    email,
    userId,
  ]);
  if (existing.length) {
    throw { status: 400, message: 'Email is already taken by another user' };
  }

  await db.query('UPDATE users SET full_name=?, email=?, mobile=? WHERE user_id=?', [
    full_name,
    email,
    mobile,
    userId,
  ]);

  const [updated] = await db.query(
    'SELECT user_id, full_name, email, mobile, role FROM users WHERE user_id=?',
    [userId]
  );
  return updated[0];
};
