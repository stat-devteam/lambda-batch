'use strict';

const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');


const InsertLogSeq = async function(table, tableId, type, code, message) {
    console.log('InsertLogSeq table', table)
    console.log('InsertLogSeq tableId', tableId)
    console.log('InsertLogSeq type', type)
    console.log('InsertLogSeq code', code)
    console.log('InsertLogSeq message', message)

    try {
        const pool = await dbPool.getPool();
        const [inserErrorLogResult, f1] = await pool.query(dbQuery.error_log_insert.queryString, [type, code, message]);

        const logSeq = inserErrorLogResult.insertId
        console.log('inserErrorLogResult logSeq', logSeq)

        if (table === 'reward') {
            const [updateRewardResult, f2] = await pool.query(dbQuery.reward_log_update.queryString, [logSeq, tableId]);
            console.log('updateRewardResult', updateRewardResult);
        }
        else if (table === 'transfer') {
            const [updateTransferResult, f3] = await pool.query(dbQuery.transfer_log_update.queryString, [logSeq, tableId]);
            console.log('updateTransferResult', updateTransferResult);
        }
        else if (table === 'nft') {
            const [updateNftResult, f4] = await pool.query(dbQuery.nft_log_update.queryString, [logSeq, tableId]);
            console.log('updateNftResult', updateNftResult);
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
    catch (err) {
        console.log(err);
    }
}

module.exports = { InsertLogSeq }
