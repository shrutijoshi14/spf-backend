const Joi = require('joi');

const createLoanSchema = Joi.object({
  borrowerId: Joi.number().integer().positive().required().messages({
    'number.base': 'Borrower ID must be a number',
    'number.positive': 'Borrower ID must be positive',
    'any.required': 'Borrower ID is required',
  }),
  principal: Joi.number().positive().required().messages({
    'number.positive': 'Principal must be a positive number',
    'any.required': 'Principal amount is required',
  }),
  interestRate: Joi.number().min(0).required().messages({
    'number.min': 'Interest rate cannot be negative',
    'any.required': 'Interest rate is required',
  }),
  tenureValue: Joi.number().integer().positive().required().messages({
    'number.positive': 'Tenure value must be positive',
    'any.required': 'Tenure value is required',
  }),
  tenureUnit: Joi.string()
    .valid('day', 'week', 'month', 'DAY', 'WEEK', 'MONTH')
    .required()
    .messages({
      'any.only': 'Tenure unit must be day, week, or month',
      'any.required': 'Tenure unit is required',
    }),
  interestType: Joi.string().valid('flat', 'compound', 'FLAT', 'COMPOUND').required().messages({
    'any.only': 'Interest type must be flat or compound',
    'any.required': 'Interest type is required',
  }),
  disbursementDate: Joi.date().required().messages({
    'date.base': 'Disbursement date must be a valid date',
    'any.required': 'Disbursement date is required',
  }),
  status: Joi.string().valid('ACTIVE', 'CLOSED', 'OVERDUE').optional().default('ACTIVE'),
  purpose: Joi.string().max(500).optional().allow(''),
});

const validateCreateLoan = (req, res, next) => {
  const { error, value } = createLoanSchema.validate(req.body, { abortEarly: false });
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
  validateCreateLoan,
};
