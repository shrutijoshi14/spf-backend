const db = require('../db');
async function run() {
  const [rows] = await db.query(
    'SELECT l.loan_id, b.full_name, l.penalty_settings_amount, l.penalty_settings_day, l.status FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id'
  );
  console.log(rows);
  process.exit();
}
run();
