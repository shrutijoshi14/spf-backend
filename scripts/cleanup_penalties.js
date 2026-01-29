require('dotenv').config({ path: '../.env' });
const db = require('../db');
const loanService = require('../services/loan.service');

async function cleanup() {
  const connection = await db.getConnection();
  try {
    console.log('🧹 Starting Cleanup of Illogical Penalties...');

    // 1. Fetch all penalties and their loan disbursement dates
    const [penalties] = await connection.query(`
      SELECT p.penalty_id, p.loan_id, p.penalty_date, l.disbursement_date
      FROM penalties p
      JOIN loans l ON p.loan_id = l.loan_id
      WHERE p.is_paid = 0
    `);

    let deleteCount = 0;
    const affectedLoans = new Set();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;

    for (const p of penalties) {
      const penDate = new Date(p.penalty_date).getTime();
      const disDate = new Date(p.disbursement_date).getTime() + IST_OFFSET;

      // Maturity = Disbursement + 30 Days
      const maturityDate = disDate + 30 * 24 * 60 * 60 * 1000;

      // Rule: Penalty Date must be strictly AFTER maturity date
      if (penDate <= maturityDate) {
        console.log(
          `🗑️  Deleting illogical penalty ID ${p.penalty_id} for Loan #${p.loan_id} (Date: ${p.penalty_date}, Maturity: ${new Date(maturityDate).toISOString().split('T')[0]})`
        );

        await connection.query('DELETE FROM penalties WHERE penalty_id = ?', [p.penalty_id]);
        deleteCount++;
        affectedLoans.add(p.loan_id);
      }
    }

    // 2. Recalculate outstanding for all affected loans
    for (const loanId of affectedLoans) {
      await loanService.recalculateLoanOutstanding(loanId);
    }

    console.log(`✅ Cleanup Complete! Deleted ${deleteCount} incorrect records.`);
  } catch (err) {
    console.error('❌ Cleanup Failed:', err);
  } finally {
    connection.release();
    process.exit();
  }
}

cleanup();
