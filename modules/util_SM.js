"use strict";

var AWS = require('aws-sdk');

const getSecretValue = async function(secretsManagerId) {

    var client = new AWS.SecretsManager({
        region: 'ap-northeast-2',
        apiVersion: '2017-10-17'
    });

    const secret = await client.getSecretValue({ SecretId: secretsManagerId }).promise();
    const secretValue = secret.SecretString;
    return JSON.parse(secretValue);
}

module.exports = { getSecretValue }
