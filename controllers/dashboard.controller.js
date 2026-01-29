const dashboardService = require('../services/dashboard.service');

exports.getDashboardData = async (req, res) => {
  try {
    const data = await dashboardService.getDashboardStats();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Dashboard Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const data = await dashboardService.getAllHistory(page, limit, search);
    res.json({ success: true, data });
  } catch (err) {
    console.error('History Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
};
