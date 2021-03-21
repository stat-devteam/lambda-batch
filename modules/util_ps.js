"use strict";

var AWS = require('aws-sdk');
var Base64 = require("js-base64");

function IsJsonString(str) {
    try {
        JSON.parse(str);
    }
    catch (e) {
        return false;
    }
    return true;
}


console.log("[ParameterStore Util]", "init...");

const ssmClient = new AWS.SSM({
    region: 'ap-northeast-2',
    apiVersion: '2014-11-06'
});


const psMap = new Map();

const clearCache = () => {
    psMap.clear();
    console.log("[ParameterStore Util]", "[clearCache]", "cache cleared...");
}


const returnLogic = (object, key, pass) => {
    let targetValue = object[key];
    console.log('returnLogic targetValue', targetValue);

    if (targetValue) {
        if (pass === object['pass']) {
            console.log('object[pass]', object['pass'])
            return false;
        }
        else if (targetValue.stop) {
            let returnString = Base64.encode(JSON.stringify(object));
            console.log('returnString', returnString)
            return returnString;
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }

}

const getParameterStoreValue = async(parameterStoreId, key, pass, boolFromCache = true) => {
    console.log('getParameterStoreValue parameterStoreId', parameterStoreId)
    console.log('getParameterStoreValue key', key)
    console.log('getParameterStoreValue pass', pass)
    console.log('getParameterStoreValue boolFromCache', boolFromCache)

    if (boolFromCache === true) {
        const parameterStoreObj = psMap.get(parameterStoreId);
        console.log('[ParameterStore Util] get Map()', parameterStoreObj);
        if (parameterStoreObj) {
            let targetValue = parameterStoreObj[key];
            console.log('parameterStoreObj logic - targetValue', targetValue)
            if (targetValue.ready) {
                console.log('Ready Status Not Cache')
            }
            else {
                return returnLogic(parameterStoreObj, key, pass)

            }
        }
    }


    var params = {
        Name: parameterStoreId,
    };
    console.log("[ParameterStore Util]", "[getParameterStoreValue]", 'params : ', params);

    try {
        const results = await ssmClient.getParameter(params).promise();
        console.log("[ParameterStore Util]", "[getParameterStoreValue]", "results ", results);

        if (IsJsonString(results.Parameter.Value)) {
            let value = JSON.parse(results.Parameter.Value);
            psMap.set(parameterStoreId, value);
            console.log('[ParameterStore Util] set Map()', value);
            return returnLogic(value, key, pass)
        }
        else {
            console.log("[ParameterStore Util]", "[getParameterStoreValue]", "results.Parameter.Value is Not Json String ", results.Parameter.Value);
            return null;
        }
    }
    catch (err) {
        console.log("[ParameterStore Util]", "[getParameterStoreValue]", "err", err);
        return null;

    }

}


module.exports = { clearCache, getParameterStoreValue }
