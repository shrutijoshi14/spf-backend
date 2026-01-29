const Joi = require('joi');

const signupSchema = Joi.object({
  full_name: Joi.string().min(3).max(100).required().messages({
    'string.empty': 'Full name is required',
    'string.min': 'Full name must be at least 3 characters',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'string.empty': 'Email is required',
  }),
  mobile: Joi.string().length(10).pattern(/^\d+$/).required().messages({
    'string.length': 'Mobile must be 10 digits',
    'string.pattern.base': 'Mobile must contain only numbers',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'string.empty': 'Password is required',
  }),
  role: Joi.string().valid('ADMIN', 'SUPERADMIN', 'STAFF').required().messages({
    'any.only': 'Role must be ADMIN, SUPERADMIN, or STAFF',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'string.empty': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
  }),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email',
    'string.empty': 'Email is required',
  }),
});

const resetPasswordSchema = Joi.object({
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'string.empty': 'Password is required',
  }),
});

// Middleware functions
// const validateSignup = (req, res, next) => {
//   const { error, value } = signupSchema.validate(req.body, { abortEarly: false });
//   if (error) {
//     return res.status(400).json({
//       success: false,
//       message: 'Validation error',
//       errors: error.details.map((e) => ({ field: e.path[0], message: e.message })),
//     });
//   }
//   req.body = value;
//   next();
// };

const validateSignup = (req, res, next) => {
  const { full_name, email, mobile, password } = req.body;

  if (!full_name || !email || !mobile || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ success: false, message: 'Password must be at least 6 characters' });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((e) => ({ field: e.path[0], message: e.message })),
    });
  }
  req.body = value;
  next();
};

const validateForgotPassword = (req, res, next) => {
  const { error, value } = forgotPasswordSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((e) => ({ field: e.path[0], message: e.message })),
    });
  }
  req.body = value;
  next();
};

const validateResetPassword = (req, res, next) => {
  const { error, value } = resetPasswordSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((e) => ({ field: e.path[0], message: e.message })),
    });
  }
  req.body = value;
  next();
};

module.exports = {
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
};
