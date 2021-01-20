const dbHandler = require('../modules/util_rds.js');
const dbQuery = require('../resource/sql.json');


const InsertLogSeq = async function(table, tableId, type, code, message) {
    console.log('InsertLogSeq table', table)
    console.log('InsertLogSeq tableId', tableId)
    console.log('InsertLogSeq type', type)
    console.log('InsertLogSeq code', code)
    console.log('InsertLogSeq message', message)

    const connection = await dbHandler.connectRDSProxy(process.env.REGION, process.env.PROXY_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER);


    var inserErrorLogResult = await new Promise((resolve, reject) => {
        connection.query(dbQuery.error_log_insert.queryString, [type, code, message], function(error, results, fields) {
            if (error) throw error;
            console.log('results', results);
            resolve(results);
        });
    }).catch((error) => {
        return { error: JSON.stringify(error) }
    });
    console.log('inserErrorLogResult', inserErrorLogResult);


    const logSeq = inserErrorLogResult.insertId
    console.log('inserErrorLogResult logSeq', logSeq)

    if (table === 'reward') {
        var updateRewardResult = await new Promise((resolve, reject) => {
            connection.query(dbQuery.reward_log_update.queryString, [logSeq, tableId], function(error, results, fields) {
                if (error) throw error;
                console.log('updateRewardResult results', results);
                resolve(results);
            });
        }).catch((error) => {
            console.log('updateRewardResult error', error);
            return { error: error }
        });
        console.log('updateRewardResult', updateRewardResult);
    }
    else if (table === 'transfer') {
        var updateTransferResult = await new Promise((resolve, reject) => {
            connection.query(dbQuery.transfer_log_update.queryString, [logSeq, tableId], function(error, results, fields) {
                if (error) throw error;
                console.log('updateTransferResult results', results);
                resolve(results);
            });
        }).catch((error) => {
            console.log('updateTransferResult error', error);
            return { error: error }
        });
        console.log('updateTransferResult', updateTransferResult);
    }

    if (logSeq) {
        console.log('return logseq')
        return logSeq
    }
    else {
        console.log('return zero')
        return 0;
    }
}

module.exports = { InsertLogSeq }
