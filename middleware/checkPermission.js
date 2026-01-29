const db = require('../db');

const checkPermission = (permissionCode) => {
  return async (req, res, next) => {
    try {
      const userRole = req.user?.role;

      if (!userRole) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // 1. SUPERADMIN has full access
      if (userRole === 'SUPERADMIN') {
        return next();
      }

      // 2. Check Database for Permission
      // We can cache this, but for now a direct query is safest for real-time toggles.
      const [rows] = await db.query(
        'SELECT 1 FROM role_permissions WHERE role = ? AND permission_code = ?',
        [userRole, permissionCode]
      );

      if (rows.length > 0) {
        return next(); // Permission Granted
      }

      // 3. Permission Denied
      return res.status(403).json({
        success: false,
        message: `Forbidden - Role '${userRole}' lacks permission: '${permissionCode}'`,
      });
    } catch (err) {
      console.error('Permission Check Error:', err);
      return res.status(500).json({ message: 'Server error authorizing request' });
    }
  };
};

module.exports = checkPermission;
