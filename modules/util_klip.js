"use strict";

var axios = require("axios").default;
const klipInfo = require('../resource/klip.json');
var smHandler = require('./util_sm.js');
var FormData = require('form-data');
var crypto = require('crypto');
const jwt_decode = require("jwt-decode");
const moment = require('moment-timezone');

let klipLoginData = null; //login 이후에 엑세스 토큰은 해쉬값으로 접근

const getKlipLoginData = async() => {
    const now_unix = moment(new Date()).tz('Asia/Seoul').unix();
    console.log('[getKlipLoginData] klipLoginData', klipLoginData)
    console.log('[getKlipLoginData] now_unix', now_unix)
    // cache에서 값 가져올 경우 decode
    if (klipLoginData && klipLoginData.exp > now_unix) {
        console.log('[getKlipLoginData] return info from cache', klipLoginData);

        return {
            result: true,
            data: klipLoginData,
        }
    }
    else {
        const klipLoginResult = await requestLogin();
        console.log('[getKlipLoginData] return info from api')
        let temp_data = klipLoginResult.data;
        const access_token = klipLoginResult.data.access_token;
        var decoded = jwt_decode(access_token);
        console.log(decoded);
        const exp = decoded.exp;
        temp_data.exp = exp;
        klipLoginData = temp_data;

        if (klipLoginResult.result) {
            return {
                result: true,
                data: klipLoginResult.data
            }
        }
        else {
            console.log('[getKlipLoginData] return fail from api')

            return {
                result: false,
                data: klipLoginResult.data,
            }
        }
    }

}
const requestLogin = async() => {

    const secretValue = await smHandler.getSecretValue(process.env.KLIP_SM_ID);

    console.log('[requestLogin] secretValue', secretValue);

    const email = secretValue.email;
    const password = secretValue.password;
    const sha256_pw = crypto.createHash('sha256').update(password).digest('hex');
    console.log('sha256_pw', sha256_pw)
    // [TASK] Request Klip Check
    const axiosHeader = {
        'Content-Type': 'application/json',
    };

    const body = {
        email: email,
        password: sha256_pw
    }

    console.log('[requestLogin] request klip partenr api auth')
    const klipPartnerLoginResult = await axios
        .post(
            `${klipInfo.partnerUrl}auth`, body, { headers: axiosHeader }
        )
        .catch((err) => {
            console.log('[Klip Partner Login - ERROR] err', err);
            return { error: err.response }
        });
    console.log('[requestLogin] klipPartnerLoginResult', klipPartnerLoginResult)
    if (klipPartnerLoginResult.error) {
        console.log('[Klip - 400] response', klipPartnerLoginResult.error);
        const data = klipPartnerLoginResult.error.data;
        return {
            result: false,
            data: data
        }
    }
    else {
        const temp_data = {
            email: 'juhwan@statproject.io',
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJJZCI6MTAwMzg1MCwiZXhwIjoxNjI0MzUxODIzfQ.TOxD4HIIv7y_kEv0jMqLS0QOU7-zeru4l08QYNgbffU',
            klaytn_address: '0x9Db60109f71a1E11D7ED3B6d9a6452fA61A5597C',
            contract_address: '0x74de529b202b36aF76Fd1d6A0e2609dE72a2DC8d',
            name: 'STATPTELTD',
            service_name: 'STAT',
            phone: '01088448508',
            status: 1,
            mint_limit: 10000,
            mint_count: 0
        };

        klipLoginData = klipPartnerLoginResult.data;
        return {
            result: true,
            data: klipPartnerLoginResult.data,
        }

    }
}

const requestUploadImage = async(image_buffer) => {
    console.log('[requestUploadImage] image_buffer', image_buffer)

    const klipLoginData = await getKlipLoginData();
    console.log('[requestUploadImage] klipLoginData', klipLoginData)
    let access_token = null;

    if (klipLoginData.result) {
        access_token = klipLoginData.data.access_token
    }

    else {
        return {
            result: false,
            code: klipLoginData.code,
            message: klipLoginData.message,
        }
    }
    console.log('[requestUploadImage] access_token', access_token)

    //[TASK] Request Klip Check

    var formData = new FormData();
    formData.append('upload', image_buffer, {
        contentType: 'image/png',
        filename: 'upload.png',
    });

    const axiosHeader = {
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
        'Authorization': access_token
    };

    console.log('[requestUploadImage] axiosHeader', axiosHeader)
    console.log('[requestUploadImage] formData', formData)

    const klipImageUploadResult = await axios
        .post(
            `${klipInfo.walletUrl}image`, formData, { headers: axiosHeader }
        )
        .catch((err) => {
            console.log('[requestUploadImage - ERROR] err', err);
            return { error: err.response }
        });
    console.log('klipImageUploadResult', klipImageUploadResult)

    if (klipImageUploadResult.error) {
        console.log('[requestUploadImage - ERROR] response', klipImageUploadResult.error);
        const data = klipImageUploadResult.error.data;
        return {
            result: false,
            data: data,
        }
    }
    else {
        return {
            result: true,
            data: klipImageUploadResult.data,
        }
    }
}


const requestCardMint = async(to_address, name, description, image_url, effect_dt, expire_dt, trader_name, type, ) => {
    //mbr_id, trader_id, trader_name,type: 'trader_card'
    const secretValue = await smHandler.getSecretValue(process.env.KLIP_SM_ID);
    console.log('[requestCardMint] secretValue', secretValue)

    let info_json = {
        "pin": crypto.createHash('sha256').update(secretValue.pin).digest('hex'),
        "to_address": [to_address],
        "contract_address": secretValue.contract_address,
        "name": name,
        "description": description,
        "image": image_url,
        "sendable": false,
        "send_friend_only": false,
        "layout": "general",
        "attributes": [{
                "trait_type": "시작일시",
                "value": effect_dt,

            }, {
                "trait_type": "종료일시",
                "value": expire_dt,

            },
            {
                "trait_type": "트레이더",
                "value": trader_name,

            },
            {
                "trait_type": "카드종류",
                "value": type,
            },
        ]
    }

    console.log('info_json', info_json);

    const klipLoginData = await getKlipLoginData();
    console.log('[requestCardMint] klipLoginData', klipLoginData)
    let access_token = null;

    if (klipLoginData.result) {
        access_token = klipLoginData.data.access_token
    }
    else {
        return {
            result: false,
            code: klipLoginData.code,
            message: klipLoginData.message,
        }
    }

    //[TASK] Request Klip Check
    const axiosHeader = {
        'Content-Type': 'application/json',
        'Authorization': access_token
    };

    console.log('[requestCardMint] axiosHeader', axiosHeader);
    console.log('[requestCardMint] info_json', info_json);

    const klipCardMintResult = await axios
        .post(
            `${klipInfo.walletUrl}mint`, info_json, { headers: axiosHeader }
        )
        .catch((err) => {
            console.log('[requestCardMint - ERROR] err', err);
            return { error: err.response }
        });
    console.log('klipCardMintResult', klipCardMintResult)
    if (klipCardMintResult.error) {
        console.log('[requestCardMint - ERROR] response', klipCardMintResult.error);
        const data = klipCardMintResult.error.data;
        return {
            result: false,
            data: data,
        }
    }
    else {

        return {
            result: true,
            data: klipCardMintResult.data,
        }
    }
}



module.exports = { requestLogin, requestUploadImage, requestCardMint }
