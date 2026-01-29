const db = require('../db');

exports.getDashboardStats = async () => {
  const connection = await db.getConnection();
  try {
    // 1. Basic Counts
    const [borrowerCount] = await connection.query(
      'SELECT COUNT(*) as count FROM borrowers WHERE status != "DISABLED"'
    );
    const [loanCounts] = await connection.query(`
      SELECT
        COUNT(*) as total_count,
        SUM(principal_amount) as total_principal,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN status = 'ACTIVE' THEN outstanding_amount ELSE 0 END) as total_outstanding,
        SUM(CASE WHEN status = 'ACTIVE' THEN ROUND(principal_amount * interest_rate / 100) ELSE 0 END) as monthly_interest
      FROM loans
      WHERE status != "DELETED"
    `);

    // 2. Payments
    const [paymentSum] = await connection.query(
      'SELECT SUM(payment_amount) as total FROM payments'
    );

    // 3. Charts Data - Monthly Interest Payable by Borrower (Based on Active Loans)
    const [interestByBorrower] = await connection.query(`
      SELECT
        b.full_name as name,
        SUM(ROUND(l.principal_amount * l.interest_rate / 100)) as total
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      WHERE l.status = 'ACTIVE'
      GROUP BY b.borrower_id, b.full_name
      ORDER BY total DESC
    `);

    // 4. Charts Data - Payment Performance (Total Paid by Borrower) - Colored by Status
    const [paymentPerformance] = await connection.query(`
      SELECT
        b.full_name as name,
        SUM(p.payment_amount) as total,
        -- Determine status tag for coloring: if any loan is OVERDUE, mark RED, else GREEN
        MAX(CASE WHEN l.status = 'OVERDUE' THEN 1 ELSE 0 END) as has_overdue
      FROM payments p
      JOIN loans l ON p.loan_id = l.loan_id
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      GROUP BY b.borrower_id, b.full_name
      ORDER BY total DESC
    `);

    // 4. Recent Activity (Loans & Payments mixed)
    // We'll fetch 5 latest loans and 5 latest payments, then sort/slice in JS for simplicity or use UNION
    const [recentLoans] = await connection.query(`
      SELECT
        l.loan_id, l.principal_amount, l.disbursement_date as date,
        b.full_name, 'LOAN' as type
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      WHERE l.status != 'DELETED'
      ORDER BY l.loan_id DESC LIMIT 5
    `);

    const [recentPayments] = await connection.query(`
      SELECT
        p.payment_id, p.payment_amount, p.payment_date as date,
        b.full_name, 'PAYMENT' as type
      FROM payments p
      JOIN loans l ON p.loan_id = l.loan_id
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      ORDER BY p.payment_id DESC LIMIT 5
    `);

    // 5. Penalty Stats
    const [penaltyStats] = await connection.query(`
      SELECT
        COALESCE(SUM(penalty_amount), 0) as total_penalties,
        COALESCE(SUM(CASE WHEN penalty_date = CURDATE() THEN penalty_amount ELSE 0 END), 0) as today_penalties
      FROM penalties
    `);

    // 6. Upcoming Payments (Loans due within 7 days)
    const [upcomingDues] = await connection.query(`
      SELECT
        l.loan_id,
        b.full_name,
        l.principal_amount,
        l.interest_rate,
        l.due_date,
        (l.principal_amount + (l.principal_amount * l.interest_rate / 100)) as total_due
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      WHERE l.status = 'ACTIVE'
      AND l.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      ORDER BY l.due_date ASC
      LIMIT 5
    `);

    const stats = {
      totalLoans: loanCounts[0].total_principal || 0,
      totalBorrowers: borrowerCount[0].count || 0,
      activeLoans: loanCounts[0].active_count || 0,
      closedLoans: loanCounts[0].closed_count || 0,
      // For payments, assuming total collection
      totalPayments: paymentSum[0].total || 0,
      pendingDues: loanCounts[0].total_outstanding || 0,
      monthlyInterest: loanCounts[0].monthly_interest || 0,
      totalPenalties: penaltyStats[0].total_penalties,
      todayPenalties: penaltyStats[0].today_penalties,
    };

    const upcoming = upcomingDues.map((l) => ({
      id: l.loan_id,
      name: l.full_name,
      amount: l.total_due,
      date: l.due_date,
      type: 'UPCOMING',
    }));

    const charts = {
      interestByBorrower: {
        labels: interestByBorrower.map((d) => d.name),
        data: interestByBorrower.map((d) => d.total),
      },
      paymentPerformance: {
        labels: paymentPerformance.map((d) => d.name),
        data: paymentPerformance.map((d) => d.total),
        colors: paymentPerformance.map((d) => (d.has_overdue ? '#ef4444' : '#10b981')), // Red if overdue, else Green
      },
      pie: {
        labels: ['Active', 'Closed', 'Overdue'],
        data: [
          loanCounts[0].active_count || 0,
          loanCounts[0].closed_count || 0,
          loanCounts[0].overdue_count || 0,
        ],
      },
    };

    const [recentBorrowers] = await connection.query(`
      SELECT
        b.borrower_id, b.full_name, b.created_at as date, 'BORROWER' as type,
        COALESCE(l.principal_amount, 0) as loan_amount
      FROM borrowers b
      LEFT JOIN loans l ON b.borrower_id = l.borrower_id AND l.status != 'DELETED'
      -- Get only the FIRST loan to represent registration impact
      WHERE b.status != "DISABLED"
      AND (l.loan_id = (SELECT MIN(loan_id) FROM loans WHERE borrower_id = b.borrower_id) OR l.loan_id IS NULL)
      ORDER BY b.borrower_id DESC LIMIT 5
    `);

    const [recentTopups] = await connection.query(`
      SELECT
        t.topup_id, t.topup_amount as amount, t.topup_date as date, 'TOPUP' as type,
        b.full_name, CONCAT('Top-up for ', b.full_name) as description
      FROM loan_topups t
      JOIN loans l ON t.loan_id = l.loan_id
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      ORDER BY t.topup_id DESC LIMIT 5
    `);

    const [recentPenalties] = await connection.query(`
      SELECT
        p.penalty_id, p.penalty_amount, p.penalty_date as date, p.reason,
        b.full_name, 'PENALTY' as type
      FROM penalties p
      JOIN loans l ON p.loan_id = l.loan_id
      JOIN borrowers b ON l.borrower_id = b.borrower_id
      ORDER BY p.penalty_id DESC LIMIT 5
    `);

    // ... (existing stat/upcoming queries)

    // Combine and sort activities
    const activities = [
      ...recentLoans.map((l) => ({
        id: `L-${l.loan_id}`,
        title: 'New Loan Disbursed',
        description: `Loan for ${l.full_name}`,
        amount: Number(l.principal_amount) || 0,
        time: l.date,
        type: 'LOAN',
        status: 'success',
      })),
      ...recentPayments.map((p) => ({
        id: `P-${p.payment_id}`,
        title: 'Payment Received',
        description: `Payment from ${p.full_name}`,
        amount: Number(p.payment_amount) || 0,
        time: p.date,
        type: 'PAYMENT',
        status: 'success',
      })),
      ...recentPenalties.map((p) => ({
        id: `PE-${p.penalty_id}`,
        title: 'Penalty Applied',
        description: `Penalty: ${p.reason || 'Late Fee'} (${p.full_name})`,
        amount: Number(p.penalty_amount) || 0,
        time: p.date,
        type: 'PENALTY',
        status: 'warning',
      })),
      ...recentBorrowers.map((b) => ({
        id: `B-${b.borrower_id}`,
        title: 'New Borrower Registered',
        description: `${b.full_name} joined (Loan: ₹${b.loan_amount})`,
        amount: Number(b.loan_amount) || 0,
        time: b.date,
        type: 'BORROWER',
        status: 'info',
      })),
      ...recentTopups.map((t) => ({
        id: `T-${t.topup_id}`,
        title: 'Top-up Added',
        description: t.description,
        amount: Number(t.amount) || 0,
        time: t.date,
        type: 'TOPUP',
        status: 'success',
      })),
    ]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10);

    return { stats, charts, activities, upcoming };
  } finally {
    connection.release();
  }
};

