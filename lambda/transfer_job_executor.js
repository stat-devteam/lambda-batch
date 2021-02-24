"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');
var axios = require("axios").default;
const kasInfo = require('../resource/kas.json');
const smHandler = require('../modules/util_sm.js');
const awsInfo = require('../resource/aws.json');
const BigNumber = require('bignumber.js');
var moment = require('moment-timezone');
var { InsertLogSeq } = require("../modules/utils_error.js");
const { RequestServiceCallbackUrl } = require('../modules/util_callback.js');
const { DelegatedCheck } = require('../modules/util_klaytn.js');

exports.handler = async(event) => {

    const pool = await dbPool.getPool();

    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);
    console.log('secretValue', secretValue)

    console.log('Received event:', JSON.stringify(event, null, 2));
    for (const { messageId, body } of event.Records) {
        console.log('SQS message %s: %j', messageId, body);

        let data = JSON.parse(body);
        console.log('[VALUE] data', data)
        let txHash = data.tx_hash;
        let transferSeq = data.transfer_seq;
        const serviceCallbackSeq = data.svc_callback_seq || null;
        const rewardQueueSequence = data.rwd_q_seq;

        console.log('[VALUE] transferSeq : ', transferSeq);
        console.log('[VALUE] tx_hash : ', txHash);
        console.log('[VALUE] serviceCallbackSeq : ', serviceCallbackSeq);
        console.log('[VALUE] rewardQueueSequence : ', rewardQueueSequence);

        //[TASK] Update Transfer Table
        const [updateResult, f1] = await pool.query(dbQuery.transfer_update_job.queryString, ['processing', transferSeq]);

        //[TASK] CHECK TRANSACTION [KAS]
        const satusCheckUrl = kasInfo.apiUrl + 'tx/' + txHash;
        const checkHeader = {
            'Authorization': secretValue.kas_authorization,
            'Content-Type': 'application/json',
            'x-chain-id': kasInfo.xChainId,
        };

        const txStatusResult = await axios
            .get(satusCheckUrl, {
                headers: checkHeader,
            })
            .catch((err) => {
                console.log('[KAS] Check Transaction ERROR', err.response);
                return { error: err.response }
            });


        if (txStatusResult.error) {
            //[TASK] Update Transfer Table
            let code = txStatusResult.error.data.code;
            let message = txStatusResult.error.data.message;
            const [updateUnknownResult, f1] = await pool.query(dbQuery.transfer_update_tx_job.queryString, ['unknown', 'done', transferSeq]);
            console.log('[TASK - Update unkown]', updateUnknownResult);
            const logSeq = await InsertLogSeq('transfer', transferSeq, 'KAS', code, message);
            console.log('[TASK - code]', code);
            console.log('[TASK - message]', message);
            console.log('[TASK - ERRORLOG]', logSeq);

        }
        else if (txStatusResult.data && txStatusResult.data.status) {
            let txStatus = txStatusResult.data.status;
            console.log('[KAS] Check Transaction Result', txStatusResult);
            switch (txStatus) {
                case 'Committed':
                    {
                        let isDelegated = DelegatedCheck(txStatusResult.data);
                        let newFee = null;
                        if (isDelegated) {
                            newFee = 0;
                        }
                        else {
                            newFee = new BigNumber(txStatusResult.data.gasPrice * txStatusResult.data.gasUsed).toString(10);
                        }
                        //[TASK - Update Transfer Table]
                        const [updateResult, f5] = await pool.query(dbQuery.transfer_update_tx_job_fee.queryString, ['success', 'done', newFee, transferSeq]);
                        console.log('[Committed] Update Transfer Table', updateResult);
                        //[TASK - ServiceCallback]
                        if (serviceCallbackSeq) {
                            const callbackResult = await RequestServiceCallbackUrl(serviceCallbackSeq, `tansferSequence=${transferSeq}`);
                            console.log('[Committed] callbackResult', callbackResult)
                        }
                        //[TASK - Check Bulk]
                        if (rewardQueueSequence) {
                            const [rewardQueueResult, f5] = await pool.query(dbQuery.reward_get_by_seq.queryString, [rewardQueueSequence]);
                            if (rewardQueueResult.length > 0 && rewardQueueResult[0].bulk_seq) {
                                let bulkSeq = rewardQueueResult[0].bulk_seq;
                                console.log('[TASK - Check Bulk] bulkSeq', bulkSeq);
                                const [updateResult, f1] = await pool.query(dbQuery.bulk_transfer_update_success_count.queryString, [bulkSeq]);
                                console.log('[TASK - Check Bulk] result', updateResult);

                            }
                        }


                        break;
                    }
                case 'CommitError':
                    {
                        const [updateResult, f5] = await pool.query(dbQuery.transfer_update_tx_job.queryString, ['fail', 'done', transferSeq]);
                        console.log('[CommitError] updateResult', updateResult);
                        let code = txStatusResult.data.code || '';
                        let message = txStatusResult.data.message || '';
                        const logSeq = await InsertLogSeq('transfer', transferSeq, 'KAS', code, message);
                        console.log('[TASK - code]', code);
                        console.log('[TASK - message]', message);
                        console.log('[TASK - ERRORLOG]', logSeq);
                        break;
                    }
                case 'Pending':
                    {
                        const [updateResult, f5] = await pool.query(dbQuery.transfer_update_tx_job.queryString, ['pending', 'ready', transferSeq]);
                        console.log('[Pending] updateResult', updateResult);
                        console.log('[Pending] Response Data', txStatusResult.data);
                        break;
                    }
                case 'Submitted':
                    {
                        const [updateResult, f5] = await pool.query(dbQuery.transfer_update_tx_job.queryString, ['submit', 'ready', transferSeq]);
                        console.log('[Submitted] updateResult', updateResult);
                        console.log('[Submitted] Response Data', txStatusResult.data);
                        break;
                    }
                default:
                    {
                        // KAS Result Status가 비정상일 경우
                        const [updateResult, f1] = await pool.query(dbQuery.transfer_update_tx_job.queryString, ['unknown', 'done', transferSeq]);
                        console.log('[Unknown] updateResult', updateResult);
                        console.log('[Unknown] Response Data', txStatusResult.data);
                        break;
                    }
            }


        }
        else {
            // KAS Result가 비정상일 경우
            let newStatus = 'unknown';
            let job_status = 'done';
            const [updateUnknownResult, f1] = await pool.query(dbQuery.transfer_update_tx_job.queryString, [newStatus, job_status, transferSeq]);
            console.log('[KAS] Response Data Dont Exist', txStatusResult.data);
            console.log('[Unknown] updateUnknownResult', updateUnknownResult);

        }
    }

    return `Successfully processed ${event.Records.length} messages.`;
};

const checkSearchStringExist = (str) => {
    const splitStringList = str.split('?');
    if (splitStringList.length === 1) {
        return false;
    }
    else {
        return true;
    }
}
