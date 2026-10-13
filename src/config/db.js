
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testConnection() {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query(
      "SELECT DATABASE() AS db, VERSION() AS version"
    );
    console.log("MySQL connected:", rows[0]);
  } finally {
    connection.release();
  }
}

module.exports = { pool, testConnection };
