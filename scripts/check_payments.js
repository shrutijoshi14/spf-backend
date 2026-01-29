const db = require('../db');
async function run() {
  const loanId = 1;
  const start = '2026-01-01';
  const end = '2026-01-31';
  const [rows] = await db.query(
    "SELECT * FROM payments WHERE loan_id = ? AND payment_date BETWEEN ? AND ? AND payment_for IN ('INTEREST', 'EMI')",
    [loanId, start, end]
  );
  console.log('Payments found for Loan 1 in Jan:', rows);
  process.exit();
}
run();
