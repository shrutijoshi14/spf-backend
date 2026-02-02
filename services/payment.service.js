const db = require('../db');
const loanService = require('./loan.service');
const notificationService = require('./notification.service');
const auditService = require('./audit.service');

exports.deletePayment = async (paymentId) => {
  const connection = await db.getConnection();
  try {
    const [payments] = await connection.query('SELECT loan_id FROM payments WHERE payment_id = ?', [
      paymentId,
    ]);
    if (payments.length === 0) throw new Error('Payment not found');
    const loanId = payments[0].loan_id;

    await connection.beginTransaction();
    await connection.query('DELETE FROM payments WHERE payment_id = ?', [paymentId]);
    await connection.commit();

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
    const [payments] = await connection.query('SELECT loan_id FROM payments WHERE payment_id = ?', [
      paymentId,
    ]);
    if (payments.length === 0) throw new Error('Payment not found');
    const loanId = payments[0].loan_id;

    await connection.beginTransaction();

    // Check if updating payment_for is allowed? Assuming yes for admin
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
    await loanService.recalculateLoanOutstanding(loanId);
    return { ...data, payment_id: paymentId };
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// --- NEW LOGIC: Allocation Calculation ---
const calculateExpectedInterest = (loan) => {
  // Simple Flat Rate Calculation
  // Int = P * (R/100) * T
  const P = Number(loan.principal_amount);
  const R = Number(loan.interest_rate);
  const T = Number(loan.tenure_value);
  const Unit = loan.tenure_unit.toUpperCase();

  let totalInterest = 0;
  if (Unit === 'MONTH') {
    totalInterest = (P * R * T) / 100;
  } else if (Unit === 'WEEK') {
    totalInterest = (P * R * T) / 100;
  } else {
    // Day
    totalInterest = (P * R * T) / 100;
  }
  return Math.round(totalInterest * 100) / 100;
};

exports.addPayment = async (data) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 0. Permission Check for Override comes from Controller/Middleware (assumed)
    // We trust data.override if passed, but it should only be passed by Admin.

    // 1. Fetch Loan State
    const [loans] = await connection.query(`SELECT * FROM loans WHERE loan_id = ? FOR UPDATE`, [
      data.loan_id,
    ]);
    if (!loans.length) throw new Error('Loan not found');
    const loan = loans[0];

    // 2. Fetch Aggregates
    const [penalties] = await connection.query(
      'SELECT COALESCE(SUM(penalty_amount), 0) as total FROM penalties WHERE loan_id = ?',
      [data.loan_id]
    );
    const totalPenalties = Number(penalties[0].total);

    const [paidPenalties] = await connection.query(
      'SELECT COALESCE(SUM(payment_amount), 0) as total FROM payments WHERE loan_id = ? AND payment_for = "PENALTY"',
      [data.loan_id]
    );
    const paidPenaltyAmt = Number(paidPenalties[0].total);

    const [paidInterest] = await connection.query(
      'SELECT COALESCE(SUM(payment_amount), 0) as total FROM payments WHERE loan_id = ? AND payment_for = "INTEREST"',
      [data.loan_id]
    );
    const paidInterestAmt = Number(paidInterest[0].total);

    // 3. Determine Breakdown
    let finalAllocations = []; // { amount, type }

    if (data.override && data.override === true) {
      // ADMIN MANUAL OVERRIDE
      finalAllocations.push({ amount: data.amount, type: data.payment_for || 'EMI' });

      // LOG IT
      await auditService.createAuditLog({
        action: 'PAYMENT_OVERRIDE',
        userId: data.user_id, // Ensure controller passes this
        details: { loanId: data.loan_id, amount: data.amount, type: data.payment_for },
      });
    } else {
      // AUTOMATIC ALLOCATION
      let remaining = Number(data.amount);
      const pendingPenalty = Math.max(0, totalPenalties - paidPenaltyAmt);

      const totalExpectedInterest = calculateExpectedInterest(loan);
      const pendingInterest = Math.max(0, totalExpectedInterest - paidInterestAmt);

      // A. Penalty
      if (remaining > 0 && pendingPenalty > 0) {
        const toPay = Math.min(remaining, pendingPenalty);
        finalAllocations.push({ amount: toPay, type: 'PENALTY' });
        remaining -= toPay;
      }

      // B. Interest
      if (remaining > 0 && pendingInterest > 0) {
        const toPay = Math.min(remaining, pendingInterest);
        finalAllocations.push({ amount: toPay, type: 'INTEREST' });
        remaining -= toPay;
      }

      // C. EMI (Principal)
      if (remaining > 0) {
        finalAllocations.push({ amount: remaining, type: 'EMI' });
        remaining = 0;
      }
    }

    // 4. Insert Payments
    const resultIds = [];
    for (const alloc of finalAllocations) {
      if (alloc.amount > 0) {
        const [res] = await connection.query(
          'INSERT INTO payments (loan_id, payment_amount, payment_date, payment_for, payment_mode, remarks) VALUES (?, ?, ?, ?, ?, ?)',
          [
            data.loan_id,
            alloc.amount,
            data.payment_date,
            alloc.type,
            data.payment_mode,
            data.remarks || `Auto-Allocated (${alloc.type})`,
          ]
        );
        resultIds.push(res.insertId);
      }
    }

    await connection.commit();

    // 5. Recalculate Loan Outstanding
    await loanService.recalculateLoanOutstanding(data.loan_id);

    // 6. Notify
    const [b] = await connection.query(
      `SELECT b.full_name FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id WHERE l.loan_id = ?`,
      [data.loan_id]
    );
    const borrowerName = b[0]?.full_name || 'Borrower';
    const breakdownStr = finalAllocations.map((a) => `${a.type}: ₹${a.amount}`).join(', ');

    await notificationService.createNotification({
      title: 'Payment Received',
      message: `Received ₹${data.amount} for Loan #${data.loan_id} (${borrowerName}). [${breakdownStr}]`,
      type: 'payment',
    });

    return { payment_ids: resultIds, ...data, allocations: finalAllocations };
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
