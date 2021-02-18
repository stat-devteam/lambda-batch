"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');


exports.handler = async function(event) {
    try {
        const pool = await dbPool.getPool();
        await pool.query(dbQuery.transfer_fetched_clean_update.queryString);
    }
    catch (err) {
        console.log(err);
    }
};
