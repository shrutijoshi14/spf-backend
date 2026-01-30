const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

const db = mysql
  .createPool({
    host: process.env.DB_HOST || process.env.MYSQL_ADDON_HOST,
    user: process.env.DB_USER || process.env.MYSQL_ADDON_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.DB_NAME || process.env.MYSQL_ADDON_DB,
    port: process.env.DB_PORT || process.env.MYSQL_ADDON_PORT || 3306,
    waitForConnections: true,
    connectionLimit: process.env.NODE_ENV === 'production' ? 1 : 10, // Keep 1 for Live to respect DB limits
    queueLimit: 0,
  })
  .promise(); // ✅ Use Promise API

db.getConnection()
  .then(() => console.log('✅ Connected to MySQL database'))
  .catch((err) => console.error('❌ MySQL connection failed:', err.message));

module.exports = db;
