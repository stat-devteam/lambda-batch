"use strict";

var mysql = require('mysql2/promise');
var smHandler = require('./util_sm.js');

let connectionPool = null;

const initPool = async() => {

    console.log("[RDS POOL Util]", "[initPool]", 'init pool start...');

    const secretValue = await smHandler.getSecretValue(process.env.DB_SM_ID);
    console.log("[RDS POOL Util]", "[initPool]", 'get secret value...', secretValue);

    connectionPool = mysql.createPool({
        host: process.env.DB_ENDPOINT,
        user: process.env.DB_USER,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        password: secretValue.password,
        connectionLimit: 1
    });

    console.log("[RDS POOL Util]", "[initPool]", 'create pool finish...', connectionPool);

    return connectionPool;
}

const getPool = async() => {
    if (!connectionPool) {
        connectionPool = await initPool();
    }
    return connectionPool;
}

const getConnection = async() => {
    const pool = await getPool();
    return await pool.getConnection(async conn => conn);
}

module.exports = { initPool, getPool, getConnection }
