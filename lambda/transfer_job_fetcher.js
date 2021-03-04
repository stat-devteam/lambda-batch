"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');


exports.handler = async function(event) {

    try {

        const pool = await dbPool.getPool();
        const [queryResult, f1] = await pool.query(dbQuery.transfer_job_fetch_select.queryString);

        const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

        for (let record of queryResult) {
            console.log('Record to send :', record);
            var params = {
                MessageGroupId: "TransferJob",
                MessageAttributes: { "TRANSFER_SEQ": { DataType: "Number", StringValue: record.transfer_seq.toString() } },
                MessageBody: "",
                QueueUrl: process.env.QUEUE_URL,
            };
            params.MessageBody = JSON.stringify(record);
            try {
                const sqsSendMessageResult = await sqs.sendMessage(params).promise();
                console.log('sqsSendMessageResult MessageId : ', sqsSendMessageResult.MessageId);

                await pool.query(dbQuery.transfer_job_fetch_update.queryString, [record.transfer_seq]);
            }
            catch (err) {
                console.log('sqsEndMessageResult error', err);
            }
        }
    }
    catch (err) {
        console.log(err);
    }
};
