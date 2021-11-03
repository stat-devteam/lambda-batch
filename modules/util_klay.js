"use strict";

var axios = require("axios").default;
var smHandler = require('./util_sm.js');
const kasInfo = require('../resource/kas.json');
const BigNumber = require('bignumber.js');

const getBalanceOf = async(userKlaytnAddress) => {
    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);

    const jsonRpcHeader = {
        'x-chain-id': process.env.KAS_xChainId,
        "Content-Type": "application/json"
    }
    const jsonRpcAuth = {
        username: secretValue.kas_access_key,
        password: secretValue.kas_secret_access_key,
    }
    const jsonRpcBody = { "jsonrpc": "2.0", "method": "klay_getBalance", "params": [userKlaytnAddress, "latest"], "id": 1 }

    const kalynJsonRpcResponse = await axios
        .post(kasInfo.jsonRpcUrl, jsonRpcBody, {
            headers: jsonRpcHeader,
            auth: jsonRpcAuth
        })
        .catch((err) => {
            console.log('jsonrpc send fali', err);
            let code = kalynJsonRpcResponse.error.data.code;
            let message = kalynJsonRpcResponse.error.data.message;
            console.log('[code]', code)
            console.log('[message]', message)
            return {
                result: false,
                code: code,
                message: message,
            }
        });
    console.log('kalynJsonRpcResponse', kalynJsonRpcResponse);

    if (kalynJsonRpcResponse.error) {
        return {
            result: false,
            data: kalynJsonRpcResponse.error
        }
    }
    else {
        const decimalBalance = new BigNumber(kalynJsonRpcResponse.data.result).toString(10);
        return {
            result: true,
            balance: decimalBalance,

            data: kalynJsonRpcResponse
        }
    }
}

const sendToken = async(fromAddress, toAddress, amount) => {
    console.log('[klay handler - sendToken] fromAddress', fromAddress)
    console.log('[klay handler - sendToken] toAddress', toAddress)
    console.log('[klay handler - sendToken] amount', amount)

    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);
    console.log('secretValue', secretValue);
    const bigNumberAmount = new BigNumber(amount).multipliedBy(new BigNumber(1e+18));
    const hexAmount = '0x' + bigNumberAmount.toString(16);
    console.log('hexAmount', hexAmount)
    //[TASK] Klay Transfer
    const axiosHeader = {
        'Authorization': secretValue.kas_authorization,
        'x-krn': secretValue.kas_x_krn,
        'Content-Type': 'application/json',
        'x-chain-id': process.env.KAS_xChainId,
    };
    console.log('axiosHeader', axiosHeader)

    const sendBody = {
        from: fromAddress,
        value: hexAmount,
        to: toAddress,
        memo: 'memo',
        nonce: 0,
        gas: 0,
        submit: true,
    };
    console.log('sendBody', sendBody)

    const sendResponse = await axios
        .post(kasInfo.apiUrl + 'tx/value', sendBody, {
            headers: axiosHeader,
        })
        .catch((err) => {
            return { error: err.response }
        });

    console.log('Klay handler sendToken response :', sendResponse)
    if (sendResponse.error) {
        let code = sendResponse.error.data.code;
        let message = sendResponse.error.data.message;
        console.log('[code]', code)
        console.log('[message]', message)
        return {
            result: false,
            code: code,
            message: message,
        }
    }
    else {
        const responseData = sendResponse.data;
        console.log('status', responseData.status);
        console.log('transactionHash', responseData.transactionHash);

        return {
            result: true,
            data: responseData,
        }
    }
}



module.exports = { getBalanceOf, sendToken }
