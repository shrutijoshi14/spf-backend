const db = require('../db');
const loanService = require('./loan.service');
const notificationService = require('./notification.service');

exports.addPayment = async (data) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Insert Payment
    const [result] = await connection.query(
      'INSERT INTO payments (loan_id, payment_amount, payment_date, payment_for, payment_mode, remarks) VALUES (?, ?, ?, ?, ?, ?)',
      [
        data.loan_id,
        data.amount,
        data.payment_date,
        data.payment_for || 'EMI',
        data.payment_mode,
        data.remarks || '',
      ]
    );

    await connection.commit();

    // 2. Recalculate Loan Outstanding
    await loanService.recalculateLoanOutstanding(data.loan_id);

    // 🔔 Notify
    // Fetch details for message
    const [loanRows] = await connection.query(
      `SELECT b.full_name FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id WHERE l.loan_id = ?`,
      [data.loan_id]
    );
    const borrowerName = loanRows[0]?.full_name || 'Borrower';

    await notificationService.createNotification({
      title: 'Payment Received',
      message: `Received ₹${data.amount} for Loan #${data.loan_id} (${borrowerName}).`,
      type: 'payment',
    });

    return { payment_id: result.insertId, ...data };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.deletePayment = async (paymentId) => {
  const connection = await db.getConnection();
  try {
    // 1. Get Payment Details (need loan_id)
    const [payments] = await connection.query('SELECT loan_id FROM payments WHERE payment_id = ?', [
      paymentId,
    ]);
    if (payments.length === 0) throw new Error('Payment not found');
    const loanId = payments[0].loan_id;

    await connection.beginTransaction();

    // 2. Delete Payment
    await connection.query('DELETE FROM payments WHERE payment_id = ?', [paymentId]);

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

exports.updatePayment = async (paymentId, data) => {
  const connection = await db.getConnection();
  try {
    // 1. Get Old Payment Details (need loan_id)
    const [payments] = await connection.query('SELECT loan_id FROM payments WHERE payment_id = ?', [
      paymentId,
    ]);
    if (payments.length === 0) throw new Error('Payment not found');
    const loanId = payments[0].loan_id;

    await connection.beginTransaction();

    // 2. Update Payment Record
    await connection.query(
      'UPDATE payments SET payment_amount = ?, payment_date = ?, payment_for = ?, payment_mode = ?, remarks = ? WHERE payment_id = ?',
      [
        data.amount,
        data.payment_date,
        data.payment_for || 'EMI',
        data.payment_mode,
        data.remarks || '',
        paymentId,
      ]
    );

    await connection.commit();

    // 3. Recalculate
    await loanService.recalculateLoanOutstanding(loanId);

    return { ...data, payment_id: paymentId };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

exports.getPayments = async (loanId) => {
  let sql = `
    SELECT p.*, l.borrower_id, b.full_name as borrower_name
    FROM payments p
    JOIN loans l ON p.loan_id = l.loan_id
    JOIN borrowers b ON l.borrower_id = b.borrower_id
  `;
  let params = [];

  if (loanId) {
    sql += ` WHERE p.loan_id = ?`;
    params.push(loanId);
  }

  sql += ` ORDER BY p.payment_date DESC, p.payment_id DESC`;

  const [rows] = await db.query(sql, params);
  return rows;
};
