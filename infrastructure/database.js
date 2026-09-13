const mysql = require('mysql2/promise');
const config = require('../configs');

const pool = mysql.createPool(config.db);

pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
});

module.exports = pool;
