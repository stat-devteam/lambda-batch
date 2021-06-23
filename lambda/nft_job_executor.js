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
const psHandler = require('../modules/util_ps.js');
var Base64 = require("js-base64");

exports.handler = async(event) => {
    console.log('[EVENT]', event);

    const isMaintenance = await psHandler.getParameterStoreValue(process.env.PARAMETER_STORE_VALUE, 'batch', null);
    console.log('isMaintenance', isMaintenance)
    if (isMaintenance) {
        const message = JSON.parse(Base64.decode(isMaintenance)).message
        console.log('[Maintenance]', message)
        return `Maintenance processed ${event.Records.length} messages.`;
    }

    const pool = await dbPool.getPool();

    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);
    console.log('secretValue!', secretValue)

    console.log('Received event:', JSON.stringify(event, null, 2));
    for (const { messageId, body } of event.Records) {
        console.log('SQS message %s: %j', messageId, body);

        let data = JSON.parse(body);
        console.log('[VALUE] data', data)
        let txHash = data.tx_hash;
        let nftSeq = data.nft_seq;
        const serviceCallbackSeq = data.svc_callback_seq || null;

        console.log('[VALUE] nftSeq : ', nftSeq);
        console.log('[VALUE] tx_hash : ', txHash);
        console.log('[VALUE] serviceCallbackSeq : ', serviceCallbackSeq);

        //[TASK] Update Transfer Table
        const [updateResult, f1] = await pool.query(dbQuery.nft_update_job.queryString, ['processing', nftSeq]);

        //[TASK] CHECK TRANSACTION [KAS]
        // NFT는 바오밥이 없기 때문에 8217 고정 픽스
        const satusCheckUrl = kasInfo.apiUrl + 'tx/' + txHash;
        const checkHeader = {
            'Authorization': secretValue.kas_authorization,
            'Content-Type': 'application/json',
            'x-chain-id': 8217,
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
            //트랜잭션을 확인 할 수 없는 상태라면 unknown // kas error or invalid hash
            //[TASK] Update Transfer Table
            let code = txStatusResult.error.data.code;
            let message = txStatusResult.error.data.message;
            const [updateUnknownResult, f1] = await pool.query(dbQuery.nft_update_tx_status_job_end.queryString, ['unknown', 'done', nftSeq]);
            console.log('[TASK - Update unkown]', updateUnknownResult);
            const logSeq = await InsertLogSeq('nft', nftSeq, 'KAS', code, message);
            console.log('[TASK - code]', code);
            console.log('[TASK - message]', message);
            console.log('[TASK - ERRORLOG]', logSeq);

        }
        else if (txStatusResult.data && txStatusResult.data.status) {
            let txStatus = txStatusResult.data.status;


            //Token을 사용할 경우, CommitError; 0x9 가 이런 식으로 나와서 체크해줘야함.
            var errorReg = new RegExp("CommitError");
            if (errorReg.test(txStatus)) {
                txStatus = 'CommitError';
            }

            console.log('[KAS] Check Transaction Result', txStatusResult);
            switch (txStatus) {
                case 'Committed':
                    {
                        //[TASK - Update Transfer Table]
                        const [updateResult, f5] = await pool.query(dbQuery.nft_update_tx_status_job_end.queryString, ['success', 'done', nftSeq]);
                        console.log('[Committed] Update Transfer Table', updateResult);
                        //[TASK - ServiceCallback]
                        if (serviceCallbackSeq) {
                            const callbackResult = await RequestServiceCallbackUrl(serviceCallbackSeq, `nftSequence=${nftSeq}&status=success`);
                            console.log('[Committed] callbackResult', callbackResult)
                        }
                        break;
                    }
                case 'CommitError':
                    {
                        const [updateResult, f5] = await pool.query(dbQuery.nft_update_tx_status_job_end.queryString, ['fail', 'done', nftSeq]);
                        console.log('[CommitError] updateResult', updateResult);
                        let code = txStatusResult.data.txError || '';
                        let message = txStatusResult.data.errorMessage || '';
                        const logSeq = await InsertLogSeq('nft', nftSeq, 'KAS', code, message);
                        console.log('[TASK - code]', code);
                        console.log('[TASK - message]', message);
                        console.log('[TASK - ERRORLOG]', logSeq);
                        if (serviceCallbackSeq) {
                            const callbackResult = await RequestServiceCallbackUrl(serviceCallbackSeq, `nftSequence=${nftSeq}&status=fail`);
                            console.log('[Committed] callbackResult', callbackResult)
                        }
                        break;
                    }
                case 'Pending':
                    {
                        const [updateResult, f5] = await pool.query(dbQuery.nft_update_tx_status_job.queryString, ['pending', 'ready', nftSeq]);
                        console.log('[Pending] updateResult', updateResult);
                        console.log('[Pending] Response Data', txStatusResult.data);
                        break;
                    }
                case 'Submitted':
                    {
                        const [updateResult, f5] = await pool.query(dbQuery.nft_update_tx_status_job.queryString, ['submit', 'ready', nftSeq]);
                        console.log('[Submitted] updateResult', updateResult);
                        console.log('[Submitted] Response Data', txStatusResult.data);
                        break;
                    }
                default:
                    {
                        // KAS Result Status가 비정상일 경우
                        const [updateResult, f1] = await pool.query(dbQuery.nft_update_tx_status_job_end.queryString, ['unknown', 'done', nftSeq]);
                        console.log('[Unknown] updateResult', updateResult);
                        console.log('[Unknown] Response Data', txStatusResult.data);
                        if (serviceCallbackSeq) {
                            const callbackResult = await RequestServiceCallbackUrl(serviceCallbackSeq, `nftSequence=${nftSeq}&status=unknown`);
                            console.log('[Committed] callbackResult', callbackResult)
                        }
                        break;
                    }
            }
        }
        else {
            // KAS Result가 비정상일 경우
            let newStatus = 'unknown';
            let job_status = 'done';
            const [updateUnknownResult, f1] = await pool.query(dbQuery.nft_update_tx_status_job_end.queryString, [newStatus, job_status, nftSeq]);
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
