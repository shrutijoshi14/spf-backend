const db = require('../db');
const fs = require('fs');
const path = require('path');

const logError = (msg) => {
  fs.appendFileSync(
    path.join(__dirname, '../error.log'),
    new Date().toISOString() + ': ' + msg + '\n'
  );
};

exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT user_id, full_name, email, role, status, last_login, mobile, created_at FROM users ORDER BY FIELD(role, 'SUPERADMIN', 'ADMIN', 'STAFF'), created_at DESC"
    );
    res.status(200).json({ success: true, data: users });
  } catch (err) {
    logError('getAllUsers Error: ' + err.message + '\n' + err.stack);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateUserRole = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const requesterRole = req.user.role;

  try {
    // Logic based on requirements:
    // 1. Admin can make others SuperAdmin
    // 2. SuperAdmin can make anyone SuperAdmin or Admin
    if (requesterRole === 'ADMIN') {
      if (role !== 'SUPERADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admins can only promote users to SUPERADMIN role.',
        });
      }
    } else if (requesterRole === 'SUPERADMIN') {
      if (!['SUPERADMIN', 'ADMIN'].includes(role)) {
        // If they want to demote to STAFF, maybe allow it too?
        // But prompt says "make superadmin or admin to anyone"
        // Let's allow STAFF too if SuperAdmin wants, but focus on the request.
        // For now, allow SuperAdmin to set any valid role.
      }
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized role update' });
    }

    // Safety: Prevent demoting the last SUPERADMIN
    const [currentUser] = await db.query('SELECT role FROM users WHERE user_id = ?', [userId]);
    if (currentUser.length > 0 && currentUser[0].role === 'SUPERADMIN' && role !== 'SUPERADMIN') {
      const [superAdmins] = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE role = "SUPERADMIN"'
      );
      if (superAdmins[0].count <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot demote the last SUPERADMIN. Please appoint another SUPERADMIN first.',
        });
      }
    }

    await db.query('UPDATE users SET role = ? WHERE user_id = ?', [role, userId]);
    res.status(200).json({ success: true, message: `User role updated to ${role} successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    // Only SuperAdmin should delete users
    if (req.user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, message: 'Only SuperAdmin can delete users' });
    }

    await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        success: false,
        message:
          'Cannot delete user with active history (loans/payments). Please Disable them instead.',
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  try {
    // Only SuperAdmin should update user status
    if (req.user.role !== 'SUPERADMIN') {
      return res
        .status(403)
        .json({ success: false, message: 'Only SuperAdmin can update user status' });
    }

    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      throw { status: 400, message: 'Invalid status' };
    }
    await db.query('UPDATE users SET status = ? WHERE user_id = ?', [status, userId]);
    res.status(200).json({ success: true, message: `User status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
