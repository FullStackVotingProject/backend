const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Convert pool to use promises
const promisePool = pool.promise();

// Test the connection
const testConnection = async () => {
    try {
        const [rows] = await promisePool.query('SELECT 1');
        console.log('Database connection successful');
    } catch (error) {
        console.error('Database connection failed:', error);
    }
};

testConnection();

module.exports = promisePool;
