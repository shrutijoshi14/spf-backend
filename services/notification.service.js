const db = require('../db');

exports.initNotifications = async () => {
  const connection = await db.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        title VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Notifications table initialized');
  } catch (err) {
    console.error('❌ Failed to init notifications:', err);
  } finally {
    connection.release();
  }
};

exports.getNotifications = async () => {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20'
    );
    return rows;
  } finally {
    connection.release();
  }
};

exports.markAsRead = async (id) => {
  const connection = await db.getConnection();
  try {
    await connection.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id]);
    return true;
  } finally {
    connection.release();
  }
};

exports.clearAll = async () => {
  const connection = await db.getConnection();
  try {
    await connection.query('DELETE FROM notifications');
    return true;
  } finally {
    connection.release();
  }
};

// HELPER: Create a notification internally
exports.createNotification = async ({ title, message, type, user_id }) => {
  const connection = await db.getConnection();
  try {
    await connection.query(
      'INSERT INTO notifications (title, message, type, user_id) VALUES (?, ?, ?, ?)',
      [title, message, type || 'general', user_id || null]
    );
    return true;
  } catch (err) {
    console.error('❌ Error creating notification:', err);
    return false;
  } finally {
    connection.release();
  }
};
