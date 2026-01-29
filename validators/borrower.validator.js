const Joi = require('joi');

const createBorrowerSchema = Joi.object({
  full_name: Joi.string().min(3).max(100).required().messages({
    'string.empty': 'Full name is required',
    'string.min': 'Full name must be at least 3 characters',
  }),
  mobile: Joi.string().length(10).pattern(/^\d+$/).required().messages({
    'string.length': 'Mobile must be 10 digits',
    'string.pattern.base': 'Mobile must contain only numbers',
  }),
  alternate_mobile: Joi.string().length(10).pattern(/^\d+$/).optional().allow(''),
  email: Joi.string().email().optional().allow('').messages({
    'string.email': 'Please provide a valid email',
  }),
  address_line1: Joi.string().max(255).optional().allow('').messages({
    'string.empty': 'Address Line 1 is required',
  }),
  address_line2: Joi.string().max(255).optional().allow(''),
  city: Joi.string().max(50).optional().allow('').messages({
    'string.empty': 'City is required',
  }),
  state: Joi.string().max(50).optional().allow('').messages({
    'string.empty': 'State is required',
  }),
  pincode: Joi.string().length(6).pattern(/^\d+$/).optional().allow('').messages({
    'string.length': 'Pin code must be 6 digits',
    'string.pattern.base': 'Pin code must contain only numbers',
    'string.empty': 'Pin code is required',
  }),
  guarantor_name: Joi.string().max(100).optional().allow('').messages({
    'string.empty': 'Guarantor name is required',
  }),
  guarantor_phone: Joi.string().length(10).pattern(/^\d+$/).optional().allow('').messages({
    'string.length': 'Guarantor phone must be 10 digits',
    'string.pattern.base': 'Guarantor phone must contain only numbers',
    'string.empty': 'Guarantor phone is required',
  }),
  guarantor_address: Joi.string().max(255).optional().allow('').messages({
    'string.empty': 'Guarantor address is required',
  }),
  relatives_name: Joi.string().max(100).optional().allow('').messages({
    'string.empty': 'Relative name is required',
  }),
  relatives_phone: Joi.string().length(10).pattern(/^\d+$/).optional().allow('').messages({
    'string.length': 'Relative phone must be 10 digits',
    'string.pattern.base': 'Relative phone must contain only numbers',
    'string.empty': 'Relative phone is required',
  }),
  relation: Joi.string().max(50).optional().allow('').messages({
    'string.empty': 'Relation is required',
  }),
});

const updateBorrowerSchema = Joi.object({
  full_name: Joi.string().min(3).max(100).optional(),
  mobile: Joi.string().length(10).pattern(/^\d+$/).optional(),
  alternate_mobile: Joi.string().length(10).pattern(/^\d+$/).optional().allow(''),
  email: Joi.string().email().optional().allow(''),
  address_line1: Joi.string().max(255).optional().allow(''),
  address_line2: Joi.string().max(255).optional().allow(''),
  city: Joi.string().max(50).optional().allow(''),
  state: Joi.string().max(50).optional().allow(''),
  pincode: Joi.string().length(6).pattern(/^\d+$/).optional().allow(''),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update',
  });

const validateCreateBorrower = (req, res, next) => {
  const { error, value } = createBorrowerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
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

const validateUpdateBorrower = (req, res, next) => {
  const { error, value } = updateBorrowerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
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
  validateCreateBorrower,
  validateUpdateBorrower,
};
