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
        const serviceNumber = data.svc_num;
        const memoSeq = data.svc_memo_seq;
        const rewardQueId = data.rwd_q_seq;
        const serviceCallbackSeq = data.svc_callback_seq || null;
        const memberGroupId = data.mbr_grp_id;

        //[VALIDATION - HK Klaytn Account exist, service - membergroup match ]
        const [hkAccountResult, f3] = await pool.query(dbQuery.check_hk_klayton.queryString, [serviceNumber]);

        let validationHK = true;
        let validationService = true;
        if (hkAccountResult.length == 0) {
            console.log('[ERROR - HK Klaytn Account] 해당 서비스의 한경 클레이튼 정보가 없습니다.');
            //[TASK] Update Invlid Reward Queue
            const [updateRewardResult, f3] = await pool.query(dbQuery.reward_update_job.queryString, ['invalid', rewardQueId]);
            console.log('[TASK - Update Reward Queue]', updateRewardResult)
            //[TASK] Insert Log
            const rewardLogSeq = await InsertLogSeq('reward', rewardQueId, 'SQL', 1011, '해당 서비스의 한경 클레이튼 정보가 없습니다.');
            console.log('[TASK - Insert Log]', rewardLogSeq)
            validationHK = false;
            return `Fail processed ${event.Records.length} messages.`;
        }

        const hkKlaytnAddress = hkAccountResult[0].address;
        const hkXKrn = hkAccountResult[0].x_krn;

        const [serviceResult, f1] = await pool.query(dbQuery.service_get.queryString, [serviceNumber]);
        const serviceMemberGroupId = serviceResult[0].mbr_grp_id;
        if (serviceMemberGroupId !== memberGroupId) {
            console.log('[ERROR - memberGroupMatch] 서비스의 memberGroupId와 입력받은 memberGroupId가 일치하지 않습니다.');
            console.log('serviceMemberGroupId', serviceMemberGroupId);
            console.log('memberGroupId', memberGroupId);
            //[TASK] Update Invlid Reward Queue
            const [updateRewardResult, f3] = await pool.query(dbQuery.reward_update_job.queryString, ['invalid', rewardQueId]);
            console.log('[TASK - Update Reward Queue]', updateRewardResult)
            //[TASK] Insert Log
            const rewardLogSeq = await InsertLogSeq('reward', rewardQueId, 'SQL', 1016, '서비스의 memberGroupId와 입력받은 memberGroupId가 일치하지 않습니다.');
            console.log('[TASK - Insert Log]', rewardLogSeq)
            validationService = false;
            return `Fail processed ${event.Records.length} messages.`;
        }

        //[TASK] Transfer Check
        let transferExist = false;
        const [transferExistResult, f4] = await pool.query(dbQuery.transfer_get_by_rwd_q.queryString, [rewardQueId]);
        if (transferExistResult.length > 0) {
            transferExist = true;
        }

        if (transferExist) {
            //알 수 없는 이유로 메세지 큐가 여러번 수행될 경우, 중복해서 Send Klay 요청하는 것을 방지하기 위한 로직
            console.log('[ERROR] Already Transfer Exist')
            return `Fail processed ${event.Records.length} messages.`;
        }

        if (validationHK && validationService && !transferExist) {
            //요청 수행할 수 있는 for loop condition
            // [sub] get Current Balance
            const jsonRpcHeader = {
                'x-chain-id': kasInfo.xChainId,
                "Content-Type": "application/json"
            }
            const jsonRpcAuth = {
                username: secretValue.kas_access_key,
                password: secretValue.kas_secret_access_key,
            }
            const jsonRpcBody = { "jsonrpc": "2.0", "method": "klay_getBalance", "params": [userKlaytnAddress, "latest"], "id": 1 }

            const jsonRpcResponse = await axios
                .post(kasInfo.jsonRpcUrl, jsonRpcBody, {
                    headers: jsonRpcHeader,
                    auth: jsonRpcAuth
                })
                .catch((err) => {
                    console.log('jsonrpc send fali', err);
                    let errorBody = {
                        code: 1023,
                        message: '[KAS] 잔액 조회 에러',
                    };
                    console.log('[400] - (1023) 잔액 조회 에러');
                    console.log('jsonRpcResponse', jsonRpcResponse);
                });

            console.log('[KAS] jsonRpcResponse for balance', jsonRpcResponse);
            const currentBalance = jsonRpcResponse.data.result ? new BigNumber(jsonRpcResponse.data.result).toString(10) : null;


            //[TASK]  insert before_submit transfer
            const txStatus = 'before_submit';
            const jobStatus = 'ready';
            const txHash = null;
            const fee = null;
            const pebAmount = data.amount; //peb 단위
            const transferType = 'rwd';
            const now = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
            const transferEndDate = null;

            let transferSeq = null;

            try {
                const [insertResult, f1] = await pool.query(dbQuery.insert_transfer_with_rwd_q.queryString, [transferType, serviceNumber, linkNumber, pebAmount, fee, now, transferEndDate, txHash, txStatus, jobStatus, null, serviceCallbackSeq, memoSeq, currentBalance, rewardQueId]);
                transferSeq = insertResult.insertId;
            }
            catch (err) {
                console.log('[ERROR - Insert Transfer]', err.message)
            }

            console.log('[TASK - Insert Transfer] transferSeq', transferSeq)
            const [transferSeqSetUpdateResult, f2] = await pool.query(dbQuery.reward_transfer_seq_update.queryString, [transferSeq, rewardQueId]);
            console.log('[TASK - Update Reward] set transferSeq', transferSeqSetUpdateResult)

            //[TASK] Klay Transfer
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
                .post(kasInfo.apiUrl + 'tx/fd/value', sendBody, {
                    headers: axiosHeader,
                })
                .catch((err) => {
                    return { error: err.response }
                });

            if (sendResponse.error) {

                console.log('[SEND KLAY ERROR]', sendResponse.error);
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
                const [updateInvalidResult, f1] = await pool.query(dbQuery.reward_job_fetch_invalid_update.queryString, [transferSeq, rewardQueId]);
                console.log('[TASK - Update Reward] Invlid', updateInvalidResult);
                //send response eror일 경우, transaction 자체를 submit 할수가 없었던 요청.
                const completeDate = moment(new Date()).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
                const newFee = 0;
                const [statusFailResult, f2] = await pool.query(dbQuery.transfer_status_fee_update.queryString, ['fail', completeDate, 'done', null, transferSeq]);
                console.log('[TASK - Update Transfer] Fail', updateInvalidResult);

                let code = sendResponse.error.data.code;
                let message = sendResponse.error.data.message;
                console.log('[code]', code)
                console.log('[message]', message)
                const rewardLogSeq = await InsertLogSeq('reward', rewardQueId, 'KAS', code, message);
                const transferLogSeq = await InsertLogSeq('transfer', transferSeq, 'KAS', code, message);
                console.log('rewardLogSeq', rewardLogSeq);
                console.log('transferLogSeq', transferLogSeq);
            }
            else {
                console.log('[SEND KLAY SUCCESS] sendResponse', sendResponse.data);

                const sendStatus = sendResponse.data.status;
                console.log('sendStatus', sendStatus)
                let updateTxStatus = '';
                let updateJobStatus = '';

                if (sendStatus === 'Submitted') {
                    updateTxStatus = 'submit';
                    updateJobStatus = 'ready';

                }
                else if (sendStatus === 'Pending') {
                    updateTxStatus = 'pending';
                    updateJobStatus = 'ready';

                }
                else {
                    // KAS Result ERROR
                    updateTxStatus = 'unknown';
                    updateJobStatus = 'done';

                }
                const updateTxHash = sendResponse.data.transactionHash;

                try {
                    const [updateTransferStatusResult, f4] = await pool.query(dbQuery.transfer_status_hash_update.queryString, [updateTxStatus, updateJobStatus, updateTxHash, transferSeq]);
                    console.log('[TASK - Update Transfer] updateTxStatus : ', updateTxStatus)
                    console.log('[TASK - Update Transfer] updateJobStatus : ', updateJobStatus)
                    console.log('[TASK - Update Transfer] updateTxHash : ', updateTxHash)
                    console.log('[TASK - Update Transfer] updateTransferStatusResult', updateTransferStatusResult)
                }
                catch (err) {
                    console.log('updateTransferStatusResult error', err);
                }

                try {
                    const [rewardQueSuccessUpdateResult, f4] = await pool.query(dbQuery.reward_job_fetch_success_update.queryString, [rewardQueId]);
                    console.log('[TASK - Update Reward] set job_status = done', rewardQueSuccessUpdateResult)
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
