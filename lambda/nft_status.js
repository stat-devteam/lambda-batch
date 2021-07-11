"use strict";

var AWS = require('aws-sdk');
const dbPool = require('../modules/util_rds_pool.js');
const dbQuery = require('../resource/sql.json');
const psHandler = require('../modules/util_ps.js');
var Base64 = require("js-base64");
var axios = require("axios").default;
const smHandler = require('../modules/util_sm.js');
var _ = require('lodash');

exports.handler = async function(event) {
    console.log('[nft_status]')
    //유저가 클립에서 NFT를 삭제했을 경우, status deleted로 업데이트
    console.log('[EVENT]', event);

    const isMaintenance = await psHandler.getParameterStoreValue(process.env.PARAMETER_STORE_VALUE, 'batch', null);
    console.log('isMaintenance', isMaintenance)
    if (isMaintenance) {
        const message = JSON.parse(Base64.decode(isMaintenance)).message
        console.log('[Maintenance]', message)
    }
    else {
        try {
            const pool = await dbPool.getPool();

            // NFT 조회의 경우 release 버전의 kas info를 사용 (dev, release 모두)
            const secretValue = await smHandler.getSecretValue('stat-release-kas-sm');

            let all_nft_list = []
            //[TASK] get All NFT List
            // NFT 조회의 경우 release 버전의 x_chain_id 8217을 고정으로 사용(dev, release 모두)
            // NFT 조회의 경우 release 버전의 contract 주소도고정으로 사용(dev, release 모두)
            let cursor = 'start';
            while (cursor) {
                const RELEASE_CONTRACT_ADDRESS = '0x74de529b202b36af76fd1d6a0e2609de72a2dc8d';
                let target_url = null;
                if (cursor === 'start') {
                    target_url = `https://th-api.klaytnapi.com/v2/contract/nft/${RELEASE_CONTRACT_ADDRESS}/token`;

                }
                else {
                    target_url = `https://th-api.klaytnapi.com/v2/contract/nft/${RELEASE_CONTRACT_ADDRESS}/token?cursor=${cursor}`;

                }
                const axiosHeader = {
                    'Authorization': secretValue.kas_authorization,
                    'Content-Type': 'application/json',
                    'x-chain-id': 8217,
                };
                console.log('[Get Card Information] axiosHeader', axiosHeader);
                const klip_card_information_result = await axios
                    .get(
                        target_url, { headers: axiosHeader }
                    )
                    .catch((err) => {
                        console.log('[Get Card Information - ERROR] err', err);
                        return { error: err.response }
                    });

                console.log('klip_card_information_result', klip_card_information_result)
                let result_list = klip_card_information_result.data.items;
                console.log('result_list', result_list)
                console.log('result_list.length', result_list.length);
                all_nft_list.push(...result_list);
                cursor = klip_card_information_result.data.cursor;
                console.log('cursor', cursor)
            }
            console.log('all_nft_list', all_nft_list);
            console.log('all_nft_list.length', all_nft_list.length);

            //klip에서 삭제를 하게 될 경우, owner가 0x0000000000000000000000000000000000000001로 변경됨.
            let deleted_nft_list = [];
            for (let i in all_nft_list) {
                let target_owner = all_nft_list[i].owner;
                if (target_owner === '0x0000000000000000000000000000000000000001') {
                    deleted_nft_list.push(all_nft_list[i]);
                }
            }
            console.log('deleted_nft_list', deleted_nft_list)

            //[TASK] check success nft list
            let deleted_tx_hash_list = [];
            const [nft_success_list_page_count, f1] = await pool.query(dbQuery.nft_success_list_page_count.queryString, []);
            console.log('nft_success_list_page_count', nft_success_list_page_count);
            const total_count = nft_success_list_page_count[0].count;
            console.log('total_count', total_count)
            let current_count = 0;
            while (total_count > current_count) {
                console.log('current_count', current_count)
                const [nft_success_list_page, f1] = await pool.query(dbQuery.nft_success_list_page.queryString, [current_count, 1000]);
                current_count = current_count + 10;
                console.log('nft_success_list_page', nft_success_list_page)
                console.log('nft_success_list_page.length', nft_success_list_page.length)
                for (let i in nft_success_list_page) {
                    let taregt_nft = nft_success_list_page[i];
                    let target_tx_hash = taregt_nft.tx_hash;
                    let find_result = _.find(all_nft_list, function(o) { return o.transactionHash === target_tx_hash });
                    console.log('find_result', find_result)
                    if (!find_result) {
                        deleted_tx_hash_list.push(target_tx_hash)
                    }
                }
            }
            console.log('deleted_tx_hash_list', deleted_tx_hash_list)
            const [nft_delete_update_by_tx_hashs, f2] = await pool.query(dbQuery.nft_delete_update_by_tx_hashs.queryString, [deleted_tx_hash_list]);
            console.log('nft_delete_update_by_tx_hashs', nft_delete_update_by_tx_hashs)

        }
        catch (err) {
            console.log(err);
        }
    }
};
