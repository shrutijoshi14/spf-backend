// const authorize =
//   (...roles) =>
//   (req, res, next) => {
//     if (!req.user || !roles.includes(req.user.role)) {
//       return res.status(403).json({ message: 'Forbidden' });
//     }
//     next();
//   };

// module.exports = authorize;

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    console.log('🔐 Authorize Check:', {
      userRole: req.user?.role,
      allowedRoles,
      user: req.user,
    });

    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No user information found',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden - ${req.user.role} role is not allowed to perform this action`,
      });
    }

    next();
  };
};

module.exports = authorize;
