const loanService = require('../services/loan.service');

exports.getAllLoans = async (req, res) => {
  try {
    const { search } = req.query;
    const loans = await loanService.getAllLoans(search);
    res.json({ success: true, data: loans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createLoan = async (req, res) => {
  try {
    const loan = await loanService.createLoan(req.body);
    res.status(201).json({
      success: true,
      message: 'Loan created successfully',
      data: loan,
    });
  } catch (err) {
    console.error('Create Loan Error:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Server error',
    });
  }
};

exports.getLoanDetails = async (req, res) => {
  try {
    const { loanId } = req.params;
    const data = await loanService.getLoanDetails(loanId);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error('Get Loan Details Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
exports.deleteLoan = async (req, res) => {
  try {
    await loanService.deleteLoan(req.params.id);
    res.json({ success: true, message: 'Loan deleted successfully' });
  } catch (err) {
    console.error('Delete Loan Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateLoan = async (req, res) => {
  try {
    const success = await loanService.updateLoan(req.params.id, req.body);
    if (!success) return res.status(400).json({ success: false, message: 'No fields to update' });
    res.json({ success: true, message: 'Loan updated successfully' });
  } catch (err) {
    console.error('Update Loan Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.importLoans = async (req, res) => {
  try {
    const { loans } = req.body;
    if (!loans || !Array.isArray(loans) || loans.length === 0) {
      return res.status(400).json({ success: false, message: 'No loans data provided' });
    }

    const results = await loanService.importLoans(loans);

    res.json({
      success: true,
      message: `Imported ${results.imported} loans. Failed: ${results.failed.length}`,
      data: results,
    });
  } catch (err) {
    console.error('Import Loans Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
