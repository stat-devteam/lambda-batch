"use strict";

var AWS = require('aws-sdk');
const dbHandler = require('../modules/util_rds.js');
const dbQuery = require('../resource/sql.json');


exports.handler = async function(event) {

    const connection = await dbHandler.connectRDS(process.env.DB_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
    console.log('connection', connection);


    let queryResult = await new Promise((resolve, reject) => {
        connection.query(
            dbQuery.reward_job_fetch_select.queryString,
            function(error, results, fields) {
                if (error) throw error;
                console.log('results', results)
                let records = [];
                for (let row of results) {
                    if (row.link_num != null && row.klip_address != null) {
                        records.push({
                            "rwd_q_seq": row.rwd_q_seq,
                            "svc_num": row.svc_num,
                            "mbr_grp_id": row.mbr_grp_id,
                            "mbr_id": row.mbr_id,
                            "amount": row.amount,
                            "reg_dt": row.reg_dt,
                            "reserve_dt": row.reserve_dt,
                            "expire_dt": row.expire_dt,
                            "job_status": row.job_status,
                            "job_fetched_dt": row.job_fetched_dt,
                            "svc_callback_seq": row.svc_callback_seq,
                            "svc_memo_seq": row.svc_memo_seq,
                            "link_num": row.link_num,
                            "klip_address": row.klip_address
                        });
                    }
                }
                resolve(
                    records
                );
            }
        );
    }).catch((error) => {
        console.log("[Error] reward_job_fetch_select", error);
        return JSON.stringify(error);
    });
    console.log("queryResult = ", queryResult);

    // Create an SQS service object
    var sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

    for (var record of queryResult) {
        console.log('record send SQS from reward job fetcher')
        var params = {
            MessageGroupId: "RewardJob",
            MessageAttributes: { "REWARD_Q_SEQ": { DataType: "Number", StringValue: record.rwd_q_seq.toString() } },
            MessageBody: "",
            QueueUrl: process.env.QUEUE_URL,
        };

        params.MessageBody = JSON.stringify(record);

        const sqsSendMessageResult = await sqs.sendMessage(params).promise().catch(err => {
            console.log('sqsEndMessageResult error', err)
        });

        console.log('sqsSendMessageResult MessageId : ', sqsSendMessageResult.MessageId)

        var statusUpdateResult = await new Promise((resolve, reject) => {
            connection.query(dbQuery.reward_job_fetch_update.queryString, [record.rwd_q_seq], function(error, results, fields) {
                if (error) throw error;
                console.log('statusUpdateResult results', results);

                resolve(results);
            });
        }).catch((error) => {
            return JSON.stringify(error);
        });
        console.log('end for record')
    }
};
