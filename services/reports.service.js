const db = require('../db');

exports.getReportStats = async (startDate, endDate) => {
  const connection = await db.getConnection();
  try {
    // 1. Total Disbursed (Loans created in range)
    const [loanStats] = await connection.query(
      `SELECT COALESCE(SUM(principal_amount), 0) as total_disbursed, COUNT(*) as count_loans
       FROM loans
       WHERE status != 'DELETED'
       AND disbursement_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // 2. Total Collected (Payments in range)
    const [paymentStats] = await connection.query(
      `SELECT COALESCE(SUM(payment_amount), 0) as total_collected, COUNT(*) as count_payments
       FROM payments
       WHERE payment_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // 3. Penalties Added (Penalties in range)
    const [penaltyStats] = await connection.query(
      `SELECT COALESCE(SUM(penalty_amount), 0) as total_penalties, COUNT(*) as count_penalties
       FROM penalties
       WHERE penalty_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    return {
      disbursed: Number(loanStats[0].total_disbursed),
      collected: Number(paymentStats[0].total_collected),
      penalties: Number(penaltyStats[0].total_penalties),
      counts: {
        loans: loanStats[0].count_loans,
        payments: paymentStats[0].count_payments,
        penalties: penaltyStats[0].count_penalties,
      },
    };
  } finally {
    connection.release();
  }
};

exports.getReportTransactions = async (startDate, endDate, type = 'ALL') => {
  const connection = await db.getConnection();
  try {
    // Base SQL for Union
    let sql = `
      SELECT * FROM (
        SELECT
          l.loan_id as id,
          l.disbursement_date as date,
          'LOAN' as type,
          CONCAT('Loan Disbursed - ', b.full_name) as description,
          l.principal_amount as amount,
          l.status as status
        FROM loans l
        JOIN borrowers b ON l.borrower_id = b.borrower_id
        WHERE l.status != 'DELETED'

        UNION ALL

        SELECT
          p.payment_id as id,
          p.payment_date as date,
          'PAYMENT' as type,
          CONCAT('Payment (', p.payment_for, ') - ', b.full_name) as description,
          p.payment_amount as amount,
          'COMPLETED' as status
        FROM payments p
        JOIN loans l ON p.loan_id = l.loan_id
        JOIN borrowers b ON l.borrower_id = b.borrower_id

        UNION ALL

        SELECT
          pe.penalty_id as id,
          pe.penalty_date as date,
          'PENALTY' as type,
          CONCAT('Penalty: ', pe.reason, ' - ', b.full_name) as description,
          pe.penalty_amount as amount,
          'APPLIED' as status
        FROM penalties pe
        JOIN loans l ON pe.loan_id = l.loan_id
        JOIN borrowers b ON l.borrower_id = b.borrower_id
      ) as combined
      WHERE date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (type !== 'ALL') {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY date DESC`;

    const [rows] = await connection.query(sql, params);
    return rows;
  } finally {
    connection.release();
  }
};
