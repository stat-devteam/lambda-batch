"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');
const psHandler = require('../modules/util_ps.js');
var Base64 = require("js-base64");
var axios = require("axios").default;
const kasInfo = require('../resource/kas.json');
const smHandler = require('../modules/util_sm.js');
const BigNumber = require('bignumber.js');
var moment = require('moment-timezone');
var _ = require('lodash');


exports.handler = async function(event) {

    console.log('[kas_transfer_crawler]', event);

    const isMaintenance = await psHandler.getParameterStoreValue(process.env.PARAMETER_STORE_VALUE, 'batch', null);
    console.log('isMaintenance', isMaintenance)
    if (isMaintenance) {
        const message = JSON.parse(Base64.decode(isMaintenance)).message
        console.log('[Maintenance]', message)
    }
    else {
        try {

            const pool = await dbPool.getPool();
            const secretValue = await smHandler.getSecretValue(process.env.SM_ID);

            // for loop startDate ~ endDate
            // const startDate = moment(new Date('2021-02-01')).tz('Asia/Seoul');
            // const endDate = moment(new Date('2021-05-13')).tz('Asia/Seoul');
            // var datesBetween = [];
            // var startingMoment = startDate;

            // while (startingMoment <= endDate) {
            //     datesBetween.push(startingMoment.clone()); // clone to add new object
            //     console.log('startingMoment', startingMoment)
            //     let targetDay = startingMoment.clone().format('YYYY-MM-DD HH:mm:ss');
            //     console.log('targetDay', targetDay);
            //     const [startUnix, endUnix] = getUnixRange(targetDay);
            //     const [hkKlaytnAddressAllResult, f1] = await pool.query(dbQuery.hk_klaytn_account_list_all.queryString);

            //     console.log('hkKlaytnAddressAllResult', hkKlaytnAddressAllResult);

            //     const kasHeaders = {
            //         'x-chain-id': kasInfo.xChainId,
            //         "Content-Type": "application/json"
            //     }
            //     const kasAuth = {
            //         username: secretValue.kas_access_key,
            //         password: secretValue.kas_secret_access_key,
            //     }
            //     const range = `${startUnix},${endUnix}`;

            //     for (let i in hkKlaytnAddressAllResult) {

            //         const targetKlaytnAddress = hkKlaytnAddressAllResult[i].address;
            //         console.log('targetKlaytnAddress', targetKlaytnAddress)
            //         const targetAccountId = hkKlaytnAddressAllResult[i].accnt_id;
            //         console.log('targetAccountId', targetAccountId)

            //         // ALL Transaction by KAS API
            //         const kasTransferListResult = await getKasTransferList(kasHeaders, kasAuth, targetKlaytnAddress, range, '');
            //         console.log('kasTransferListResult', kasTransferListResult);
            //         console.log('kasTransferListResult.length', kasTransferListResult.length);

            //         // timestamp는 second 단위로 중복의 정렬 케이스가 있기 때문에, transactionIndex로 한번더 정렬
            //         let orderedKasTransferList = _.orderBy(kasTransferListResult, ['timestamp', 'transactionIndex'], ['asc', 'asc']);
            //         console.log('orderedKasTransferList', orderedKasTransferList)
            //         // get Last Transaction
            //         const [kasTransferLastRow, f2] = await pool.query(dbQuery.kas_transfer_get_last_one.queryString, [targetAccountId]);
            //         console.log('kasTransferLastRow', kasTransferLastRow)
            //         let lastBalance = 0;
            //         if (kasTransferLastRow.length === 1) {
            //             console.log('[GET Last BALANCE ]', kasTransferLastRow[0].balance)
            //             lastBalance = kasTransferLastRow[0].balance;
            //         }

            //         let insertArray = [];
            //         // kas_transfer row 가공
            //         for (let i in orderedKasTransferList) {

            //             const targetTransaction = orderedKasTransferList[i];
            //             const transfer_reg_dt = moment.unix(targetTransaction.timestamp).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
            //             const amount = new BigNumber(targetTransaction.value).toString(10);
            //             const type = getAccountType(targetTransaction, targetKlaytnAddress);
            //             const fee = getFee(targetTransaction, type);
            //             const to_address = targetTransaction.to
            //             const from_address = targetTransaction.from;
            //             const fee_address = targetTransaction.feePayer;
            //             const tx_hash = targetTransaction.transactionHash;
            //             const type_int = targetTransaction.typeInt;
            //             const status_int = targetTransaction.status;
            //             const balance = updateLastBalance(lastBalance, type, amount, fee);

            //             // accnt_id, type, type_int, tx_hash, status_int, from_address, to_address, amount, fee_address, fee, balance, transfer_reg_dt
            //             const insertItem = [targetAccountId, type, type_int, tx_hash, status_int, from_address, to_address, amount, fee_address, fee, balance, transfer_reg_dt];
            //             lastBalance = balance
            //             // console.log('insertItem', insertItem);
            //             insertArray.push(insertItem);
            //         }
            //         console.log('insertArray', insertArray);
            //         console.log('insertArray.length', insertArray.length);
            //         if (insertArray.length > 0) {
            //             const [insertResult, f5] = await pool.query(dbQuery.kas_transfer_insert_bulk.queryString, [insertArray]);
            //             console.log('insertResult', insertResult);
            //             console.log('affectedRows', insertResult.affectedRows)
            //         }
            //     }

            //     startingMoment.add(1, 'days');
            // }

            // console.log('startingMoment', startingMoment)

            // yesterday
            let targetDay = moment(new Date()).subtract(1, 'day').tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');

            console.log('targetDay', targetDay);
            const [startUnix, endUnix] = getUnixRange(targetDay);
            const [hkKlaytnAddressAllResult, f1] = await pool.query(dbQuery.hk_klaytn_account_list_all.queryString);

            console.log('hkKlaytnAddressAllResult', hkKlaytnAddressAllResult);

            const kasHeaders = {
                'x-chain-id': process.env.KAS_xChainId,
                "Content-Type": "application/json"
            }
            const kasAuth = {
                username: secretValue.kas_access_key,
                password: secretValue.kas_secret_access_key,
            }
            const range = `${startUnix},${endUnix}`;

            for (let i in hkKlaytnAddressAllResult) {

                const targetKlaytnAddress = hkKlaytnAddressAllResult[i].address;
                console.log('targetKlaytnAddress', targetKlaytnAddress)
                const targetAccountId = hkKlaytnAddressAllResult[i].accnt_id;
                console.log('targetAccountId', targetAccountId)

                // ALL Transaction by KAS API
                const kasTransferListResult = await getKasTransferList(kasHeaders, kasAuth, targetKlaytnAddress, range, '');
                console.log('kasTransferListResult', kasTransferListResult);
                console.log('kasTransferListResult.length', kasTransferListResult.length);

                // timestamp는 second 단위로 중복의 정렬 케이스가 있기 때문에, transactionIndex로 한번더 정렬
                let orderedKasTransferList = _.orderBy(kasTransferListResult, ['timestamp', 'transactionIndex'], ['asc', 'asc']);
                console.log('orderedKasTransferList', orderedKasTransferList)
                // get Last Transaction
                const [kasTransferLastRow, f2] = await pool.query(dbQuery.kas_transfer_get_last_one.queryString, [targetAccountId]);
                console.log('kasTransferLastRow', kasTransferLastRow)
                let lastBalance = 0;
                if (kasTransferLastRow.length === 1) {
                    console.log('[GET Last BALANCE ]', kasTransferLastRow[0].balance)
                    lastBalance = kasTransferLastRow[0].balance;
                }

                let insertArray = [];
                // kas_transfer row 가공
                for (let i in orderedKasTransferList) {

                    const targetTransaction = orderedKasTransferList[i];
                    const transfer_reg_dt = moment.unix(targetTransaction.timestamp).tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
                    const amount = new BigNumber(targetTransaction.value).toString(10);
                    const type = getAccountType(targetTransaction, targetKlaytnAddress);
                    const fee = getFee(targetTransaction, type);
                    const to_address = targetTransaction.to
                    const from_address = targetTransaction.from;
                    const fee_address = targetTransaction.feePayer;
                    const tx_hash = targetTransaction.transactionHash;
                    const type_int = targetTransaction.typeInt;
                    const status_int = targetTransaction.status;
                    const balance = updateLastBalance(lastBalance, type, amount, fee);

                    // accnt_id, type, type_int, tx_hash, status_int, from_address, to_address, amount, fee_address, fee, balance, transfer_reg_dt
                    const insertItem = [targetAccountId, type, type_int, tx_hash, status_int, from_address, to_address, amount, fee_address, fee, balance, transfer_reg_dt];
                    lastBalance = balance
                    // console.log('insertItem', insertItem);
                    insertArray.push(insertItem);
                }
                console.log('insertArray', insertArray);
                console.log('insertArray.length', insertArray.length);
                if (insertArray.length > 0) {
                    const [insertResult, f5] = await pool.query(dbQuery.kas_transfer_insert_bulk.queryString, [insertArray]);
                    console.log('insertResult', insertResult);
                    console.log('affectedRows', insertResult.affectedRows)
                }
            }

            // accounting_stats insert
            const [insertStatsResult, f2] = await pool.query(dbQuery.accounting_stats_insert.queryString, []);
            console.log('insertStatsResult', insertStatsResult)


        }
        catch (err) {
            console.log(err);
        }
    }

};

