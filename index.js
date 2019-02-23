"use strict";
const {
        buildRoutes,
        getRow,
        tableToState,
        rowToState,
        loadGBaseConfig,
        gbase,
        gunToGbase,
        linkOptions,
        fnOptions
        }=require('./gbase_core/core')
const { fnHelp }=require('./function_lib/functions')


if(typeof window !== "undefined"){
    var Gun = window.Gun;
}else{
    var Gun = global.Gun;
}
if (!Gun)
throw new Error("gundb-gbase: Gun was not found globally!");


gunchain(Gun.chain);


function gunchain(Gunchain) {
    Gunchain.gbase = gunToGbase
}

module.exports = {
    buildRoutes,
    getRow,
    tableToState,
    rowToState,
    loadGBaseConfig,
    gbase,
    linkOptions,
    fnOptions,
    fnHelp
}