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
        let txHash = data.tx_hash || null;
        let transferSeq = data.transfer_seq;
        const serviceCallbackSeq = data.svc_callback_seq || null;

        if (txHash && transferSeq) {

            //processing update 처리 로직
            const initTxStatus = 'submit';
            const initJobStatus = 'processing';


            const [transferProcessingResult, f1] = await pool.query(dbQuery.transfer_status_update.queryString, [initTxStatus, initJobStatus, transferSeq]);
            console.log('transferProcessingResult', transferProcessingResult)

            // polling tx status check
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
                    console.log('txStatusResult err', err);
                    return { error: err.response }
                });

            let newFee = null;
            console.log('txStatusResult', txStatusResult)
            if (txStatusResult.data && txStatusResult.data.status) {
                let newStatus = 'success';
                let job_status = 'done';

                // fee setup
                if (txStatusResult.data.status === 'Committed') {
                    let isDelegated = DelegatedCheck(txStatusResult.data);
                    console.log('isDelegated', isDelegated)
                    if (isDelegated) {
                        newFee = 0;
                    }
                    else {
                        newFee = new BigNumber(txStatusResult.data.gasPrice * txStatusResult.data.gasUsed).toString(10);
                    }
                }
                else if (txStatusResult.data.status === 'Submitted') {
                    newStatus = 'submit';
                    job_status = 'ready';

                }
                else if (txStatusResult.data.status === 'Pending') {
                    newStatus = 'pending';
                    job_status = 'ready';
                }
                else if (txStatusResult.data.status === 'CommitError') {
                    newStatus = 'fail';

                }
                else {
                    newStatus = 'unknown';
                    console.log('else txStatusResult status', txStatusResult.data.status);
                }


                console.log('newStatus', newStatus)
                console.log('job_status', job_status)
                const completeDate = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');


                const [statusSuccessResult, f2] = await pool.query(dbQuery.transfer_status_fee_update.queryString, [newStatus, completeDate, job_status, newFee, transferSeq]);

                if (txStatusResult.data.status === 'Committed' && Number.isInteger(serviceCallbackSeq)) {
                    //callback 있는 경우 리퀘스트 해줘야 한다.
                    const callbackResult = await RequestServiceCallbackUrl(serviceCallbackSeq, `tansferSequence=${transferSeq}`);
                    console.log('callbackResult', callbackResult)
                }

            }
            else if (txStatusResult.error) {
                console.log('error txStatusResult', txStatusResult.error)
                let code = txStatusResult.error.data.code;
                let message = txStatusResult.error.data.message;
                let newStatus = 'fail';
                let job_status = 'done';

                console.log('newStatus', newStatus)
                console.log('job_status', job_status)
                const completeDate = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');

                const [statusFailResult, f3] = await pool.query(dbQuery.transfer_status_fee_update.queryString, [newStatus, completeDate, job_status, newFee, transferSeq]);

                console.log('statusFailResult', statusFailResult)

                const logSeq = await InsertLogSeq('transfer', transferSeq, 'KAS', code, message);
                console.log('logSeq', logSeq);

            }
            else {
                //일어나면 안되지만 일어날 경우, ready로 셋팅해서 다시 fetch를 수행한다.
                console.log('txStatusResult no data stats', txStatusResult)
                let job_status = 'ready';
                let job_fetched_dt = null;
                const [statusRetryResult, f3] = await pool.query(dbQuery.transfer_job_status_retry_update.queryString, [job_status, job_fetched_dt, transferSeq]);
                console.log('statusRetryResult', statusRetryResult)
            }

        }
        else {
            //트랜잭션 해쉬가 없기 때문에, 애초에 수행할 수 없었던 요청.
            let newStatus = 'fail';
            let job_status = 'done';
            const completeDate = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
            const newFee = 0;
            const [statusFailResult, f3] = await pool.query(dbQuery.transfer_status_fee_update.queryString, [newStatus, completeDate, job_status, newFee, transferSeq]);
            console.log('not exist txHash', statusFailResult)
            const logSeq = await InsertLogSeq('transfer', transferSeq, 'KAS', 10101, 'transfer row dont exist txHash');
            console.log('not exist txHash logSeq', logSeq)
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
