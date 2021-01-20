"use strict";

var AWS = require('aws-sdk');
const dbHandler = require('../modules/util_rds.js');
const dbQuery = require('../resource/sql.json');


exports.handler = async function(event) {

    const connection = await dbHandler.connectRDS(process.env.DB_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
    console.log('connection', connection);

    await new Promise((resolve, reject) => {
        connection.query(dbQuery.templink_clean_delete.queryString);
    }).catch((err) => {
        console.log("[Error] templink_clean_delete", err);
        return JSON.stringify(err);
    });
}
