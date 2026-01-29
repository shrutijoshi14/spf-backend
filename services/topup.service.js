const db = require('../db');
const loanService = require('./loan.service');
const notificationService = require('./notification.service');

exports.addTopup = async (data) => {
  const connection = await db.getConnection();
  try {
    const { loan_id, amount, topup_date, remarks } = data;

    await connection.beginTransaction();

    // 1. Insert Topup Record
    await connection.query(
      'INSERT INTO loan_topups (loan_id, topup_amount, topup_date, remarks) VALUES (?, ?, ?, ?)',
      [loan_id, amount, topup_date, remarks || null]
    );

    // 2. Update Loan Principal ONLY
    await connection.query(
      'UPDATE loans SET principal_amount = principal_amount + ? WHERE loan_id = ?',
      [amount, loan_id]
    );

    await connection.commit();

    // 3. Recalculate Outstanding
    await loanService.recalculateLoanOutstanding(loan_id);

    // 🔔 Notify
    const [loanRows] = await connection.query(
      `SELECT b.full_name FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id WHERE l.loan_id = ?`,
      [loan_id]
    );
    const borrowerName = loanRows[0]?.full_name || 'Borrower';

    await notificationService.createNotification({
      title: 'Loan Top-up Added',
      message: `Top-up of ₹${amount} added to Loan #${loan_id} (${borrowerName}).`,
      type: 'topup',
    });

    return { success: true };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.deleteTopup = async (topupId) => {
  const connection = await db.getConnection();
  try {
    // 1. Get Topup
    const [topups] = await connection.query('SELECT * FROM loan_topups WHERE topup_id = ?', [
      topupId,
    ]);
    if (topups.length === 0) throw new Error('Topup not found');
    const topup = topups[0];
    const loanId = topup.loan_id;

    await connection.beginTransaction();

    // 2. Revert Loan Principal ONLY
    await connection.query(
      'UPDATE loans SET principal_amount = principal_amount - ? WHERE loan_id = ?',
      [topup.topup_amount, loanId]
    );

    // 3. Delete Topup
    await connection.query('DELETE FROM loan_topups WHERE topup_id = ?', [topupId]);

    await connection.commit();

    // 4. Recalculate Outstanding
    await loanService.recalculateLoanOutstanding(loanId);

    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.updateTopup = async (topupId, data) => {
  const connection = await db.getConnection();
  try {
    // 1. Get Old Topup
    const [topups] = await connection.query('SELECT * FROM loan_topups WHERE topup_id = ?', [
      topupId,
    ]);
    if (topups.length === 0) throw new Error('Topup not found');
    const oldTopup = topups[0];
    const loanId = oldTopup.loan_id;

    await connection.beginTransaction();

    // 2. Calculate Diff
    const diff = Number(data.amount) - Number(oldTopup.topup_amount);

    // 3. Update Loan Principal ONLY
    await connection.query(
      'UPDATE loans SET principal_amount = principal_amount + ? WHERE loan_id = ?',
      [diff, loanId]
    );

    // 4. Update Topup
    await connection.query(
      'UPDATE loan_topups SET topup_amount = ?, topup_date = ?, remarks = ? WHERE topup_id = ?',
      [data.amount, data.topup_date, data.remarks || null, topupId]
    );

    await connection.commit();

    // 5. Recalculate Outstanding
    await loanService.recalculateLoanOutstanding(loanId);

    return { success: true };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
