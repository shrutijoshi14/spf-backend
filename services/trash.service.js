const db = require('../db');

exports.getTrashItems = async () => {
  const [borrowers] = await db.query(
    'SELECT borrower_id as id, full_name, "BORROWER" as type, created_at as deleted_at FROM borrowers WHERE status = "DISABLED" ORDER BY created_at DESC'
  );

  const [loans] = await db.query(
    `SELECT l.loan_id as id, b.full_name, l.principal_amount, "LOAN" as type, l.disbursement_date as deleted_at
     FROM loans l
     JOIN borrowers b ON l.borrower_id = b.borrower_id
     WHERE l.status = "DELETED"`
  );

  return [...borrowers, ...loans];
};

exports.restoreItem = async (type, id) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (type === 'BORROWER') {
      await connection.query('UPDATE borrowers SET status = "ACTIVE" WHERE borrower_id = ?', [id]);
      // Note: We don't auto-restore loans because they might have been deleted separately.
      // User must check loans manually.
    } else if (type === 'LOAN') {
      // Check if borrower is active first
      const [loan] = await connection.query(
        'SELECT borrower_id, outstanding_amount FROM loans WHERE loan_id = ?',
        [id]
      );
      if (!loan.length) throw new Error('Loan not found');

      const borrowerId = loan[0].borrower_id;
      const [borrower] = await connection.query(
        'SELECT status FROM borrowers WHERE borrower_id = ?',
        [borrowerId]
      );

      if (borrower[0].status === 'DISABLED') {
        throw new Error(
          'Cannot restore loan because the Borrower is deleted. Restore Borrower first.'
        );
      }

      // Determine correct status based on outstanding amount
      const newStatus = loan[0].outstanding_amount <= 0 ? 'CLOSED' : 'ACTIVE';
      await connection.query('UPDATE loans SET status = ? WHERE loan_id = ?', [newStatus, id]);
    }

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};
