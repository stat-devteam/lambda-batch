"use strict";

const DELEGATED_LIST = [
    'TxTypeFeeDelegatedValueTransfer',
    'TxTypeFeeDelegatedValueTransferMemo',
    'TxTypeFeeDelegatedSmartContractDeploy',
    'TxTypeFeeDelegatedSmartContractExecution',
    'TxTypeFeeDelegatedAccountUpdate',
    'TxTypeFeeDelegatedCancel',
    'TxTypeFeeDelegatedChainDataAnchoring'
]

const DelegatedCheck = function(data) {

    if (data.type) {
        return DELEGATED_LIST.includes(data.type)
    }
    else {
        return false;
    }

}

module.exports = { DelegatedCheck }