const getUnixRange = (value) => {
    //value is YYYY-MM-DD hh:mm:ss
    let startDate = moment(value).toDate();
    let endDatae = moment(value).toDate();
    startDate.setHours(0);
    startDate.setMinutes(0);
    startDate.setSeconds(0);
    startDate.setMilliseconds(0);
    endDatae.setHours(23);
    endDatae.setMinutes(59);
    endDatae.setSeconds(59);
    endDatae.setMilliseconds(999);
    console.log('startDate', startDate);
    console.log('endDatae', endDatae);

    let startDayUnix = Math.floor(startDate.getTime() / 1000) - 32400;
    console.log('startDayUnix', startDayUnix)
    let endDayUnix = Math.floor(endDatae.getTime() / 1000) - 32400;
    console.log('endDayUnix', endDayUnix);

    return [startDayUnix, endDayUnix];
}

const getAccountType = (data, targetAddress) => {
    let upperFrom = data.from.toUpperCase();
    let upperTo = data.to.toUpperCase();
    let upperTarget = targetAddress.toUpperCase();


    if (upperFrom === upperTarget) {
        return 'withdrawal'
    }
    else if (upperTo === upperTarget) {
        return 'deposit'
    }
    else {
        return 'unknown';
    }
}

const isDelegated = (typeInt) => {

    const DELEGATED_TYPEINT_LIST = [
        9, 10, 17, 18, 33, 41, 49, 57
    ]
    if (typeInt) {
        return DELEGATED_TYPEINT_LIST.includes(typeInt)
    }
    else {
        return false;
    }
}

