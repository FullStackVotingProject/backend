const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        multipleStatements: true
    });

    try {
        // Read SQL files
        const schemaSQL = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
        const seedSQL = await fs.readFile(path.join(__dirname, 'seed.sql'), 'utf8');

        // Execute schema SQL
        console.log('Creating database and tables...');
        await connection.query(schemaSQL);

        // Execute seed SQL
        console.log('Seeding initial data...');
        await connection.query(seedSQL);

        console.log('Database initialization completed successfully!');
    } catch (error) {
        console.error('Error initializing database:', error);
    } finally {
        await connection.end();
    }
}

// Run the initialization
initializeDatabase();
