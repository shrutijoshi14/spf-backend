const authService = require('../services/auth.service');

exports.signup = async (req, res) => {
  try {
    const message = await authService.signup(req.body);
    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const data = await authService.login(req.body);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.profile = (req, res) => {
  res.status(200).json({ success: true, data: req.user });
};

exports.updateProfile = async (req, res) => {
  try {
    const updatedUser = await authService.updateProfile(req.user.user_id, req.body);
    res.status(200).json({ success: true, data: updatedUser });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const data = await authService.forgotPassword(req.body.email);
    // data might be { message, token } or just string (legacy)
    const response = typeof data === 'string' ? { message: data } : data;
    res.status(200).json({ success: true, ...response });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const message = await authService.resetPassword(req.params.token, req.body.password);
    res.status(200).json({ success: true, message });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
