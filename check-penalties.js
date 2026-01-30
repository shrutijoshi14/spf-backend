require('dotenv').config();
const db = require('./db');

async function checkPenalties() {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query('SHOW COLUMNS FROM penalties');
    console.log('Columns:', rows.map((r) => r.Field).join(', '));
  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    connection.release();
    process.exit();
  }
}

checkPenalties();
