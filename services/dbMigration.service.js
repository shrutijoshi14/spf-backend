const db = require('../db');

/**
 * Handles database schema updates automatically on startup.
 * This ensures the Live Database stays in sync with the code
 * without needing manual SQL execution from a local machine.
 */
exports.runMigrations = async () => {
  console.log('🔄 Checking Database Schema...');
  const connection = await db.getConnection();
  try {
    // 1. Check/Add 'is_notification_sent' to 'penalties' table
    const [columns] = await connection.query(
      'SHOW COLUMNS FROM penalties LIKE "is_notification_sent"'
    );

    if (columns.length === 0) {
      console.log('➕ Column missing. Adding "is_notification_sent" to penalties...');
      await connection.query(
        'ALTER TABLE penalties ADD COLUMN is_notification_sent BOOLEAN DEFAULT FALSE'
      );
      console.log('✅ Schema Updated: "is_notification_sent" added.');
    } else {
      console.log('✅ Schema Verified: "penalties" table up to date.');
    }

    return { success: true };
  } catch (err) {
    console.error('❌ Migration Failed:', err.message);
    // Don't throw, just log. We don't want to crash the whole server if DB is busy.
  } finally {
    connection.release();
  }
};
