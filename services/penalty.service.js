const db = require('../db');
const loanService = require('./loan.service');
const notificationService = require('./notification.service');

exports.addPenalty = async (data) => {
  const connection = await db.getConnection();
  try {
    const { loan_id, amount, penalty_date, reason } = data;

    await connection.beginTransaction();

    // 1. Insert Penalty Record
    await connection.query(
      'INSERT INTO penalties (loan_id, penalty_amount, penalty_date, reason) VALUES (?, ?, ?, ?)',
      [loan_id, amount, penalty_date, reason || 'Late Payment Penalty']
    );

    await connection.commit();

    // 2. Recalculate Loan Outstanding
    await loanService.recalculateLoanOutstanding(loan_id);

    // 🔔 Notify
    const [loanRows] = await connection.query(
      `SELECT b.full_name FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id WHERE l.loan_id = ?`,
      [loan_id]
    );
    const borrowerName = loanRows[0]?.full_name || 'Borrower';

    await notificationService.createNotification({
      title: 'Manual Penalty Applied',
      message: `Penalty of ₹${amount} applied to Loan #${loan_id} (${borrowerName}). Reason: ${
        reason || 'Late Payment'
      }`,
      type: 'penalty',
    });

    return { success: true };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.deletePenalty = async (penaltyId) => {
  const connection = await db.getConnection();
  try {
    // 1. Get Penalty Details to know loan_id
    const [penalties] = await connection.query(
      'SELECT loan_id FROM penalties WHERE penalty_id = ?',
      [penaltyId]
    );
    if (penalties.length === 0) throw new Error('Penalty not found');
    const loanId = penalties[0].loan_id;

    await connection.beginTransaction();

    // 2. Delete Penalty
    await connection.query('DELETE FROM penalties WHERE penalty_id = ?', [penaltyId]);

    await connection.commit();

    // 3. Recalculate Loan
    await loanService.recalculateLoanOutstanding(loanId);

    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.updatePenalty = async (penaltyId, data) => {
  const connection = await db.getConnection();
  try {
    // 1. Get Penalty Details to know loan_id
    const [penalties] = await connection.query(
      'SELECT loan_id FROM penalties WHERE penalty_id = ?',
      [penaltyId]
    );
    if (penalties.length === 0) throw new Error('Penalty not found');
    const loanId = penalties[0].loan_id;

    await connection.beginTransaction();

    // 2. Update Penalty
    await connection.query(
      'UPDATE penalties SET penalty_amount = ?, penalty_date = ?, reason = ? WHERE penalty_id = ?',
      [data.amount, data.date, data.reason, penaltyId]
    );

    await connection.commit();

    // 3. Recalculate usage
    await loanService.recalculateLoanOutstanding(loanId);

    return { success: true };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
