const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

// Create a connection pool instead of a single connection for better performance
const db = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
  .promise(); // ✅ Use Promise API

db.getConnection()
  .then(() => console.log('✅ Connected to MySQL database'))
  .catch((err) => console.error('❌ MySQL connection failed:', err.message));

module.exports = db;
