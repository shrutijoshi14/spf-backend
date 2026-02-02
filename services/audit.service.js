const db = require('../db');

exports.initAuditLogTable = async () => {
  const connection = await db.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id INT,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Audit Log table initialized');
  } catch (err) {
    console.error('❌ Failed to init audit logs:', err);
  } finally {
    connection.release();
  }
};

exports.createAuditLog = async ({ action, userId, details }) => {
  try {
    const detailStr = typeof details === 'object' ? JSON.stringify(details) : details;
    await db.query('INSERT INTO audit_logs (action, user_id, details) VALUES (?, ?, ?)', [
      action,
      userId || null,
      detailStr,
    ]);
  } catch (err) {
    console.error('⚠️ Failed to create audit log:', err.message);
  }
};

exports.getAuditLogs = async (limit = 100) => {
  const [rows] = await db.query(
    `SELECT a.*, u.full_name
     FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.user_id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
};
