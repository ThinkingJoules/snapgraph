"use strict";
const {
        snap,
        gunToSnap,
        verifyPermissions,
        clientAuth,
        verifyClientConn,
        clientLeft,
        getAlias,
        getProps
        }=require('./gbase_core/core')
const { fnHelp }=require('./function_lib/functions')




module.exports = {
    snap,
    fnHelp,
    gunToSnap,
    verifyPermissions,
    clientAuth,
    verifyClientConn,
    clientLeft,
    getAlias,
    getProps
}