exports.getAllHistory = async (page = 1, limit = 20, search = '') => {
  const connection = await db.getConnection();
  try {
    const offset = (page - 1) * limit;
    const searchTerm = `%${search}%`;

    const [rows] = await connection.query(
      `
      SELECT * FROM (
        SELECT
          l.loan_id as id,
          l.principal_amount as amount,
          l.disbursement_date as date,
          b.full_name,
          'LOAN' as type,
          CONCAT('Loan Disbursed to ', b.full_name) as description
        FROM loans l
        JOIN borrowers b ON l.borrower_id = b.borrower_id
        WHERE l.status != 'DELETED'

        UNION ALL

        SELECT
          p.payment_id as id,
          p.payment_amount as amount,
          p.payment_date as date,
          b.full_name,
          'PAYMENT' as type,
          CONCAT('Payment (', p.payment_for, ') from ', b.full_name) as description
        FROM payments p
        JOIN loans l ON p.loan_id = l.loan_id
        JOIN borrowers b ON l.borrower_id = b.borrower_id

        UNION ALL

        SELECT
          pe.penalty_id as id,
          pe.penalty_amount as amount,
          pe.penalty_date as date,
          b.full_name,
          'PENALTY' as type,
          CONCAT('Penalty: ', pe.reason, ' (', b.full_name, ')') as description
        FROM penalties pe
        JOIN loans l ON pe.loan_id = l.loan_id
        JOIN borrowers b ON l.borrower_id = b.borrower_id

        UNION ALL

        SELECT
          t.topup_id as id,
          t.topup_amount as amount,
          t.topup_date as date,
          b.full_name,
          'TOPUP' as type,
          CONCAT('Top-up for ', b.full_name) as description
        FROM loan_topups t
        JOIN loans l ON t.loan_id = l.loan_id
        JOIN borrowers b ON b.borrower_id = l.borrower_id

        UNION ALL

        SELECT
          b.borrower_id as id,
          COALESCE((SELECT principal_amount FROM loans WHERE borrower_id = b.borrower_id ORDER BY loan_id ASC LIMIT 1), 0) as amount,
          b.created_at as date,
          b.full_name,
          'BORROWER' as type,
          CONCAT('New Borrower: ', b.full_name) as description
        FROM borrowers b
        WHERE b.status != 'DISABLED'
      ) AS combined
      WHERE full_name LIKE ? OR description LIKE ?
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `,
      [searchTerm, searchTerm, Number(limit), Number(offset)]
    );

    const [countResult] = await connection.query(
      `
      SELECT COUNT(*) as total FROM (
        SELECT b.full_name, CONCAT('Loan Disbursed to ', b.full_name) as description
        FROM loans l JOIN borrowers b ON l.borrower_id = b.borrower_id
        WHERE l.status != 'DELETED'
        UNION ALL
        SELECT b.full_name, CONCAT('Payment (', p.payment_for, ') from ', b.full_name) as description
        FROM payments p JOIN loans l ON p.loan_id = l.loan_id JOIN borrowers b ON l.borrower_id = b.borrower_id
        UNION ALL
        SELECT b.full_name, CONCAT('Penalty: ', pe.reason, ' (', b.full_name, ')') as description
        FROM penalties pe JOIN loans l ON pe.loan_id = l.loan_id JOIN borrowers b ON l.borrower_id = b.borrower_id
        UNION ALL
        SELECT b.full_name, CONCAT('Top-up for ', b.full_name) as description
        FROM loan_topups t JOIN loans l ON t.loan_id = l.loan_id JOIN borrowers b ON l.borrower_id = b.borrower_id
        UNION ALL
        SELECT full_name, CONCAT('New Borrower: ', full_name) as description
        FROM borrowers
        WHERE status != 'DISABLED'
      ) AS combined
      WHERE full_name LIKE ? OR description LIKE ?
    `,
      [searchTerm, searchTerm]
    );

    return {
      history: rows,
      total: countResult[0].total,
      page: Number(page),
      totalPages: Math.ceil(countResult[0].total / limit),
    };
  } finally {
    connection.release();
  }
};
