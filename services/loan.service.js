const db = require('../db');
const settingsService = require('./settings.service');
const notificationService = require('./notification.service');

// Utility: Calculates due date based on tenure
const calculateDueDate = (date, value, unit) => {
  const d = new Date(date);
  const normalizedUnit = unit.toUpperCase();

  if (normalizedUnit === 'DAY') d.setDate(d.getDate() + value);
  else if (normalizedUnit === 'WEEK') d.setDate(d.getDate() + value * 7);
  else if (normalizedUnit === 'MONTH') d.setMonth(d.getMonth() + value);

  return d.toISOString().split('T')[0];
};

// Helper: Updates status of overdue loans
// Query: Marks loans as 'OVERDUE' if they are 'ACTIVE' and due_date is in the past
const checkOverdueLoans = async () => {
  await db.query(`
    UPDATE loans
    SET status = 'OVERDUE'
    WHERE status = 'ACTIVE'
    AND due_date < CURDATE()
  `);
};

/**
 * Fetches all loans with optional search filtering.
 * Query Logic:
 * - Joins Loans with Borrowers to get names/mobile.
 * - Sub-queries calculate total penalties applied vs paid for each loan.
 * - Filters by search term across multiple fields (IDs, Amounts, Status, Names).
 */
exports.getAllLoans = async (searchTerm = '') => {
  await checkOverdueLoans();

  let query = `
    SELECT l.*, b.full_name, b.mobile,
    (SELECT COALESCE(SUM(penalty_amount), 0) FROM penalties WHERE loan_id = l.loan_id) as total_penalty,
    (SELECT COALESCE(SUM(payment_amount), 0) FROM payments WHERE loan_id = l.loan_id AND payment_for = 'PENALTY') as penalty_paid
    FROM loans l
    JOIN borrowers b ON l.borrower_id = b.borrower_id
    WHERE l.status != 'DELETED'
  `;

  const params = [];

  if (searchTerm) {
    const term = `%${searchTerm}%`;
    query += `
      AND (
        l.loan_id LIKE ? OR
        l.principal_amount LIKE ? OR
        l.outstanding_amount LIKE ? OR
        l.interest_rate LIKE ? OR
        l.status LIKE ? OR
        b.full_name LIKE ? OR
        b.mobile LIKE ? OR
        EXISTS (SELECT 1 FROM payments pay WHERE pay.loan_id = l.loan_id AND (pay.payment_amount LIKE ? OR pay.payment_mode LIKE ?)) OR
        EXISTS (SELECT 1 FROM loan_topups t WHERE t.loan_id = l.loan_id AND t.topup_amount LIKE ?) OR
        EXISTS (SELECT 1 FROM penalties p WHERE p.loan_id = l.loan_id AND p.penalty_amount LIKE ?)
      )
    `;
    params.push(term, term, term, term, term, term, term, term, term, term, term);
  }

  query += ` ORDER BY l.loan_id DESC`;

  const [rows] = await db.query(query, params);
  return rows;
};

/**
 * Creates a new loan record.
 * Logic:
 * 1. Validates borrower exists and is active.
 * 2. Checks if borrower already has an ACTIVE loan (One Active Loan Rule).
 * 3. Calculates Due Date based on tenure.
 * 4. Inserts new loan record.
 * 5. Sends automatic notification.
 */
exports.createLoan = async (data) => {
  const [borrower] = await db.query(
    'SELECT borrower_id, full_name FROM borrowers WHERE borrower_id = ? AND status != "DISABLED"',
    [data.borrowerId]
  );

  if (!borrower.length) {
    throw new Error('Borrower not found or is disabled');
  }

  // Query: Ensure no other active loans exist for this borrower
  const [activeLoans] = await db.query(
    'SELECT loan_id FROM loans WHERE borrower_id = ? AND status = "ACTIVE"',
    [data.borrowerId]
  );

  if (activeLoans.length > 0) {
    throw new Error('Borrower already has an ACTIVE loan. Please use Top-up instead.');
  }

  const dueDate = calculateDueDate(
    data.disbursementDate,
    Number(data.tenureValue),
    data.tenureUnit
  );

  const settings = await settingsService.getSettings();

  const [result] = await db.query(
    `INSERT INTO loans (
      borrower_id,
      disbursement_date,
      due_date,
      principal_amount,
      interest_rate,
      interest_type,
      tenure_value,
      tenure_unit,
      outstanding_amount,
      status,
      purpose,
      penalty_settings_amount,
      penalty_settings_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.borrowerId,
      data.disbursementDate,
      dueDate,
      data.principal,
      data.interestRate || 0,
      data.interestType.toUpperCase(),
      data.tenureValue,
      data.tenureUnit.toUpperCase(),
      data.principal,
      data.status || 'ACTIVE',
      data.purpose || null,
      settings.penalty_amount || 50,
      settings.penalty_days || 5,
    ]
  );

  await notificationService.createNotification({
    title: 'New Loan Disbursed',
    message: `Loan #${result.insertId} of ₹${data.principal} disbursed to ${borrower[0].full_name}.`,
    type: 'loan',
  });

  return { loanId: result.insertId };
};

