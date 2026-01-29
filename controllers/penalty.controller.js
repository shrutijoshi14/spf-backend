const penaltyService = require('../services/penalty.service');
const automaticPenaltyService = require('../services/automaticPenalty.service');

exports.checkDailyPenalties = async (req, res) => {
  try {
    const result = await automaticPenaltyService.checkDailyPenalties();
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Auto Penalty Check Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check penalties',
    });
  }
};

exports.createPenalty = async (req, res) => {
  try {
    const { loan_id, amount, penalty_date } = req.body;

    if (!loan_id || !amount || !penalty_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: loan_id, amount, penalty_date',
      });
    }

    await penaltyService.addPenalty(req.body);

    res.status(201).json({
      success: true,
      message: 'Penalty added successfully',
    });
  } catch (err) {
    console.error('Create Penalty Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to add penalty',
    });
  }
};

exports.deletePenalty = async (req, res) => {
  try {
    await penaltyService.deletePenalty(req.params.id);
    res.json({ success: true, message: 'Penalty deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updatePenalty = async (req, res) => {
  try {
    await penaltyService.updatePenalty(req.params.id, req.body);
    res.json({ success: true, message: 'Penalty updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
