const topupService = require('../services/topup.service');

exports.createTopup = async (req, res) => {
  try {
    const { loan_id, amount, topup_date } = req.body;

    if (!loan_id || !amount || !topup_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: loan_id, amount, topup_date',
      });
    }

    await topupService.addTopup(req.body);

    res.status(201).json({
      success: true,
      message: 'Top-up added successfully',
    });
  } catch (err) {
    console.error('Create Topup Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to add top-up',
    });
  }
};

exports.deleteTopup = async (req, res) => {
  try {
    await topupService.deleteTopup(req.params.id);
    res.json({ success: true, message: 'Topup deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateTopup = async (req, res) => {
  try {
    await topupService.updateTopup(req.params.id, req.body);
    res.json({ success: true, message: 'Topup updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
