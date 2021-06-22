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
            const [queryResult, f1] = await pool.query(dbQuery.nft_job_fetch_select.queryString);
            console.log('nft_job_fetch_select', queryResult)
            const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

            for (let record of queryResult) {
                console.log('Record to send :', record);
                var params = {
                    MessageGroupId: "NftJob",
                    MessageAttributes: { "NFT_SEQ": { DataType: "Number", StringValue: record.nft_seq.toString() } },
                    MessageBody: "",
                    QueueUrl: process.env.QUEUE_URL,
                };
                params.MessageBody = JSON.stringify(record);
                try {
                    const sqsSendMessageResult = await sqs.sendMessage(params).promise();
                    console.log('sqsSendMessageResult MessageId : ', sqsSendMessageResult.MessageId);

                    await pool.query(dbQuery.nft_job_fetch_update.queryString, [record.nft_seq]);
                }
                catch (err) {
                    console.log('sqsEndMessageResult error', err);
                }
            }
        }
        catch (err) {
            console.log(err);
        }
    }
};