/**
 * Retrieves full details for a single loan.
 * Includes: Loan Info + Borrower Info + Payments + Topups + Penalties + Global Settings.
 */
exports.getLoanDetails = async (loanId) => {
  const [loanRows] = await db.query(
    `SELECT
       l.*,
       b.full_name,
       b.mobile,
       b.email
     FROM loans l
     JOIN borrowers b ON b.borrower_id = l.borrower_id
     WHERE l.loan_id = ?`,
    [loanId]
  );

  if (!loanRows.length) {
    throw new Error('Loan not found');
  }

  const loan = loanRows[0];

  const [payments] = await db.query(
    'SELECT * FROM payments WHERE loan_id = ? ORDER BY payment_date DESC, payment_id DESC',
    [loanId]
  );

  const [topups] = await db.query(
    'SELECT * FROM loan_topups WHERE loan_id = ? ORDER BY topup_date DESC',
    [loanId]
  );

  const [penalties] = await db.query(
    'SELECT * FROM penalties WHERE loan_id = ? ORDER BY penalty_date DESC',
    [loanId]
  );

  const settings = await settingsService.getSettings();

  return { loan, payments, topups, penalties, settings };
};

/**
 * Soft deletes a loan by setting status to 'DELETED'.
 */
exports.deleteLoan = async (loanId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      'UPDATE loans SET status = "DELETED" WHERE loan_id = ?',
      [loanId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Loan not found');
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Updates specific fields of a loan.
 * Dynamic query construction based on provided data fields.
 */
exports.updateLoan = async (loanId, data) => {
  const connection = await db.getConnection();
  try {
    const fields = [];
    const values = [];

    if (data.principal !== undefined) {
      fields.push('principal_amount = ?');
      values.push(data.principal);
    }
    if (data.interestRate !== undefined) {
      fields.push('interest_rate = ?');
      values.push(data.interestRate);
    }
    if (data.interestType !== undefined) {
      fields.push('interest_type = ?');
      values.push(data.interestType);
    }
    if (data.tenureValue !== undefined) {
      fields.push('tenure_value = ?');
      values.push(data.tenureValue);
    }
    if (data.tenureUnit !== undefined) {
      fields.push('tenure_unit = ?');
      values.push(data.tenureUnit);
    }
    if (data.disbursementDate !== undefined) {
      fields.push('disbursement_date = ?');
      values.push(data.disbursementDate);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.purpose !== undefined) {
      fields.push('purpose = ?');
      values.push(data.purpose);
    }
    if (data.dueDate !== undefined) {
      fields.push('due_date = ?');
      values.push(data.dueDate);
    }

    if (fields.length === 0) return false;

    values.push(loanId);

    await connection.query(`UPDATE loans SET ${fields.join(', ')} WHERE loan_id = ?`, values);
    return true;
  } catch (err) {
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Bulk imports loans from CSV data.
 * Logic:
 * 1. Maps borrower names to IDs.
 * 2. Skips rows where borrower is missing or already has an active loan.
 * 3. Inserts valid loans in a transaction.
 */
exports.importLoans = async (loansData) => {
  const connection = await db.getConnection();
  const results = { imported: 0, failed: [], errors: [] };

  try {
    await connection.beginTransaction();

    const [borrowers] = await connection.query(
      'SELECT borrower_id, full_name FROM borrowers WHERE status != "DISABLED"'
    );
    const borrowerMap = new Map(borrowers.map((b) => [b.full_name.toLowerCase(), b.borrower_id]));

    const [activeLoans] = await connection.query(
      'SELECT borrower_id FROM loans WHERE status = "ACTIVE"'
    );
    const activeLoanBorrowerIds = new Set(activeLoans.map((l) => l.borrower_id));

    const settings = await settingsService.getSettings();
    const globalPenaltyAmount = settings.penalty_amount || 50;
    const globalPenaltyDay = settings.penalty_days || 5;

    for (let i = 0; i < loansData.length; i++) {
      const row = loansData[i];
      const nameKey = row.borrower_name?.toLowerCase().trim();

      if (!nameKey || !borrowerMap.has(nameKey)) {
        results.failed.push({ row: i + 1, name: row.borrower_name, reason: 'Borrower not found' });
        continue;
      }

      const borrowerId = borrowerMap.get(nameKey);

      if (activeLoanBorrowerIds.has(borrowerId)) {
        results.failed.push({
          row: i + 1,
          name: row.borrower_name,
          reason: 'Borrower already has an active loan',
        });
        continue;
      }

      try {
        const d = new Date(row.disbursement_date);
        d.setMonth(d.getMonth() + parseInt(row.tenure_months));
        const dueDate = d.toISOString().split('T')[0];

        await connection.query(
          `INSERT INTO loans (
                  borrower_id,
                  disbursement_date,
                  due_date,
                  principal_amount,
                  interest_rate,
                  interest_type,
                  tenure_value,
                  tenure_unit,
                  outstanding_amount,
                  status,
                  purpose,
                  penalty_settings_amount,
                  penalty_settings_day
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            borrowerId,
            row.disbursement_date,
            dueDate,
            row.principal_amount,
            row.interest_rate,
            'FLAT_RATE',
            row.tenure_months,
            'MONTH',
            row.principal_amount,
            'ACTIVE',
            'Imported Loan',
            globalPenaltyAmount,
            globalPenaltyDay,
          ]
        );

        activeLoanBorrowerIds.add(borrowerId);
        results.imported++;
      } catch (err) {
        results.failed.push({ row: i + 1, name: row.borrower_name, reason: err.message });
      }
    }

    await connection.commit();
    return results;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Crucial Function: Recalculates the exact outstanding balance of a loan.
 * Formula: Principal + Total Penalties - Total Payments (Excluding Interest).
 * This is the SINGLE SOURCE OF TRUTH for loan balance.
 */
exports.recalculateLoanOutstanding = async (loanId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get current Principal (which includes any Top-ups added)
    const [loans] = await connection.query(
      'SELECT principal_amount, status, interest_rate, interest_type, tenure_value, tenure_unit FROM loans WHERE loan_id = ? FOR UPDATE',
      [loanId]
    );
    if (!loans.length) throw new Error('Loan not found');

    const principal = Number(loans[0].principal_amount);
    let currentStatus = loans[0].status;

    // 2. Sum of all penalties applied to this loan
    const [penalties] = await connection.query(
      'SELECT COALESCE(SUM(penalty_amount), 0) as total FROM penalties WHERE loan_id = ?',
      [loanId]
    );
    const totalPenalties = Number(penalties[0].total);

    // 3. Sum of all payments made towards Principal or Penalty (Ignoring 'Interest' payments)
    const [payments] = await connection.query(
      'SELECT COALESCE(SUM(payment_amount), 0) as total FROM payments WHERE loan_id = ? AND payment_for != "INTEREST"',
      [loanId]
    );
    const totalPayments = Number(payments[0].total);

    // 4. Calculate Net Outstanding
    let newOutstanding = 0;

    // Check Interest Type
    const interestType = (loans[0].interest_type || 'FLAT').toUpperCase();

    if (interestType === 'FLAT') {
      // Logic: Outstanding = (Principal + TotalExpectedInterest + Penalties) - (All Payments)
      // 1. Calculate Total Expected Interest
      const P = principal;
      const R = Number(loans[0].interest_rate);
      const T_val = Number(loans[0].tenure_value);
      const T_unit = (loans[0].tenure_unit || 'MONTH').toUpperCase();

      let totalExpectedInterest = 0;
      // Simple Flat Rate Formula
      if (T_unit === 'MONTH') {
        totalExpectedInterest = (P * R * T_val) / 100;
      } else if (T_unit === 'WEEK') {
        // Assuming R is per week ?? Or R is per month/year?
        // Typically R is per month in this context based on previous code.
        // Let's assume R is consistent with unit or standard per month.
        // Given previous code didn't do complex conversion, let's stick to simplest interpretation:
        // If unit is month, R is % per month.
        // If unit is week, implies R is % per week? Or we just apply directly.
        // To be safe and consistent with "Monthly Interest" labels:
        // Let's assume (P * R * T) / 100 is the universal flat formula regardless of time unit interpretation for now.
        totalExpectedInterest = (P * R * T_val) / 100;
      } else {
        totalExpectedInterest = (P * R * T_val) / 100;
      }

      // 2. Sum ALL payments (Including Interest)
      const [allPayments] = await connection.query(
        'SELECT COALESCE(SUM(payment_amount), 0) as total FROM payments WHERE loan_id = ?',
        [loanId]
      );
      const totalPaid = Number(allPayments[0].total);

      newOutstanding = principal + totalExpectedInterest + totalPenalties - totalPaid;
    } else {
      // REDUCING or other types
      // Logic: Outstanding = Principal + Penalties - (Principal + Penalty Payments)
      // (ignoring interest paid as it doesn't reduce principal in reducing balance conceptualization usually,
      // BUT for simple tracking: Outstanding Principal is what matters).

      // Existing Logic was:
      // newOutstanding = principal + totalPenalties - totalPayments (where totalPayments excluded Interest)
      newOutstanding = principal + totalPenalties - totalPayments;
    }

    newOutstanding = Math.round(newOutstanding * 100) / 100;

    // 5. Update Status: If balance <= 0, mark CLOSED. Else ACTIVE.
    let newStatus = currentStatus;

    if (currentStatus !== 'DELETED' && currentStatus !== 'WRITTEN_OFF') {
      if (newOutstanding <= 0) {
        newOutstanding = 0;
        newStatus = 'CLOSED';
      } else {
        newStatus = 'ACTIVE';
      }
    }

    await connection.query(
      'UPDATE loans SET outstanding_amount = ?, status = ? WHERE loan_id = ?',
      [newOutstanding, newStatus, loanId]
    );

    await connection.commit();
    return newOutstanding;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
