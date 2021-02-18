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

exports.handler = async(event) => {

    //const connection = await dbHandler.connectRDS(process.env.DB_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
    const pool = await dbPool.getPool();

    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);
    console.log('secretValue', secretValue)

    console.log('Received event:', JSON.stringify(event, null, 2));
    for (const { messageId, body } of event.Records) {

        console.log('SQS message %s: %j', messageId, body);

        let data = JSON.parse(body);
        console.log('data', data)


        const linkNumber = data.link_num;
        const userKlaytnAddress = data.klip_address;
        const bigNumberAmount = new BigNumber(data.amount);
        const hexAmount = '0x' + bigNumberAmount.toString(16);

        console.log('hexAmount', hexAmount)
        const serviceNumber = data.svc_num;
        const memoSeq = data.svc_memo_seq;
        const rewardQueId = data.rwd_q_seq;
        const serviceCallbackSeq = data.svc_callback_seq || null;

        let hkKlaytnAddress = null;
        console.log('hkKlaytnAddress', hkKlaytnAddress)

        // get HK Klaytn Info
        try {
            const [hkAccountResult, f1] = await pool.query(dbQuery.check_hk_klayton.queryString, [serviceNumber]);
            hkKlaytnAddress = hkAccountResult[0].address;
            console.log('hkAccount', hkAccountResult[0].address);
        }
        catch (err) {
            console.log('hkAccountResult error', err);
            continue;
        }

        //Check Transfer Exist
        let boolTransferExist = false;
        try {
            const [transferExistResult, f1] = await pool.query(dbQuery.transfer_get_by_rwd_q.queryString, [rewardQueId]);
            boolTransferExist = (transferExistResult.length > 0);
            console.log('transferExistResult', transferExistResult);
        }
        catch (err) {
            console.log('transferExistResult error', err);

            const [updateInvalidResult, f2] = await pool.query(dbQuery.reward_job_set_invalid_update.queryString, [rewardQueId]);
            console.log('updateInvalidResult', updateInvalidResult);

            const rewardLogSeq = await InsertLogSeq('reward', rewardQueId, 'SQL', 10201, err.message);
            console.log('rewardLogSeq', rewardLogSeq);

            continue;
        }

        if (boolTransferExist) {
            console.log('Already Exist Transfer');
            console.log('This Message Must to be Ignored')

            const [updateInvalidResult, f1] = await pool.query(dbQuery.reward_job_set_invalid_update.queryString, [rewardQueId]);
            console.log('updateInvalidResult', updateInvalidResult)

            const rewardLogSeq = await InsertLogSeq('reward', rewardQueId, 'SQL', 10301, 'Duplicate Request Reward Queue');
            console.log('rewardLogSeq', rewardLogSeq)
        }
        else {
            // Get current Balance
            const jsonRpcHeader = {
                'x-chain-id': kasInfo.xChainId,
                "Content-Type": "application/json"
            }
            const jsonRpcAuth = {
                username: secretValue.kas_access_key,
                password: secretValue.kas_secret_access_key,
            }
            const jsonRpcBody = { "jsonrpc": "2.0", "method": "klay_getBalance", "params": [userKlaytnAddress, "latest"], "id": 1 }

            const balanceJsonRpcResponse = await axios
                .post(kasInfo.jsonRpcUrl, jsonRpcBody, {
                    headers: jsonRpcHeader,
                    auth: jsonRpcAuth
                })
                .catch((err) => {
                    console.log('jsonrpc balance fali', err);

                    let errorBody = {
                        code: 1023,
                        message: '[KAS] 잔액 조회 에러',
                    };

                    //status fail insert  해주긴 해야함
                    return { error: errorBody }
                });
            console.log('balanceJsonRpcResponse', balanceJsonRpcResponse);

            //result 0x1212kjsdvsdfo
            const currentBalance = balanceJsonRpcResponse.data.result ? parseInt(balanceJsonRpcResponse.data.result) : null;
            console.log('currentBalance [to User]', currentBalance)


            // insert before_submit transfer
            const txStatus = 'before_submit';
            const jobStatus = 'ready';
            const txHash = null;
            const fee = null;
            const pebAmount = data.amount; //peb 단위
            const transferType = 'rwd';
            const now = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
            const transferEndDate = null;

            const [insertResult, f1] = await pool.query(dbQuery.insert_transfer_with_rwd_q.queryString, [transferType, serviceNumber, linkNumber, pebAmount, fee, now, transferEndDate, txHash, txStatus, jobStatus, null, serviceCallbackSeq, memoSeq, currentBalance, rewardQueId]);

            const transferSeq = insertResult.insertId;
            console.log('transferSeq', transferSeq)

            if (transferSeq) {
                try {
                    const [transferSeqSetUpdateResult, f2] = await pool.query(dbQuery.reward_transfer_seq_update.queryString, [transferSeq, rewardQueId]);
                    console.log('transferSeqSetUpdateResult', transferSeqSetUpdateResult)
                }
                catch (err) {
                    console.log('transferSeqSetUpdateResult error', err);
                }
            }


            // Klay Transfer
            //result transactionHash
            const axiosHeader = {
                'Authorization': secretValue.kas_authorization,
                'x-krn': secretValue.kas_x_krn,
                'Content-Type': 'application/json',
                'x-chain-id': kasInfo.xChainId,
            };

            const sendBody = {
                from: hkKlaytnAddress,
                value: hexAmount,
                to: userKlaytnAddress,
                memo: 'memo',
                nonce: 0,
                gas: 0,
                submit: true,
            };

            const sendResponse = await axios
                .post(kasInfo.apiUrl + 'tx/value', sendBody, {
                    headers: axiosHeader,
                })
                .catch((err) => {
                    console.log('klay send fali', err.response);
                    return { error: err.response }
                });
            console.log('sendResponse', sendResponse);

            if (sendResponse.error) {
                //status fail insert  해주긴 해야함

                console.log('sendResponse.error', sendResponse.error)
                // 전송 실패 이슈
                //err.data.code === 1065001
                //err.data.message
                // failed to send a raw transaction to klaytn node; -32000::insufficient funds of the sender for value
                // failed to send a raw transaction to klaytn node; -32000::not a program account (e.g., an account having code and storage)
                // failed to send a raw transaction to klaytn node; -32000::nonce too low
                // failed to send a raw transaction to klaytn node; -32000::insufficient funds of the fee payer for gas * price

                //주소가 잘못되었을 때
                // account : 주소 string이지만 잘못
                //err.data.code = 1061609
                //err.data.message = it just allow Klaytn address form; to
                // account : null일 경우
                //err.data.code ===1061608
                ///err.data.message
                // cannot be empty or zero value; to
                // cannot be empty or zero value; input

                let code = sendResponse.error.data.code;
                let message = sendResponse.error.data.message;
                console.log('code', code)
                console.log('message', message)

                const [updateInvalidResult, f2] = await pool.query(dbQuery.reward_job_fetch_invalid_update.queryString, [transferSeq, rewardQueId]);
                console.log('updateInvalidResult', updateInvalidResult)

                //send response eror일 경우, transaction 자체를 submit 할수가 없었던 요청.
                let newStatus = 'fail';
                let job_status = 'done';
                const completeDate = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
                const newFee = 0;

                const [statusFailResult, f3] = await pool.query(dbQuery.transfer_status_fee_update.queryString, [newStatus, completeDate, job_status, null, transferSeq]);
                console.log('statusFailResult', statusFailResult)

                const rewardLogSeq = await InsertLogSeq('reward', rewardQueId, 'KAS', code, message);
                const transferLogSeq = await InsertLogSeq('transfer', transferSeq, 'KAS', code, message);
                console.log('rewardLogSeq', rewardLogSeq);
                console.log('transferLogSeq', transferLogSeq);

            }
            else {
                const sendStatus = sendResponse.data.status;
                console.log('sendStatus', sendStatus)
                const updateTxStatus = 'submit';
                const updateJobStatus = 'ready';
                const updateTxHash = sendResponse.data.transactionHash;


                // "params": ["tx_status", "job_status", "tx_hash", "transferSeq"],
                try {
                    const [updateTransferStatusResult, f4] = await pool.query(dbQuery.transfer_status_hash_update.queryString, [updateTxStatus, updateJobStatus, updateTxHash, transferSeq]);
                    console.log('updateTransferStatusResult', updateTransferStatusResult)
                }
                catch (err) {
                    console.log('updateTransferStatusResult error', err);
                }

                try {
                    const [rewardQueSuccessUpdateResult, f4] = await pool.query(dbQuery.reward_job_fetch_success_update.queryString, [rewardQueId]);
                    console.log('rewardQueSuccessUpdateResult', rewardQueSuccessUpdateResult)
                }
                catch (err) {
                    console.log('rewardQueSuccessUpdateResult error', err);
                }
            }
        }
    }
    //for end
    console.log('Successfully processed')


    return `Successfully processed ${event.Records.length} messages.`;
};
