require('dotenv').config();
const db = require('./db');
const dashboardService = require('./services/dashboard.service');

async function debugDashboard() {
  console.log('🔍 Starting Dashboard Debug...');
  try {
    const data = await dashboardService.getDashboardStats();
    console.log('✅ Dashboard Data Fetched Successfully!');
    console.log('Stats:', data.stats);
  } catch (err) {
    console.error('❌ Dashboard Fetch Failed!');
    console.error('Error Message:', err.message);
    console.error('SQL State:', err.sqlState);
    console.error('SQL Message:', err.sqlMessage);
    if (err.sql) console.error('Failed Query:', err.sql);
  } finally {
    process.exit();
  }
}

debugDashboard();
