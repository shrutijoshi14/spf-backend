// const jwt = require('jsonwebtoken');
// const dotenv = require('dotenv');
// dotenv.config();

// const generateToken = (user) => {
//   return jwt.sign(
//     { user_id: user.user_id, role: user.role, email: user.email },
//     process.env.JWT_SECRET,
//     { expiresIn: '8h' }
//   );
// };

// module.exports = { generateToken };

const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      full_name: user.full_name, // ✅ ADD THIS
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

module.exports = { generateToken };