const getFee = (data, type) => {
    let typeInt = data.typeInt

    if (type === 'deposit') {
        return 0;
    }
    else {
        if (isDelegated(typeInt)) {
            return 0;
        }
        else {
            return new BigNumber(data.fee).toString(10);
        }
    }

}

const updateLastBalance = (lastBalance, type, amount, fee) => {
    let newLastBalance = null;
    let BigLastBalance = new BigNumber(lastBalance);
    let BigAmount = new BigNumber(amount);
    let BigFee = new BigNumber(fee);

    if (type === 'withdrawal') {
        newLastBalance = BigLastBalance.minus(amount).minus(fee).toString(10);
    }
    else if (type === 'deposit') {
        newLastBalance = BigLastBalance.plus(amount).minus(fee).toString(10);
    }
    else {
        newLastBalance = BigLastBalance.toString(10);
    }
    return newLastBalance
}

const getKasTransferList = (kasHeaders, kasAuth, klaytnAddress, range, cursor, data = []) => {
    //Internal transaction까지 조회되는 api (klaytn scope의 transaction, internal transaction 둘다 조회되는 api)
    return axios.get(`${kasInfo.thApiUrl}transfer/account/${klaytnAddress}?kind=klay&size=1000&cursor=${cursor}&range=${range}`, { headers: kasHeaders, auth: kasAuth })
        .then(response => {
            //response data { items : [], cursor : 'string'}
            console.log('[getKasTransferList] - response', response)
            const items = response.data.items;
            const newCursor = response.data.cursor;
            console.log('[getKasTransferList] - items', items)
            console.log('[getKasTransferList] - items.length', items.length)
            console.log('[getKasTransferList] - newCursor', newCursor)

            if (items.length > 0) {
                data.push(...items);
            }

            if (newCursor) {
                return getKasTransferList(kasHeaders, kasAuth, klaytnAddress, range, newCursor, data);
            }
            else {
                return data;
            }


        }).catch(err => {
            return { error: err.response }

        })
}
