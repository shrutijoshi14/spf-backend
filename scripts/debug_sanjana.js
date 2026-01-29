require('dotenv').config({ path: '../.env' });
const db = require('../db');
const settingsService = require('../services/settings.service');

async function debugSanjana() {
  const connection = await db.getConnection();
  try {
    const [loans] = await connection.query(`
      SELECT l.*, b.full_name
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      WHERE b.full_name LIKE '%Sanjana Lad%' AND l.status='ACTIVE'
    `);

    if (loans.length === 0) {
      console.log('No loan found for Sanjana Lad');
      return;
    }

    const settings = await settingsService.getSettings();
    const penaltyDay = Number(settings.penalty_days) || 5;

    console.log(`Settings Penalty Day: ${penaltyDay}`);

    loans.forEach((loan) => {
      console.log(`\nLoan: ${loan.loan_id}, Disbursed: ${loan.disbursement_date}`);

      const today = new Date();
      // Calculate diff
      const IST_OFFSET = 5.5 * 60 * 60 * 1000; // Not strictly needed for day diff if we use UTC consistently, but let's stick to logic
      // Actually dates from DB might be strings.
      const disbDate = new Date(loan.disbursement_date);
      const penaltyDateThisMonth = new Date(today.getFullYear(), today.getMonth(), penaltyDay);

      const diffTime = penaltyDateThisMonth - disbDate;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      console.log(`Diff Days calculation: ${diffDays}`);

      if (diffDays < 20) {
        console.log('RESULT: Too new (<20 days).');
      } else {
        console.log('RESULT: Old enough.');
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    connection.release();
    process.exit();
  }
}

debugSanjana();
