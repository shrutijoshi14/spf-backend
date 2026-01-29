const db = require('../db');
const notificationService = require('./notification.service');

exports.getAll = async () => {
  const [rows] = await db.query(`
    SELECT
      b.*,
      g.name AS guarantor_name,
      g.mobile AS guarantor_phone,
      g.address AS guarantor_address
    FROM borrowers b
    LEFT JOIN guarantors g ON b.borrower_id = g.borrower_id
    WHERE b.status != "DISABLED"
    ORDER BY b.borrower_id DESC
  `);
  return rows;
};

exports.createBorrower = async (data) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Check for existing borrower with same mobile or email (if email is provided)
    let checkQuery = 'SELECT borrower_id FROM borrowers WHERE mobile = ?';
    const checkParams = [data.mobile];

    if (data.email && data.email.trim() !== '') {
      checkQuery += ' OR email = ?';
      checkParams.push(data.email);
    }

    const [existing] = await connection.query(checkQuery, checkParams);

    if (existing.length > 0) {
      throw new Error('Borrower already exists with this mobile or email');
    }

    const [result] = await connection.query(
      `INSERT INTO borrowers
       (full_name, mobile, alternate_mobile, email,
        address_line1, address_line2, city, state, pincode,
        relative_name, relative_phone, relation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.full_name,
        data.mobile,
        data.alternate_mobile || null,
        data.email || null,
        data.address_line1 || null,
        data.address_line2 || null,
        data.city || null,
        data.state || null,
        data.pincode || null,
        data.relatives_name || null,
        data.relatives_phone || null,
        data.relation || null,
      ]
    );

    const borrowerId = result.insertId;

    if (data.guarantor_name) {
      // ✅ Using ON DUPLICATE KEY UPDATE for safety against orphan records
      await connection.query(
        `INSERT INTO guarantors (borrower_id, name, mobile, address, relation)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         mobile = VALUES(mobile),
         address = VALUES(address),
         relation = VALUES(relation)`,
        [
          borrowerId,
          data.guarantor_name,
          data.guarantor_phone || null,
          data.guarantor_address || null,
          data.guarantor_relation || data.relation || null,
        ]
      );
    }

    await connection.commit();

    // 🔔 Notify
    await notificationService.createNotification({
      title: 'New Member Added',
      message: `${data.full_name} has been added as a borrower.`,
      type: 'borrower',
    });

    return { borrowerId };
  } catch (error) {
    await connection.rollback();
    console.error('❌ Create Borrower Transaction Failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
};

exports.update = async (id, data) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Separate borrower fields from guarantor fields
    const borrowerFields = {
      full_name: data.full_name,
      mobile: data.mobile,
      alternate_mobile: data.alternate_mobile,
      email: data.email,
      address_line1: data.address_line1,
      address_line2: data.address_line2,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      relative_name: data.relative_name,
      relative_phone: data.relative_phone,
      relation: data.relation,
    };

    // Remove undefined fields
    Object.keys(borrowerFields).forEach(
      (key) => borrowerFields[key] === undefined && delete borrowerFields[key]
    );

    // 2. Update borrowers table
    if (Object.keys(borrowerFields).length > 0) {
      await connection.query('UPDATE borrowers SET ? WHERE borrower_id = ?', [borrowerFields, id]);
    }

    // 3. Update or Insert guarantor table
    if (data.guarantor_name) {
      await connection.query(
        `INSERT INTO guarantors (borrower_id, name, mobile, address, relation)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         mobile = VALUES(mobile),
         address = VALUES(address),
         relation = VALUES(relation)`,
        [
          id,
          data.guarantor_name,
          data.guarantor_phone || null,
          data.guarantor_address || null,
          data.guarantor_relation || data.relation || null,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('❌ Update Borrower Transaction Failed:', error.message);
    throw error;
  } finally {
    connection.release();
  }
};

exports.remove = async (id) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get associated Loan IDs
    const [loans] = await connection.query('SELECT loan_id FROM loans WHERE borrower_id = ?', [id]);
    const loanIds = loans.map((l) => l.loan_id);

    // Soft Delete: Disable borrower and mark loans as DELETED

    if (loanIds.length > 0) {
      // Mark associated loans as DELETED
      await connection.query('UPDATE loans SET status = "DELETED" WHERE borrower_id = ?', [id]);
      // Note: We are keeping the payments/topups/penalties as is for history,
      // but since the loan is deleted, they won't show up in standard views.
    }

    // 4. Soft Delete (Disable) Borrower
    // Disable Borrower

    await connection.query('UPDATE borrowers SET status = "DISABLED" WHERE borrower_id = ?', [id]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.getAllBorrowers = async () => {
  try {
    const sql = `
      SELECT
        b.*,
        g.name AS guarantor_name,
        g.mobile AS guarantor_phone,
        g.address AS guarantor_address
      FROM borrowers b
      LEFT JOIN guarantors g ON b.borrower_id = g.borrower_id
      ORDER BY b.borrower_id DESC
    `;
    const [results] = await db.query(sql);
    return results;
  } catch (err) {
    console.error('❌ DB Error:', err);
    throw err;
  }
};
