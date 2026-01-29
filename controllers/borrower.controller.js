const borrowerService = require('../services/borrower.service');

exports.getAll = async (req, res) => {
  try {
    const data = await borrowerService.getAll();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Get All Borrowers Error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};

exports.createBorrower = async (req, res) => {
  try {
    console.log('📝 Received Create Borrower Request Body:', JSON.stringify(req.body, null, 2));
    const borrower = await borrowerService.createBorrower(req.body);
    res.status(201).json({
      success: true,
      message: 'Borrower added successfully',
      data: borrower,
    });
  } catch (err) {
    console.error('❌ Create Borrower Error Details:', err);
    console.error('❌ Stack Trace:', err.stack);
    res.status(400).json({
      success: false,
      message: err.message || 'Server error',
      errorDetails: err.toString(), // Temporary for debugging
    });
  }
};

exports.update = async (req, res) => {
  try {
    await borrowerService.update(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Borrower updated successfully' });
  } catch (err) {
    console.error('Update Borrower Error:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    await borrowerService.remove(req.params.id);
    res.status(200).json({ success: true, message: 'Borrower deleted successfully' });
  } catch (err) {
    console.error('Remove Borrower Error:', err.message);
    res.status(400).json({ success: false, message: err.message || 'Server error' });
  }
};

exports.getAllBorrowers = async (req, res) => {
  try {
    const borrowers = await borrowerService.getAllBorrowers();

    return res.status(200).json({
      success: true,
      data: borrowers,
    });
  } catch (error) {
    console.error('❌ Get Borrowers Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch borrowers',
    });
  }
};
