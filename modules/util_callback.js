const dbHandler = require('../modules/util_rds.js');
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

    const connection = await dbHandler.connectRDSProxy(process.env.REGION, process.env.PROXY_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)

    const serviceCallbackGetResult = await new Promise((resolve, reject) => {
        connection.query(dbQuery.service_callback_get.queryString, [serviceCallbackSeq], function(error, results, fields) {
            if (error) reject(error);
            console.log('results', results);
            let records = [];
            for (let value of results) {
                records.push({
                    callbackUrl: value.callback_url,
                });
            }
            resolve(records);
        });
    }).catch((error) => {
        return { error: error }
    });
    console.log('serviceCallbackGetResult', serviceCallbackGetResult);

    if (serviceCallbackGetResult.error) {
        console.log('serviceCallbackGetResult', serviceCallbackGetResult.error)
    }
    if (serviceCallbackGetResult.length > 0) {
        // 0 보다 크다는 것은 ready status;
        const serviceCallbackUrl = serviceCallbackGetResult[0].callbackUrl
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
        const serviceCallbackUpdateResult = await new Promise((resolve, reject) => {
            connection.query(dbQuery.service_callback_update.queryString, [wrappedServiceCallbackUrl, serviceCallbackStatus, serivceCallbackResult, serviceCallbackSeq], function(error, results, fields) {
                if (error) reject(error);
                console.log('results', results);
                resolve(results);
            });
        }).catch((error) => {
            return JSON.stringify(error);
        });
        console.log('serviceCallbackUpdateResult', serviceCallbackUpdateResult)
        return serviceCallbackUpdateResult;

    }

}

module.exports = { RequestServiceCallbackUrl }
