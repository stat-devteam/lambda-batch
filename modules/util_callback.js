'use strict';

const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');
var axios = require("axios").default;


const checkSearchStringExist = (str) => {
    const splitStringList = str.split('?');
    if (splitStringList.length === 1) {
        return false;
    }
    else {
        return true;
    }
}


const RequestServiceCallbackUrl = async function(serviceCallbackSeq, searchString) {

    try {
        const pool = await dbPool.getPool();
        const [serviceCallbackGetResult, f1] = await pool.query(dbQuery.service_callback_get.queryString, [serviceCallbackSeq]);

        if (serviceCallbackGetResult.length > 0) {
            // 0 보다 크다는 것은 ready status;
            const serviceCallbackUrl = serviceCallbackGetResult[0].callback_url
            const searchStringExist = checkSearchStringExist(serviceCallbackUrl);
            let wrappedServiceCallbackUrl = null;
            if (searchStringExist) {
                wrappedServiceCallbackUrl = serviceCallbackUrl + '&' + searchString
            }
            else {
                wrappedServiceCallbackUrl = serviceCallbackUrl + '?' + searchString
            }
            console.log('searchStringExist', searchStringExist)
            console.log('wrappedServiceCallbackUrl', wrappedServiceCallbackUrl)

            //create Klaytn account
            const axiosHeader = {
                'Content-Type': 'application/json',
            };

            const requestCallbackResponse = await axios
                .get(wrappedServiceCallbackUrl, {
                    headers: axiosHeader,
                })
                .catch((err) => {
                    console.log('service callback error', err);
                    //status fail insert  해주긴 해야함
                    return { error: err };
                });
            console.log('requestCallbackResponse', requestCallbackResponse);

            let serivceCallbackResult = null;
            let serviceCallbackStatus = null;

            if (requestCallbackResponse.error) {
                //fail 업데이트
                serviceCallbackStatus = 'fail';
                serivceCallbackResult = JSON.stringify(requestCallbackResponse.error);
            }
            else {
                //성공 업데이트
                serviceCallbackStatus = 'success';
                serivceCallbackResult = JSON.stringify(requestCallbackResponse.data);
            }

            // get service callback seq row
            const [serviceCallbackUpdateResult, f2] = await pool.query(dbQuery.service_callback_update.queryString, [wrappedServiceCallbackUrl, serviceCallbackStatus, serivceCallbackResult, serviceCallbackSeq]);
            console.log('serviceCallbackUpdateResult', serviceCallbackUpdateResult)
            return serviceCallbackUpdateResult;
        }
    }
    catch (err) {
        console.log(err);
    }

}

module.exports = { RequestServiceCallbackUrl }
