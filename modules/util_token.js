"use strict";
var axios = require("axios").default;
var smHandler = require('./util_sm.js');
const kasInfo = require('../resource/kas.json');
const tokenInfo = require("../resource/token.json");
const BigNumber = require('bignumber.js');

const getBalanceOf = async(fromAddress) => {
    console.log('[token-util] getBalanceOf');
    console.log('param fromAddress', fromAddress);
    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);


    const contract_address = tokenInfo.contractAddress;
    const api_detail_address = tokenInfo.callUrl;
    const contract_data = {
        "methodName": "balanceOf",
        "arguments": [{
            "name": "owner",
            "type": "address",
            "value": fromAddress,
        }],
    }

    const axiosHeader = {
        'Authorization': secretValue.kas_authorization,
        'Content-Type': 'application/json',
        'x-chain-id': kasInfo.xChainId,
    };

    const sendBody = {
        from: fromAddress,
        value: "0x0",
        to: contract_address,
        data: contract_data,
        gas: 0,
    };
    console.log('[KAS] contract call body : ', sendBody);

    const sendResponse = await axios
        .post(kasInfo.apiUrl + api_detail_address, sendBody, {
            headers: axiosHeader,
        })
        .catch((err) => {
            return { error: err.response }
        });
    console.log('sendResponse', sendResponse)
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
        const decimalBalance = new BigNumber(sendResponse.data.result).toString(10);
        console.log('decimalBalance', decimalBalance);
        return {
            result: true,
            balance: decimalBalance,
        }
    }
}

const sendToken = async(fromAddress, toAddress, amount) => {
    const secretValue = await smHandler.getSecretValue(process.env.SM_ID);
    console.log('[token-util] sendToken');
    console.log('param fromAddress', fromAddress);
    console.log('param toAddress', toAddress);
    console.log('param amount', amount);
    const bigNumberAmount = new BigNumber(amount).multipliedBy(new BigNumber(1e+18));
    const hexAmount = '0x' + bigNumberAmount.toString(16);
    console.log('hexAmount', hexAmount);
    const toSolValue = hexToSolValue(toAddress);
    const amountSolValue = hexToSolValue(hexAmount);
    console.log('toSolValue', toSolValue)
    console.log('amountSolValue', amountSolValue)

    const intputSol = tokenInfo.transferMethodId + toSolValue + amountSolValue;
    const contract_address = tokenInfo.contractAddress;
    const api_detail_address = tokenInfo.executeUrl;

    const axiosHeader = {
        'Authorization': secretValue.kas_authorization,
        'Content-Type': 'application/json',
        'x-chain-id': kasInfo.xChainId,
        'x-krn': secretValue.kas_x_krn
    };
    console.log('axiosHeader', axiosHeader)
    const sendBody = {
        from: fromAddress,
        value: "0x0",
        to: contract_address,
        input: intputSol,
        nonce: 0,
        submit: true,
    };
    console.log('[KAS] contract execute body : ', sendBody);

    const sendResponse = await axios
        .post(kasInfo.apiUrl + api_detail_address, sendBody, {
            headers: axiosHeader,
        })
        .catch((err) => {
            return { error: err.response }
        });
    console.log('sendResponse', sendResponse)
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

const hexToSolValue = (hexValue) => {
    let removePrefix = String(hexValue).replace('0x', '');
    console.log('removePrefix');

    return padZero(removePrefix, 64)
}

const padZero = (n, width, z) => {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}



module.exports = { getBalanceOf, sendToken }
