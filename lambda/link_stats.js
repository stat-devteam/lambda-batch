"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');
const psHandler = require('../modules/util_ps.js');
var Base64 = require("js-base64");

exports.handler = async function(event) {

    console.log('[EVENT]', event);

    const isMaintenance = await psHandler.getParameterStoreValue(process.env.PARAMETER_STORE_VALUE, 'batch', null);
    console.log('isMaintenance', isMaintenance)
    if (isMaintenance) {
        const message = JSON.parse(Base64.decode(isMaintenance)).message
        console.log('[Maintenance]', message)
    }
    else {
        try {
            const pool = await dbPool.getPool();
            await pool.query(dbQuery.link_stats_daily_insert.queryString);
        }
        catch (err) {
            console.log(err);
        }
    }


};
