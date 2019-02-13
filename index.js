"use strict";
var globalVar = require("global");
const {
        buildRoutes,
        getRow,
        tableToState,
        rowToState,
        loadGBaseConfig,
        gbase,
        gunToGbase,
        }=require('./gbase_core/core')


if(typeof window !== "undefined"){
    var Gun = globalVar.Gun;
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
    gbase
}