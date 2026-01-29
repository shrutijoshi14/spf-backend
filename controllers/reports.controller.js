const reportsService = require('../services/reports.service');
const { Parser } = require('json2csv');

exports.getStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range required' });
    }
    const stats = await reportsService.getReportStats(startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch report stats' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range required' });
    }
    const transactions = await reportsService.getReportTransactions(startDate, endDate, type);
    res.json({ success: true, data: transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Date range required' });
    }

    const transactions = await reportsService.getReportTransactions(startDate, endDate, type);

    if (transactions.length === 0) {
      return res.status(404).json({ success: false, message: 'No data to export' });
    }

    const fields = ['date', 'type', 'description', 'amount', 'status'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(transactions);

    res.header('Content-Type', 'text/csv');
    res.attachment(`report_${startDate}_to_${endDate}.csv`);
    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};
