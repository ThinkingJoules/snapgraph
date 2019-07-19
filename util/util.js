const {parseSoul,makeSoul,configPathFromChainPath,ALL_ADDRESSES,getValue,findID,findConfigFromID} = require('../gbase_core/util')
const makegetAlias = (gb) => (baseOrAddress,pval)=>{
    if(ALL_ADDRESSES.test(baseOrAddress)){
        let {alias} = getValue(configPathFromChainPath(baseOrAddress), gb) || {}
        return alias
    }else{
        let b
        for (const baseID in gb) {
            const {alias} = gb[baseID];
            if(String(baseID) === base || String(alias) === base){
                b = baseID
                break
            }
        }
        if(!b)throw new Error('Cannot find the base you specified')
        let {alias} = findConfigFromID(gb,makeSoul({b}),pval) || {}
        return alias
    }
}
const makegetProps = (gb) => (base,type,opts) => {
    //base can be either baseID or baseAlias
    //type can be either typeID or the alias
    //need to figure out if type is a t or r
    //use a string object w/meta, then call toString()??
    let b
    for (const baseID in gb) {
        const {alias} = gb[baseID];
        if(String(baseID) === base || String(alias) === base){
            b = baseID
            break
        }
    }
    if(!b)throw new Error('Cannot find the base you specified')
    let typeID
    let isT = findID(gb,type,makeSoul({b,t:true}))
    let isR = findID(gb,type,makeSoul({b,r:true}))
    typeID = isT || isR
    if(!typeID)throw new Error('Cannot find the type of thing you specified')
    let {hidden,archived} = opts || {}
    hidden = !!hidden
    archived = !!archived
    let {props} = findConfigFromID(gb,makeSoul({b}),typeID)
    let out = []
    for (const p in props) {
        const {hidden:h,archived:a,deleted,sortval} = props[p];
        if ((h && hidden || !h) && (a && archived || !a) && !deleted) {
            out[sortval] = p
        }
    }
    return out.filter(n => n!==undefined)
}

module.exports = {
    makegetAlias,
    makegetProps
}