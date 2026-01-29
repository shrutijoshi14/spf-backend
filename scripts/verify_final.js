const db = require('../db');
const service = require('../services/automaticPenalty.service');

async function run() {
  console.log('--- START VERIFY ---');
  const [loans] = await db.query(
    "SELECT l.*, b.full_name FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id WHERE l.status='ACTIVE'"
  );
  console.log(
    'Active Loans:',
    loans.map((l) => ({
      id: l.loan_id,
      name: l.full_name,
      p_day: l.penalty_settings_day,
      p_amt: l.penalty_settings_amount,
    }))
  );

  console.log('Running checkDailyPenalties...');
  const result = await service.checkDailyPenalties();
  console.log('Result:', result);

  const [pens] = await db.query('SELECT * FROM penalties ORDER BY penalty_id DESC LIMIT 5');
  console.log('Latest 5 penalties:', pens);

  process.exit();
}
run();
