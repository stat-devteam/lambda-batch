"use strict";

var AWS = require('aws-sdk');
const dbHandler = require('../modules/util_rds.js');
const dbQuery = require('../resource/sql.json');


exports.handler = async function(event) {

    const connection = await dbHandler.connectRDS(process.env.DB_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
    console.log('connection', connection);

    let queryResult = await new Promise((resolve, reject) => {
        connection.query(
            dbQuery.transfer_job_fetch_select.queryString,
            function(error, results, fields) {
                if (error) throw error;

                let records = [];
                for (let row of results) {
                    records.push({
                        "transfer_seq": row.transfer_seq,
                        "type": row.type,
                        "svc_num": row.svc_num,
                        "link_num": row.link_num,
                        "amount": row.amount,
                        "fee": row.fee,
                        "transfer_reg_dt": row.transfer_reg_dt,
                        "transfer_end_dt": row.transfer_end_dt,
                        "tx_hash": row.tx_hash,
                        "tx_status": row.tx_status,
                        "job_status": row.job_status,
                        "job_fetched_dt": row.job_fetched_dt,
                        "svc_callback_seq": row.svc_callback_seq,
                        "svc_memo_seq": row.svc_memo_seq,
                        "link_accnt_before_balance": row.link_accnt_before_balance
                    });
                }
                resolve(
                    records
                );
            }
        );
    }).catch((error) => {
        console.log("[Error] transfer_job_fetch_select", error);
        return JSON.stringify(error);
    });
    console.log("query result = ", queryResult);

    // Create an SQS service object
    var sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
    console.log('process.env.QUEUE_URL', process.env.QUEUE_URL)
    for (var record of queryResult) {
        var params = {
            MessageGroupId: "TransferJob",
            MessageAttributes: { "TRANSFER_SEQ": { DataType: "Number", StringValue: record.transfer_seq.toString() } },
            MessageBody: "",
            QueueUrl: process.env.QUEUE_URL,
        };

        console.log("transfer_seq1 : ", record.transfer_seq);
        params.MessageBody = JSON.stringify(record);


        const sqsSendMessageResult = await sqs.sendMessage(params).promise().catch(err => {
            console.log('sqsEndMessageResult error', err)
        });

        console.log('sqsSendMessageResult MessageId : ', sqsSendMessageResult.MessageId)

        var statusUpdateResult = await new Promise((resolve, reject) => {
            connection.query(dbQuery.transfer_job_fetch_update.queryString, [record.transfer_seq], function(error, results, fields) {
                if (error) throw error;
                console.log('statusUpdateResult results', results);

                resolve(results);
            });
        }).catch((error) => {
            return JSON.stringify(error);
        });
        console.log('end for record')
        // await sqs.sendMessage(params, async function(err, data) {
        //     console.log("transfer_seq2 : ", record.transfer_seq);
        //     if (err) {
        //         console.log("[Error] SQS Message Send", err);
        //     }
        //     else {
        //         console.log("SQS Message Send Success", data.MessageId);

        //         await new Promise((resolve, reject) => {
        //             connection.query(dbQuery.transfer_job_fetch_update.queryString, record.transfer_seq);
        //         }).catch((err) => {
        //             console.log("[Error] reward - update job_status to fetched", err);
        //         });
        //         console.log('query end')

        //     }
        // }).promise();
    }
};
