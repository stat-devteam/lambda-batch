"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');
const psHandler = require('../modules/util_ps.js');
var Base64 = require("js-base64");

exports.handler = async function(event) {

    console.log('[EVENT - link_cancel_cleaner]', event);

    const isMaintenance = await psHandler.getParameterStoreValue(process.env.PARAMETER_STORE_VALUE, 'batch', null);
    console.log('isMaintenance', isMaintenance)
    if (isMaintenance) {
        const message = JSON.parse(Base64.decode(isMaintenance)).message
        console.log('[Maintenance]', message)
    }
    else {
        try {
            const pool = await dbPool.getPool();
            const [linkCancelDelete, f1] = await pool.query(dbQuery.link_cancel_delete.queryString);
            console.log('linkCancelDelete', linkCancelDelete);
        }
        catch (err) {
            console.log(err);
        }
    }
};
