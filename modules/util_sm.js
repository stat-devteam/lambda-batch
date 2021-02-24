"use strict";

var AWS = require('aws-sdk');

console.log("[SecretsManager Util]", "init...");

const smClient = new AWS.SecretsManager({
    region: 'ap-northeast-2',
    apiVersion: '2017-10-17'
});

const smMap = new Map();

const clearCache = () => {
    smMap.clear();
    console.log("[SecretsManager Util]", "[clearCache]", "cache cleared...");
}

const getSecretValue = async(secretId, boolFromCache = true) => {
    if (boolFromCache === true) {
        const secretObj = smMap.get(secretId);
        if (secretObj)
            return secretObj;
    }

    console.log("[SecretsManager Util]", "[getSecretValue]", "secret value fetch start...", secretId);
    const secret = await smClient.getSecretValue({ SecretId: secretId }).promise();

    if (secret) {
        const jsonSecretValue = JSON.parse(secret.SecretString);
        smMap.set(secretId, jsonSecretValue);
        console.log("[SecretsManager Util]", "[getSecretValue]", "fetched secret value", jsonSecretValue);
        return jsonSecretValue;
    }

    console.log("[SecretsManager Util]", "[getSecretValue]", "no such secret value...", secretId);
    return null;
}

module.exports = { clearCache, getSecretValue }
