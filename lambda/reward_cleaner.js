"use strict";

var AWS = require('aws-sdk');
const dbHandler = require('../modules/util_rds.js');
const dbQuery = require('../resource/sql.json');


exports.handler = async function(event) {

    const connection = await dbHandler.connectRDS(process.env.DB_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
    console.log('connection', connection);

    await new Promise((resolve, reject) => {
        connection.query(dbQuery.reward_queue_expired_clean_update.queryString);
    }).catch((err) => {
        console.log("[Error] reward_queue_expired_clean_update", err);
        return JSON.stringify(err);
    });

    await new Promise((resolve, reject) => {
        connection.query(dbQuery.reward_queue_fetched_clean_update.queryString);
    }).catch((err) => {
        console.log("[Error] reward_queue_fetched_clean_update", err);
        return JSON.stringify(err);
    });
}
