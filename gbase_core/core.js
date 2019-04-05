"use strict";
let gun
let gbase = {}
let gb = {}
let cache = {} 
let gsubs = {}
let gsubsParams = {}
let gunSubs = {}
let subBuffer = {}
let bufferState = false
let vTable = {}
let reactConfigCB
let gbChainState = true
/*
cache = {baseID: 
            {tval:
                {rowID: [arr Props],
                'li': {rowID: {liRowID: [arr Props]}}
                }
            }
        } //arr index will be the number in the pval; p0 = arr[0]

*/
/*
subBuffer = {baseID: 
                {tval:
                    {rowID: {p0:'a',p1:'b', ...etc},
                    'li': {rowID: {liRowID: {p0:'a',p1:'b', ...etc}}}
                    }
                }
            } //arr index will be the number in the pval; p0 = arr[0]

*/
/*
gsubs = {baseID: 
                {tval:
                    {subID: queryArr}
                }
            }
*/
/*
gsubsParams = {baseID: 
                {tval:
                    {subID: {columns: {p0:true,p2:true,...etc},
                            type: table || row || li
                            range: {idx: base/tval/..., from: unix, to: unix} || false,
                            query: [
                                {search:[args]},
                                {filter:[args]},
                                {sort:[args]}]
                                ] || false,
                            userCB: cb,
                            arrMap: {}
                            }
                    }
                }
            }
*/

const {
    cachePathFromChainPath,
    cachePathFromSoul,
    configPathFromSoul,
    configPathFromChainPath,
    gbForUI,
    gbByAlias,
    setValue,
    setMergeValue,
    getValue,
    getColumnType,
    findLinkingCol,
    getRowPropFromCache,
    cachePathFromRowID,
    setRowPropCacheValue,
    bufferPathFromSoul,
    getAllColumns,
    watchObj,
    formatQueryResults
} = require('./util.js')

const {makehandleConfigChange,
    basicFNvalidity
}= require('./configs')
let handleConfigChange

const {makenewBase,
    makenewStaticTable,
    makenewInteractionTable,
    makenewInteractionColumn,
    makenewColumn,
    makenewRow,
    makelinkColumnTo,
    makeconfig,
    makeedit,
    makesubscribe,
    makeretrieve,
    makelinkRowTo,
    makeimportData,
    makeimportNewTable,
    makeshowgb,
    makeshowcache,
    makeshowgsub,
    makeshowgunsub,
    makeunlinkRow,
    makeclearColumn,
    makeassociateTables,
    makenewLIcolumn,
    makeaddContextLinkColumn,
    makeassociateWith,
    makeunassociate,
    makenewInteraction,
    makeaddListItems,
    makeremoveListItems,
    makesubscribeQuery,
    makeretrieveQuery
} = require('./chain_commands')
let newBase,newStaticTable,newITtable,newIColumn,newColumn,newRow,linkColumnTo,config,edit
const subscribe = makesubscribe(gb,gsubs,requestInitialData)//like a .on()
let retrieve,linkRowTo,unlinkRow,clearColumn,importData,importNewTable,associateTables,newLIcolumn,addContextLinkColumn,associateWith,unassociate
let newInteraction,addListItems,removeListItems,subscribeQuery,retrieveQuery
const showgb = makeshowgb(gb)
const showcache = makeshowcache(cache)
const showgsub = makeshowgsub(gsubsParams)
const showgunsub = makeshowgunsub(gunSubs)

const {makesolve,
    makegetLinks,
    findTruth,
    parseTruthStr,
    regexVar,
    evaluateAllFN
} = require('../function_lib/function_utils');
const getLinks = makegetLinks(gb,getCell)
const solve = makesolve(getLinks)

const {maketableToState,
    makerowToState,
    makebuildRoutes,
    makelinkOptions,
    makefnOptions
} = require('../react_tables/to_state')
let tableToState, rowToState
const buildRoutes = makebuildRoutes(gb)
const linkOptions = makelinkOptions(gb)
const fnOptions = makefnOptions(gb)

const {timeIndex,
    queryIndex,
    timeLog
} = require('../chronicle/chronicle')
let qIndex,tIndex,tLog



startGunConfigSubs()

const gunToGbase = gunInstance =>{
    gun = gunInstance
    //DI after gunInstance is received from outside
    newBase = makenewBase(gun)
    newStaticTable = makenewStaticTable(gun,gb)
    newColumn = makenewColumn(gun,gb)
    newITtable = makenewInteractionTable(gun,gb)
    newIColumn = makenewInteractionColumn(gun,gb)
    newLIcolumn = makenewLIcolumn(gun,gb)
    tLog = timeLog(gun)
    tIndex = timeIndex(gun)
    edit = makeedit(gun,gb,cascade,tLog,tIndex)
    newRow = makenewRow(edit)
    linkRowTo = makelinkRowTo(gun,gb,getCell)
    unlinkRow = makeunlinkRow(gun,gb)
    clearColumn = makeclearColumn(gun,gb,cache,gunSubs,loadColDataToCache)
    importData = makeimportData(gun, gb)
    importNewTable = makeimportNewTable(gun,gb,tLog,tIndex,triggerConfigUpdate)
    associateTables = makeassociateTables(gun,gb)
    handleConfigChange = makehandleConfigChange(gun,gb,cache,gunSubs,loadColDataToCache,newColumn,cascade,solve,tLog)
    linkColumnTo = makelinkColumnTo(gb,handleConfigChange)
    config = makeconfig(gb,handleConfigChange)
    qIndex = queryIndex(gun)
    retrieve = makeretrieve(gun,gb)
    newLIcolumn = makenewLIcolumn(gun,gb)
    addContextLinkColumn = makeaddContextLinkColumn(gun,gb)
    associateWith = makeassociateWith(gun,gb,getCell)
    unassociate = makeunassociate(gun,gb)
    newInteraction = makenewInteraction(gb,edit)
    addListItems = makeaddListItems(edit)
    removeListItems = makeremoveListItems(gun,tLog)
    subscribeQuery = makesubscribeQuery(gb,setupQuery)
    retrieveQuery = makeretrieveQuery(gb,setupQuery)
    tableToState = maketableToState(gb,vTable,subscribeQuery)
    rowToState = makerowToState(gb,subscribeQuery)
    gbase.newBase = newBase
    gbase.ti = tIndex
    gbase.tl = tLog
    gbase.qi = qIndex

    gbase = Object.assign(gbase,gbaseChainOpt())

}

//GBASE INITIALIZATION
/*
---GUN SOULS---
Gun Config Paths:
base/'config'
base/'state' <-- not using this at all
base/tval/'config'
base/tval/pval/'config'
base/tval/'li'/'config'
base/tval/'li'/pval/config

Gun timeindex:
'timeIndex>'base/tval/pval <any 'date' column on any table will have an index {[rowid]: true}
'timeIndex>'base/tval/created <each table will have an index for each row, by 'created' date {[rowid]: true}
'timeIndex>'base/tval/edited <each table will have an index for each row, by last 'edit' date {[rowid]: true}

Gun changelog (time indexed, but instead of souls at timepoints, it is the fields changed on .edit()):
{[pval]: value}
'timeLog>'base/tval/rval/
'timeLog>'base/tval/rval/'li'/rowid/

Gun Data Paths:
base/tval <row existence {[rowID]: alias} // false if row was deleted <<this is basically duplicate of p0 col, but that doesn't exist for Int/Tr tables
base/tval/pval <only for 'static' table data {[rowid]: value}
base/tval/rval <all rows this is 'rowid', transactions stores all root data here
base/tval/rval/'history' <stores all edits, could index these by time (would work for my query check clearing as well...)
base/tval/rval/'links'/pval <static data links {[linkpath]: true}
base/tval/rval/'associations'/pval <valid on all tables {[assocpath]: true}
base/tval/rval/'li' <List of line items, {[rowID]: alias}  see next soul VVV
base/tval/rval/'li'/rowid <rowid is for the instance linked to this row that is being transacted {p0: contextInstance, p1: 1, ...}
base/tval/rval/'context' <only transactions, stores a stringified obj of li instance at time of addition {[contextRowid]: JSON.stringify({p0: 'A row instance', p1:  2, ...})}


*/
function startGunConfigSubs(){
    if(gun){
        gun.get('GBase').on(function(gundata, id){
            let data = Gun.obj.copy(gundata)
            delete data['_']
            for (const key in data) {
                const value = data[key];
                if (value) {
                    let baseconfig = key + '/config'
                    gun.get(baseconfig).on(function(gundata, id){
                        gunSubs[baseconfig] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let configpath = configPathFromSoul(id)
                        setMergeValue(configpath,data,gb)
                        setupTableSubs(key)
                        //setupPropSubs(key)
                        triggerConfigUpdate(id)
                    })
                    let basestate = key + '/state'
                    gun.get(basestate).on(function(gundata, id){
                        gunSubs[basestate] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let histpath = [key,'history']
                        let hist = (data.history) ? data.history : "{}"
                        setMergeValue(histpath,JSON.parse(hist),gb)
                    })
                }
            }
        })    }
    else{
        setTimeout(startGunConfigSubs, 50);
    }
}
function setupTableSubs(baseID){
    let pathArgs = baseID.split('/')
    let tpath = baseID.split('/')
    tpath.push('t')
    let s = tpath.join('/')
    gun.get(s).on(function(gundata, id){
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const tval in data) {
            const value = data[tval];
            if(value){
                let tsoul = pathArgs.slice()
                tsoul.push(tval)
                let tconfig = tsoul.slice()
                tconfig.push('config')
                tsoul = tsoul.join('/')
                handleGunSubConfig(tconfig.join('/'))//will sub if not already subed and merge in gb
                if (value === 'static') {//setup static tables and column subs
                    setupRowSubs(tsoul)
                }else if(value === 'transaction'){
                    setupLIsubs(tsoul)
                }
                setupColumnSubs(tsoul)
            }
        }
    })


}
function setupRowSubs(tpath){
    let [base,tval] = tpath.split('/')
    //loadColDataToCache(base,tval,'p0')
}
function setupColumnSubs(tpath){
    let colPath = tpath.split('/')
    colPath.push('p')
    colPath = colPath.join('/')
    gun.get(colPath).on(function(gundata, id){
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const pval in data) {
            const value = data[pval];
            if (value) {
                let psoul = tpath.split('/')
                psoul.push(pval)
                psoul.push('config')
                psoul = psoul.join('/')
                handleGunSubConfig(psoul)//will sub if not already subed
            }
        }
    })
}
function setupLIsubs(tpath){
    let liPath = tpath.split('/')
    liPath.push('li')
    let liconfig = liPath.slice()
    liconfig.push('config')
    handleGunSubConfig(liconfig.join('/'))
    let s = liPath.join('/')
    gun.get(s).on(function(gundata, id){
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const pval in data) {
            const value = data[pval];
            if (value) {
                let psoul = tpath.split('/')
                psoul.push('li')
                psoul.push(pval)
                psoul.push('config')
                psoul = psoul.join('/')
                console.log(psoul)
                handleGunSubConfig(psoul)//will sub if not already subed
            }
        }
    })
}
function handleGunSubConfig(subSoul){
    //will be table config, column config or p0 col for rows
    let configpath = configPathFromSoul(subSoul)
    let configLoaded = getValue(configpath,gb)
    if(!configLoaded || configLoaded.alias === undefined){//create subscription
        gun.get(subSoul, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
                let configpath = configPathFromSoul(subSoul)
                setMergeValue(configpath,{},gb)
            }
        })
        gun.get(subSoul).on(function(gundata, id){
            gunSubs[subSoul] = true
            let data = Gun.obj.copy(gundata)
            delete data['_']
            if(data.usedIn){
                data.usedIn = JSON.parse(data.usedIn)
            }
            let configpath = configPathFromSoul(subSoul)
            setMergeValue(configpath,data,gb)
            triggerConfigUpdate(id)
        })
        
        
    }else{//do nothing, gun is already subscribed and cache is updating

    }
}
function triggerConfigUpdate(path){
    if(gbChainState){
        gbChainState = false
        setTimeout(updateConfig, 25)
    }
}
function updateConfig(){
    if(reactConfigCB && reactConfigCB.setState){
        let configObj = {}
        configObj.byAlias = gbByAlias(gb)
        configObj.forUI = gbForUI(gb)
        configObj.byGB = gb
        reactConfigCB.setState({config: configObj})
        gbChainState = true
        //console.log(configObj.forUI, configObj.byGB)
    }
}

//CHAIN CONSTRUCTORS
function base(base){
    //check base for name in gb to find ID, or base is already ID
    //return baseChainOpt
    let path
    if(gb[base] !== undefined){
        path = base
    }else{
        for (const baseID in gb) {
            const {alias} = gb[baseID];
            if(base === alias){
                path = baseID
                break
            }
        }
    }
    if(!path){
        throw new Error('Cannot find corresponding baseID for alias supplied')
    }
    let out = baseChainOpt(path)
    return out
}
function table(table){
    //check base for name in gb to find ID, or base is already ID
    //return depending on table type, return correct tableChainOpt
    let base = this._path
    let path
    let tvals = gb[base].props
    let tType
    let check = getValue([base,'props',table],gb)
    if(check !== undefined){
        tType = check.type
        path = table
    }else{
        for (const tval in tvals) {
            const {alias, type} = tvals[tval];
            if(table === alias){
                tType = type
                path = tval
                break
            }
        }
    }
    if(!path){
        throw new Error('Cannot find corresponding ID for alias supplied')
    }
    let out
    let newPath = [base,path].join('/')
    if(tType === 'static'){
        out = staticTableChainOpt(newPath)
    }else{
        out = interactionTableChainOpt(newPath,tType)
    }
    return out
}
function column(column){
    //check base for name in gb to find ID, or base is already ID
    //return depending on table type, return correct columnChainOpt
    let [base,tval] = this._path.split('/')
    let path
    let pvals = gb[base].props[tval].props
    let tType = getValue([base,'props',tval,'type'],gb)
    let check = getValue([base,'props',tval,'props',column],gb)
    let ptype
    if(check !== undefined){
        ptype = check.GBtype
        path = column
    }else{
        for (const pval in pvals) {
            const {alias, GBtype} = pvals[pval];
            if(table === alias){
                ptype = GBtype
                path = pval
                break
            }
        }
    }
    if(!path){
        throw new Error('Cannot find corresponding ID for alias supplied')
    }
    let out
    let newPath = [base,tval,path].join('/')
    if(tType === 'static'){
        out = columnChainOpt(newPath, ptype)
    }else{
        out = interactionColumnChainOpt(newPath)
    }
    return out
}
function row(row){
    //row must be rowID, not alias?
    let [cb,ct,cr,li] = (this._path) ? this._path.split('/') : [false,false]
    let [base,tval,r,l,lir] = String(row).split('/')
    let alias = true
    let tType, out, newPath
    if(this._path !== undefined && cb === base && ct === tval){//should always work
        alias = false
        tType = getValue([cb,'props',ct,'type'],gb)
        newPath = row
    }else if(this._path !== undefined && (cb !== base || ct !== tval)){//passed in alias
        tType = getValue([cb,'props',ct,'type'],gb)
        newPath = [cb,ct,row].join('/')
    }else if(this._path === undefined){//using `gbase.item()` api, should be a rowID 
        alias = false
        tType = getValue([base,'props',tval,'type'],gb)
        newPath = row
    }
    if(tType === undefined){
        throw new Error('Cannot decipher rowID given')
    }
    if(tType === 'static'){
        out = rowChainOpt(newPath, alias)
    }else if(!lir && !li){
        out = interactionRowChainOpt(newPath,tType, alias)
    }else if(li || lir){
        out = liRowChainOpt(newPath, alias)
    }else{
        throw new Error('Cannot determine what row you are trying to get')
    }
    return out
}
function LIcolumn(column){
    let [base,tval,li] = this._path.split('/')
    let path
    let pvals = gb[base].props[tval].li.props
    let check = getValue([base,'props',tval,'li','props',column],gb)
    let ptype
    if(check !== undefined){
        ptype = check.GBtype
        path = column
    }else{
        for (const pval in pvals) {
            const {alias, GBtype} = pvals[pval];
            if(table === alias){
                ptype = GBtype
                path = pval
                break
            }
        }
    }
    if(!path){
        throw new Error('Cannot find corresponding ID for alias supplied')
    }
    let out
    let newPath = [base,tval,'li',path].join('/')
    out = LIcolumnChainOpt(newPath)
    return out
}
function LI(){
    let path = this._path
    let out = LItableChainOpt(path)
    return out
}



//STATIC CHAIN OPTS
function gbaseChainOpt(){
    return {newBase, showgb, showcache, showgsub, showgunsub, solve, base, item: row}
}
function baseChainOpt(_path){
    return {_path, config: config(_path), newStaticTable: newStaticTable(_path), newInteractionTable: newITtable(_path), importNewTable: importNewTable(_path), table}
}
function staticTableChainOpt(_path){
    return {_path, toState: tableToState(_path), config: config(_path), newRow: newRow(_path), newColumn: newColumn(_path), importData: importData(_path), subscribe: subscribeQuery(_path), retrieve: retrieveQuery(_path), associateTables: associateTables(_path), column, row}
}
function interactionTableChainOpt(_path,type){
    let out = {_path, config: config(_path), newRow: newInteraction(_path), newColumn: newIColumn(_path), importData: importData(_path), subscribe: subscribeQuery(_path), retrieve: retrieveQuery(_path), associateTables: associateTables(_path), column,row}
    if(type === 'transaction'){
        out = Object.assign(out,{listItems: LI(_path)})
    }
    return out
}
function interactionColumnChainOpt(_path){
    return {_path, config: config(_path)}
}
function columnChainOpt(_path, GBtype){
    let out = {_path, config: config(_path), clearColumn: clearColumn(_path)}
    if(['string','number'].includes(GBtype)){
        out = Object.assign(out,{linkColumnTo: linkColumnTo(_path)})
    }
    return out
}
function rowChainOpt(_path, _alias){
    return {_path, _alias, edit: edit(_path,false,false,false,_alias), retrieve: retrieveQuery(_path), subscribe: subscribeQuery(_path), linkRowTo: linkRowTo(_path), unlinkRow: unlinkRow(_path), associateWith: associateWith(_path), unassociate: unassociate(_path),toState: rowToState(_path,_alias)}
}
function interactionRowChainOpt(_path, tType, _alias){
    let out = {_path, _alias, edit: edit(_path,false,false,false,_alias), retrieve: retrieve(_path), subscribe: subscribe(_path), associateWith: associateWith(_path), unassociate: unassociate(_path)}
    if(tType === 'transaction'){
        out = Object.assign(out,{listItems: LI(_path)})
    }
    return out
}
function LItableChainOpt(_path){
    return {_path, config: config(_path), addListItems: addListItems(_path), removeListItems: removeListItems(_path), newColumn: newLIcolumn(_path), column:LIcolumn(_path), row:LIrow(_path), subscribe: subscribeQuery(_path), retrieve: retrieveQuery(_path)}
}
function LIcolumnChainOpt(_path){
    return {_path, config: config(_path)}

}
function liRowChainOpt (_path, _alias){
    return {_path, _alias, edit: edit(_path,false,false,false,_alias), retrieve: retrieveQuery(_path)}

}

//CACHE

//these 3 are deprecated
function loadColDataToCache(base, tval, pval){
    //gun.gbase(baseID).loadColDataToCache('t0','p0', this)
    let colSoul = base + '/' + tval + '/' + pval
    let p0soul = [base,tval,'p0'].join('/')
    let path = [base, tval, pval]
    let rows = getValue([base,tval,'p0'], cache)
    let inc = 0
    let isLink = getColumnType(gb,[base,tval,pval].join('/'))
    if(!gunSubs[colSoul]){//create subscription
        if((isLink === 'prev' || isLink === 'next') && rows !== undefined){//get links for all rows for given pval, put in cache
            for (const row in rows) {
                let rowLinks = row +'/links/'+pval
                if(!gunSubs[rowLinks]){//may already be subd from rowprops
                    let rpath = path.slice()
                    rpath.push(row)
                    gun.get(rowLinks, function(msg,eve){//check for existence only
                        eve.off()
                        if(msg.put === undefined){
                            setMergeValue(rpath,[],cache)
                        }
                    })
                    gun.get(rowLinks).on(function(gundata,id){//gundata should be whole node, not just changes
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let links = []
                        for (const key in data) {
                            const torf = data[key];
                            if (torf) {//if current link
                            links.push(key) 
                            }
                        }
                        setValue(rpath,links,cache)
                        handleNewData(colSoul, {[row]:links})
                    })
                }
            }
            gunSubs[colSoul] = true
        }else{//regular data row
            gun.get(colSoul, function(msg,eve){//check for existence only
                eve.off()
                if(msg.put === undefined){
                    if(!gunSubs[colSoul] && gunSubs[p0soul] && rows !== undefined){//first on() call, not p0 col, and p0 col is subd and in cache
                        let nulls = {}
                        for (const key in rows) {
                            nulls[key] = null
                        }
                        setMergeValue(path,nulls,cache)
                    }
                    if(pval === 'p0'){
                        let configpath = configPathFromSoul(colSoul)
                        setMergeValue(configpath,{},gb)
                        //triggerConfigUpdate(colSoul)
                    }
                }
            })
            gun.get(colSoul).on(function(gundata,id){
                let data = Gun.obj.copy(gundata)
                delete data['_']
                if(!inc && gunSubs[p0soul] && rows !== undefined){//first on() call, not p0 col, and p0 col is subd and in cache
                    let nulls = {}
                    for (const key in rows) {
                        nulls[key] = null
                    }
                    let fullList = Object.assign(nulls,data)
                    //console.log(fullList)
                    setMergeValue(path,fullList,cache)
                    handleNewData(colSoul, data)
                }
                setMergeValue(path,data,cache)
                handleNewData(colSoul, data)
                console.log('gun.on()',colSoul)
                if(pval === 'p0'){
                    let configpath = configPathFromSoul(colSoul)
                    setMergeValue(configpath,data,gb)
                    triggerConfigUpdate(id)
                }
                for (const key in data) {//remove stale cached rows
                    let rowpath = [base, tval, 'rows', key]
                    if (getValue(rowpath,cache) !== undefined) {
                        delete cache[base][tval].rows[key] 
                    }
                }
                inc++
            }, {change: true})
            //.off() row prop subs
            for (const on in gunSubs) {//unsubscribe any rowprop subs
                let call = on.split('+')
                let soul = call[0].split('/')
                if(call.length === 2 && soul[2] && soul[2] === pval){//had a sub prop call
                    gun.get(call[0]).get(call[1]).off()
                    gunSubs[on] = false
                }
            }
            gunSubs[colSoul] = true
        } 
    }else{//do nothing, gun is already subscribed and cache is updating

    }
}
function getRow(path, colArr, inc){
    //path should be base/tval/rowid
    //colArr should be array of pvals requested
    //console.log('getting row: '+ path)
    let [base,tval,rowid] = path.split('/')
    let cpath = cachePathFromChainPath(path)
    let fullObj = false
    let cacheValue = getValue(cpath,cache)
    let colsCached = 0
    let partialObj = {}
    if(!colArr){
        colArr = Object.keys(getValue([base, 'props', tval, 'props'],gb))
        fullObj = true
    }
    //console.log('getting row: '+ path + ' with properties:', colArr)
    for (let i = 0; i < colArr.length; i++) {//setup subs if needed
        const pval = colArr[i];
        let colPath = [base, tval, pval, path]
        let data = getValue(colPath, cache)
        //console.log(colPath, data)
        if(data === undefined){//add gun sub to cache
            loadRowPropToCache(path, pval)
        }else{
            colsCached ++
        }
    }
    if(colsCached !== colArr.length && inc <10){//recur and don't return, waiting for cache to load, 10 tries
        //console.log(colsCached, colArr.length)
        inc++
        if(fullObj){
            setTimeout(getRow,50, path, false, inc)
        }else{
            setTimeout(getRow,50, path, colArr, inc)
        }
    }else if(colsCached === colArr.length){
        if(cacheValue !== undefined && fullObj){
            return cacheValue
        }else{
            for (let i = 0; i < colArr.length; i++) {
                const pval = colArr[i];
                let colPath = [pArgs[0],pArgs[1], pval, path]
                let data = getValue(colPath, cache)
                partialObj[pval] = data
            }
            return partialObj
        }
    }else{
        throw new Error('Could not retrieve data from cache after 10 tries')
    }
}
function requestInitialData(path, colArr, reqType){
    //runs on initial subscription to send cached data to sub and set up gun calls, handleNewData will pass noncached data to sub
    //should match setupGsub mostly
    let pathArg = path.split('/')
    let base = pathArg[0]
    let tval = pathArg[1]
    let pval, rowid
    let cachedData = {}
    //generate configs from given args
    if(reqType === 'row'){//row path
        rowid = pathArg[2]
    }else if(reqType === 'column'){//column path
        pval = pathArg[2]
    }else{//table path
        rowid = false
        pval = false
    }
    if(!colArr && (reqType === 'row' || reqType === 'table')){
        colArr = Object.keys(getValue([base, 'props', tval, 'props'],gb))
    }
    if(reqType === 'row'){
        console.log('getting row: '+ path + ' with properties:', colArr)
        cachedData[rowid] = {}
        for (let i = 0; i < colArr.length; i++) {//setup subs if needed
            const pval = colArr[i];
            let colPath = [base,tval, pval, path]
            let data = getValue(colPath, cache)
            //console.log(colPath, data)
            if(data === undefined){//add gun sub to cache
                loadRowPropToCache(path, pval)
            }else{
                cachedData[rowid][pval] = data
            }
        }

    }else if(reqType === 'table'){
        console.log('getting table: '+ path + ' with properties:', colArr)
        let tRows = getValue([base, 'props', tval, 'rows'], gb)
        for (let i = 0; i < colArr.length; i++) {//could have some row subs, but not col sub, sub columns if not already
            const pval = colArr[i];
            let colSoul = base + '/' + tval +'/' + pval
            if(!gunSubs[colSoul]){
                loadColDataToCache(base,tval,pval)
            }
        }
        for (const row in tRows) {
            cachedData[row] = {}
            for (let i = 0; i < colArr.length; i++) {//setup subs if needed
                const pval = colArr[i];
                let rowPath = [base,tval, pval, row]
                let data = getValue(rowPath, cache)
                if(data !== undefined){//add gun sub to cache
                    cachedData[row][pval] = data
                }else{
                    //rest will come though in gun.on()>handleNewData()>user CB
                }
            }
        }
    }else if(reqType === 'column'){
        console.log('getting column: '+ path)
        let colSoul = base + '/' + tval +'/' + pval
        if(!gunSubs[colSoul]){
            loadColDataToCache(base,tval,pval)
        }
        let colPath = [base,tval, pval]
        let data = getValue(colPath, cache)
        if(data !== undefined){
            cachedData = data
        }
    }
    return cachedData
}



function loadRowPropToCache(rowID, pval){
    //path should be base/tval/rowid
    let [base,tval,r,li,lir] = rowID.split('/')
    let {type} = getValue([base,'props',tval],gb)
    if(type === 'static'){
        let colSoul = [base,tval,pval].join('/')
        let [cpath] = cachePathFromRowID(gb,rowID,pval)
        let isLink = getColumnType(gb,colSoul)
        let lType = false
        if(['prev','next'].includes(isLink)){
            lType = '/links/'
        }else if(isLink === 'association'){
            lType = '/associations/'
        }
        let rowLinks = rowID + lType + pval
        let subname = colSoul + '+' + rowID
        if(!gunSubs[rowLinks] && lType){//may already be subd from rowprops
            gun.get(rowLinks, function(msg,eve){//check for existence only
                eve.off()
                if(msg.put === undefined){
                    setRowPropCacheValue(cpath,pval,[],cache)
                }
            })
            gun.get(rowLinks).on(function(gundata,id){//gundata should be whole node, not just changes
                let data = Gun.obj.copy(gundata)
                let links = []
                for (const key in data) {
                    if(key === '_')continue
                    const torf = data[key];
                    if (torf) {//if current link
                        links.push(key) 
                    }
                }
                setRowPropCacheValue(cpath,links,cache)
                handleNewRowPropData(rowID,pval,links) //<<
            })
            gunSubs[rowLinks] = true
        }else if(!gunSubs[subname] && !lType){
            gun.get(colSoul).get(rowID, function(msg,eve){//check for existence only
                eve.off()
                if(msg.put === undefined){
                    setRowPropCacheValue(cpath, null, cache)
                }
            })
            gun.get(colSoul).get(rowID).on(function(value){
                handleNewRowPropData(rowID,pval,value) //<<
                setRowPropCacheValue(cpath,value,cache)
            }) 
            gunSubs[subname] = true
        }else{//do nothing, gun is already subscribed and cache is updating
    
        }
    }else if(!li){//int||tr row prop
        let isLink = getColumnType(gb,[base,tval,pval].join('/'))
        let lType = false
        let [cpath] = cachePathFromRowID(gb,rowID,pval)
        if(['prev','next'].includes(isLink)){
            lType = '/links/'
        }else if(isLink === 'association'){
            lType = '/associations/'
        }
        let rowLinks = rowID + lType + pval
        let subname = rowID + '+' + pval
        loadRowPropToCache([base,tval,r,'li'].join('/'))
        if(!gunSubs[rowLinks] && lType){//may already be subd from rowprops
            gun.get(rowLinks, function(msg,eve){//check for existence only
                eve.off()
                if(msg.put === undefined){
                    setRowPropCacheValue(cpath,[],cache)
                }
            })
            gun.get(rowLinks).on(function(gundata,id){//gundata should be whole node, not just changes
                let data = Gun.obj.copy(gundata)
                delete data['_']
                let links = []
                for (const key in data) {
                    const torf = data[key];
                    if (torf) {//if current link
                    links.push(key) 
                    }
                }
                setRowPropCacheValue(cpath,links,cache)
                handleNewRowPropData(rowID,pval,links)
            })
            gunSubs[rowLinks] = true
        }else if(!gunSubs[subname] && !lType){
            gun.get(rowID).get(pval, function(msg,eve){//check for existence only
                eve.off()
                if(msg.put === undefined){
                    setRowPropCacheValue(cpath, null, cache)
                }
            })
            gun.get(rowID).get(pval).on(function(value,id){
                handleNewRowPropData(rowID,pval,value)
                setRowPropCacheValue(cpath,data,cache)
                let rowpath = [base, tval, 'rows', rowID]
                if (getValue(rowpath,cache) !== undefined) {
                    delete cache[base][tval].rows[rowID] 
                }
                
            }) 
            gunSubs[subname] = true
        }else{//do nothing, gun is already subscribed and cache is updating
    
        }
    }else if(li && lir){
        let [cpath] = cachePathFromRowID(gb,rowID,pval)
        let subname = rowID + '+' + pval
        if(!gunSubs[subname]){
            gun.get(rowID).get(pval, function(msg,eve){//check for existence only
                eve.off()
                if(msg.put === undefined){
                    setRowPropCacheValue(cpath, null, cache)
                }
            })
            gun.get(rowID).get(pval).on(function(value){
                handleNewRowPropData(rowID,pval,value)
                setRowPropCacheValue(cpath,value,cache) 
            }) 
            gunSubs[subname] = true
        }else{//do nothing, gun is already subscribed and cache is updating
    
        } 
    }else if(li && !lir && !pval){
        //for getting the current 'rows' on a particular transaction
        let liSoul = [base,tval,r].join('/') + 'li'
        if(!gunSubs[subname]){
            let licpath = [base,tval,'li',rowID]
            let lips = getValue([base,'props',tval,'li','props'],gb)
            gun.get(liSoul).get(function(msg,eve){//put li's in to cache
                eve.off()
                if(msg.put === undefined){
                    setRowPropCacheValue(licpath, {}, cache)
                }
            })
            gun.get(liSoul).on(function(gundata,id){//get li's
                let data = Gun.obj.copy(gundata)
                for (const key in data) {
                    if(key === '_')continue
                    const torf = data[key];
                    if (torf) {//if current li
                        for (const p in lips) {
                            loadRowPropToCache(key,p)
                        }
                    }
                }
                
            })
            gunSubs[subname] = true
        }else{//do nothing, gun is already subscribed and cache is updating
    
        } 
    }
}
function getCell(rowID,pval){
    let [cpath,cellsub] = cachePathFromRowID(gb,rowID,pval)
    let value = getRowPropFromCache(cpath, cache)
    //let colsub = [base,tval,pval].join('/')
    if(!gunSubs[cellsub] || value === undefined){
        loadRowPropToCache(rowID, pval)
        return
    }else{
        return value
    }
}


//CASCADE
function cascade(rowID, pval, inc){//will only cascade if pval has a 'usedIn'
    try{
        inc = inc || 0
        console.log('cascading:', rowID, pval, inc)
        let [base,tval,r,li] = rowID.split('/')
        let maxTries = 5
        let colconfig = getValue([base,'props',tval,'props',pval], gb)
        if(li){
            colconfig = getValue([base,'props',tval,'li',pval], gb)
        }
        let usedIn = colconfig.usedIn
        let colType = colconfig.GBtype
        if(colconfig === undefined || ['prev','next','association','context','subContext','contextData'].includes(colType) || usedIn.length === 0){return false}
        if(inc === maxTries){
            let err = 'Could not load all dependencies for: '+ rowID
            throw new Error(err)
        }
        let linkCol
        let linkColInfo
        let usedInFN = {}
        let missingData = false
        let checkData = {}
        let toLi = false
        //get links
        for (let i = 0; i < usedIn.length; i++) {
            const path = usedIn[i];
            let [b,t,liOrP] = path.split('/')
            if(li && liOrP === 'p'){
                toLi = true
            }
            [linkCol,linkColInfo] = findLinkingCol(gb,rowID,path)
            if(linkCol === undefined){throw new Error('Cannot resolve "usedIn" reference')}
            if(linkColInfo.GBtype === 'function'){
                checkData[path] = getLinks(rowID,linkColInfo.fn,toLi)
                usedInFN[path] = {rows: [rowID], fn: linkColInfo.fn}
            }else{
                let links = getCell(rowID, linkCol)
                checkData[path] = links
                usedInFN[path] = {rows: links, fn: linkColInfo.fn}
            }
            if(checkData[path] === undefined){
                missingData = true
            }
        }
        if(missingData){//need getCell to resolve before moving on
            //console.log('first',inc,usedInFN)
            inc ++
            setTimeout(cascade,500,rowID,pval,inc)
            return
        }
        for (const upath in usedInFN) {
            const {rows, fn} = usedInFN[upath];
            for (let i = 0; i < rows.length; i++) {
                const rowid = rows[i];
                let check = getLinks(rowid,fn)
                if(check === undefined){
                    missingData = true
                }
            }
        }
        if(missingData){
            //console.log('second',inc,usedInFN)
            inc ++
            setTimeout(cascade,500,rowID,pval,inc)
            return
        }
        //if this far, all data is in cache for solve to work on first try
        for (const upath in usedInFN) {
            const {rows, fn} = usedInFN[upath];
            let [ubase,utval,upval] = upath.split('/')
            for (let i = 0; i < rows.length; i++) {
                const rowid = rows[i];
                let fnresult = solve(rowid,fn)
                console.log(rowID, ' >>> result for >>> ' + rowid +': ', fnresult)
                let call = edit(rowid,false,false,true)
                call({[upval]: fnresult})//edit will call cascade if needed
            }
        }
    }catch(e){
        console.log(e)
    }
}



//EVENT HANDLING AND BUFFER
function flushSubBuffer(){
    let buffer = JSON.parse(JSON.stringify(subBuffer))
    subBuffer = {}
    bufferState = false
    console.log('flushing buffer', buffer)
    for (const base in gsubsParams) {
        let ts = gsubsParams[base]
        for (const tval in ts) {
            const subs = ts[tval];
            for (const subID in subs) {
                let tableBuffer = buffer[base][tval]
                if(tableBuffer){
                    let subParams = subs[subID]
                    handleSubUpdate(subID, subParams, tableBuffer)
                    console.log('Checking Sub:',subID)
                }
            } 
        }
    }
}
function parseRowSub(subParams,tableBuffer){
   
    let trigger = false
    let {allColumns,allRows} = subParams
    for (const rowID in tableBuffer) {
        if(trigger)break
        if(rowID === 'li')continue
        if(!allRows[rowID]){//only singular row of data,must find that row
            continue
        }
        const propObj = tableBuffer[rowID];
        for (const pval of allColumns) {
            if(propObj[pval] !== undefined){
                trigger = true
                break
            }
        }
    }
    return trigger
}
function parseTableSub(subParams,tableBuffer){
    let trigger = []
    let {allColumns} = subParams
    for (const rowID in tableBuffer) {
        if(rowID === 'li')continue
        const propObj = tableBuffer[rowID]; //get propArr from cache, it should be updated since this is running because the cache updated
        for (const pval of allColumns) {
            if(propObj[pval] !== undefined){
                trigger.push(rowID)
                break
            }
        }
    }
    return trigger
}
function parseLiTableSub(subID,subParams,tableBuffer){
    let [path,sID] = subID.split('-')
    let [base,tval,r,li] = path.split('/')
    let liParent = [base,tval,r].join('/')
    let trigger = {}
    let {allColumns,rows} = subParams
    for (const rowID in tableBuffer.li[liParent]) {
        const propObj = tableBuffer.li[liParent][rowID];
        for (const pval of allColumns) {
            if(propObj[pval] !== undefined){
                trigger[rowID] = false
                break
            }
        }
    }
    return trigger
}
function handleSubUpdate(subID, subParams, tableBuffer){
    //subID = base/....-sval
    /* subParams
    {columns: {},
    type: row || table || li
    range: {idx,from,to} || false,
    query: [
        {search:[args]},
        {filter:[args]},
        {sort:[args]}]
        ] || false
    }
    */
    //this is called directly from .edit to see if this row meets any current subs
    let {type} = subParams

    let triggered
    if(type === 'row'){
        triggered = parseRowSub(subParams,tableBuffer)
    }else if(type === 'table'){//table
        triggered = parseTableSub(subParams,tableBuffer)
    }else if(type === 'li'){
        triggered = parseLiTableSub(subID,subParams,tableBuffer.li)
    }
    if(triggered){
        reQuerySub(subID,triggered)
    }
}
function newRowSubCheck(path){
    //this is also called directly from .edit(newRow:true) to see if this row meets any current subs
    let [base,tval] = path.split('/')
    let subs = getValue([base,tval],gsubs)
    for (const subID in subs) {
       reQuerySub(subID,newRow)
    }
}
function reQuerySub(subID,triggers,newRow){
    let [path,sID] = subID.split('-')
    let [base,tval] = path.split('/')
    let {columns,range,query,userCB,allRows} = getValue([base,tval,subID],gsubsParams)
    let q = makeQobj(path,columns,range,query,userCB,true,sID, true)
    if(newRow && q.type !== 'row'){//redo range, to see if new row needs to be added to .rows for table or li subs
        getRange(q)
    }else{//something updated on a row already in .rows, update data in store, and return store
        q.allRows = Array.from(new Set(allRows))
        console.log(triggers.length)
        q.rows = Array.from(new Set(triggers))
        q.next()
    }
     

}
function handleNewRowPropData(rowID,pval,value){
    //parse gun soul and keys in data
    //console.log('handle new Data' ,soul)
    let cpath = bufferPathFromSoul(gb,rowID,pval)
    setValue(cpath,value,subBuffer)
    if(!bufferState){
        bufferState = true
        setTimeout(flushSubBuffer, 250)
    }
}
function setupSub(qObj){
    //subParams will have rows object in it {range: {from,to,idx,items}, type: table,row,li, columns: {p0,p1,etc}, query: [qArr], userCB, allRows}
    let {subID,allRows,allColumns,range,type,columns,query,userCB,arrMap,data,output,needRows} = qObj
    let [path,sVal] = subID.split('-')
    let [base,tval] = path.split('/')
    let subParams = {userCB,query,allRows,range,columns,type,allColumns,arrMap,last:output}
    console.log('setting up or updating sub: '+ subID)
    setValue([base,tval,subID],subParams,gsubsParams)
    for (const soul in needRows) {
        for (const p of allColumns) {
            loadRowPropToCache(soul,p)
        } 
    }
}


function handleNewData(soul, data){ //deprecated
    //parse gun soul and keys in data
    //console.log('handle new Data' ,soul)
    let pathArgs = soul.split('/')
    let base = pathArgs[0]
    let tval = pathArgs[1]
    let pval = pathArgs[2]
    for (const rowid in data) {
        const value = data[rowid];
        setValue([base,tval,rowid,pval], value, subBuffer)
    }
    if(!bufferState){
        bufferState = true
        setTimeout(flushSubBuffer, 250)
    }
    // determine what has changed
    //set new values
}


//QUERY
function setupQuery(path,pvalArr,queryArr,cb,subscription, sVal){
    if(!(cb instanceof Function))throw new Error('Must provide a callback!')
    let testQobj = makeQobj(path,pvalArr,[],[],cb,subscription,sVal)//basically need to parse path to see what type of query this is
    if(testQobj.type !== 'row'){
        let [tRange, parsedQuery] = parseQuery(queryArr,path,pvalArr) //queryArr could be false if it is an ALL or a row
        let qObj = makeQobj(path,pvalArr,tRange,parsedQuery,cb,subscription,sVal)
        getRange(qObj)//qObj carries it's next fn on it.
    }else{//this is a row sub, therefore path is the only range, query is ignored, only 'filters' columns
        testQobj.rows = [path]
        testQobj.allRows = [path]
        testQobj.next()
    }
}
function getRange(qObj){
    //traverse the tRange and find all souls in the range.
    //once all souls are found fire qObj.next() in the callback.
    let [base,tval] = qObj.table.split('/')
    let {type} = getValue([base,'props',tval],gb)
    let {index,to,from,items} = qObj.range
    let idx = index.split('/')
    console.log('Getting Range:', qObj.range)
    qIndex(index,function(data){
        //data is arr of souls
        qObj.allRows = Array.from(data)
        qObj.rows = Array.from(data)
        qObj.next()
    },items,from,to,false,true)
}


function testRowAgainstQuery(propArr,queryParams){ //really this is just the query check on the row, doesn't matter if it's new or old
    //qParams = {range: this.range, type: this.type, columns: this.columns, query: this.query, userCB: this.userCB}
    //called on newRow in .edit()
    //also called on initial subscription on all initial souls
    //also used in retrieve to filter the list
    
    //if it passes return propObj with columns in qParams.columns (what columns the user wants)
    //if it fails, return false
    let now = Date.now()
    let {range, query, columns} = queryParams
    let {to, from, index} = range
    let toUnix, fromUnix
    if(from instanceof Date){
        fromUnix = from.getTime()
    }else{
        fromUnix = from //from should be -Infinity
    }
    if(to instanceof Date){
        toUnix = to.getTime()
    }else{
        toUnix = to //to should be Infinity
    }
    
    let path = index.split('/')
    let idxPval
    let ptest = /p[0-9]+/
    for (const val of path) {
        if(val === 'created'|| val === 'edited'){
            idxPval = false
        }else if(ptest.test(val)){
            idxPval = val
        }
    }
    if(!idxPval){
        if(now <= fromUnix || now >= toUnix){//created or edited is outside of range
            return false
        }
    }else{
        let valIdx = idxPval.slice(1)
        let valDate = new Date(propArr[valIdx]).getTime()
        if(valDate <= fromUnix || valDate >= toUnix){//date column idx specified is outside of range
            return false
        }
    }
    //at this point it has passed the time range
    let pass = true
    for (const q of query) {
        if(!pass)break
        let qType = Object.keys(q)[0]
        let qArgArr = q[qType]
        if(['SORT','GROUP'].includes(qType))continue
        if(qType === 'SEARCH'){
            let reg = regexVar('~', qArgArr[0],'gi')
            let searchPass = false
            for (const val of propArr) {
                if(reg.test(val)){
                    searchPass = true
                    break
                }
            }
            pass = searchPass
        }else if('FILTER'){
            let colRef = /\{(p[0-9/.]+)\}/gi
            let fnString = qArgArr[0].slice()
            let [replace,pval] = colRef.exec(fnString)
            let valIdx = pval.slice(1)
            let val = propArr[valIdx]
            let subdString = fnString.replace(replace,val)
            let fnResolved = evaluateAllFN(subdString)
            pass = findTruth(fnResolved,true)
        }
    }
    if(pass){
        let outArr = []
        for (const pval of columns) {
            let idx = pval.slice(1)
            outArr.push(propArr[idx])
        }
        return outArr //return subset of propArr according to qObj.columns
    }else{
        return false
    }

}
const parseSearch = (obj) =>{
    //obj = {SEARCH: ['String with spaces preserved']}
    let arg = obj.SEARCH[0]
    return {SEARCH: [String(arg)]}
}
let validFilterFN = ['ABS','SQRT','MOD','CEILING','FLOOR','ROUND','INT','COUNT','NOT','T']
const parseFilter = (obj,colArr) =>{
    //obj = {FILTER: ['FN string']}
    //fnString = '{p2} > 3'
    let [fnString] = obj.FILTER
    let colRef = /\{(p[0-9/.]+)\}/gi
    let hasCompare = /[<>=!]/g.test(fnString)
    if(!hasCompare)throw new Error('Must have at least (and only) one comparison operator! Valid operators: <, >, <=, >=, =, !=')
    let found = []
    let match
    while (match = colRef.exec(fnString)) {
        let replace = match[0]
        let pval = match[1]
        found.push(pval)
    }
    let fnSearch = /[A-Z]+(?=\(.+?\))/g
    let fn
    while (fn = fnSearch.exec(fnString)) {
        let FN = fn[0]
        if(!validFilterFN.includes(FN))throw new Error('Invalid FN used inside of "FILTER". Valid FNs :' + validFilterFN.join(', '))
    }
    basicFNvalidity(fnString)
    if(found.length !== 1){
        throw new Error('Can only reference a single column')
    }
    if(!colArr.includes(found[0])) throw new Error('Must include column in your return if you are using it in FILTER')
    return obj
}

const parseRange = (obj,path) =>{
    //obj = {RANGE: [tIndex,from,to,items,relativeTime,__toDate,last__,firstDayOfWeek]}
    //MUST have some sort of timeIndex
    //Needs to end up with a from, to, items
    //from and to must be date obj or unix time
    if(!obj.RANGE)return false
    let [base,tval] = path.split('/')
    let [tIndex,from,to,items, relativeTime, __toDate,last__,firstDayOfWeek] = obj.RANGE
    let out = {}
    if(!tIndex){
        tIndex = [base,tval,'created'].join('/') //default is 'created'
    }
    out.index = tIndex
    if((from || to) && (__toDate || last__ || relativeTime))throw new Error('Too many arguments in RANGE. use "from" & "to" OR "toDate" OR "last" OR "relavtiveTime"')
    if(firstDayOfWeek){
        if(isNaN(firstDayOfWeek)){
            throw new Error('Invalid first day of week. Must be a number between 0-6. Sunday = 0')
        }
    }else{
        firstDayOfWeek = 0
    }
    if(__toDate && !last__){
        let valid = ['year','month','week','day']
        if(!valid.includes(__toDate.toLowerCase()))throw new Error('toDate preset only accepts: '+ valid.join(', '))
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth()
        let dayOfMonth = now.getDate()
        let dayOfWeek = now.getDay()
        switch (__toDate.toLowerCase()) {
            case 'year':
                from = new Date(year,0)
                break;
            case 'month':
                from = new Date(year,month)
                break;
            case 'week':  
                let nd = dayOfWeek
                let fd = firstDayOfWeek
                let diff = 0
                if(nd-fd > 0){
                    diff = nd-fd
                }else if(nd-fd < 0){
                    diff = nd-fd + 7
                }                
                dayOfMonth += diff*-1
                from = new Date(year,month,dayOfMonth)
                break;
            case 'day':
                from = new Date(year,month,dayOfMonth)
                break;
            default:
                break;
        }
    }else if(!__toDate && last__){
        let valid = ['year','quarter','month','week','day']
        if(!valid.includes(last__.toLowerCase()))throw new Error('"last" preset only accepts: '+ valid.join(', '))
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth()
        let dayOfMonth = now.getDate()
        let dayOfWeek = now.getDay()
        switch (last__.toLowerCase()) {
            case 'year':
                from = new Date(year-1,0)
                to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                break;
            case 'quarter':
                let current = (month + 1)/3
                if(current <=1){//q1
                    from = new Date(year-1,8)
                    to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                }else if(current <= 2){
                    from = new Date(year,0)//jan 1
                    to = new Date(year,3,1,0,0,0,-1)//last ms in march
                }else if(current <=3){
                    from = new Date(year,3)//april 1
                    to = new Date(year,5,1,0,0,0,-1)//last ms in june
                }else{
                    from = new Date(year,3)//July 1
                    to = new Date(year,9,1,0,0,0,-1)//last ms in sept
                }
                break;
            case 'month':
                from = new Date(year,month-1)
                to = new Date(year,month,1,0,0,0,-1)//last ms in last month
                break;
            case 'week':  
                let nd = dayOfWeek
                let fd = firstDayOfWeek
                let diff = 0
                if(nd-fd > 0){
                    diff = nd-fd
                }else if(nd-fd < 0){
                    diff = nd-fd + 7
                }                
                dayOfMonth += diff*-1
                from = new Date(year,month,dayOfMonth-7)
                to = new Date(year,month,dayOfMonth,0,0,0,-1)//last ms in yesterday
                break;
            case 'day':
                from = new Date(year,month,dayOfMonth-1)
                to = new Date(year,month,dayOfMonth,0,0,0,-1)//last ms in yesterday
                break;
            default:
                break;
        }
    }
    if(relativeTime){
        //Number() + ...
        //y = year (relative date, from: -365days to: Infinity)
        //m = month (-Number() * 30 days?) not fixed length...
        //w = week (-Number() * 7days)
        //d = day (-Number() of days)
        //h = hours (-Number() of hours)
        let valid = 'ymwdh'
        let num = relativeTime.slice(0,relativeTime.length-1)*1
        let unit = relativeTime[relativeTime.length-1]
        if(isNaN(num))throw new Error('If you are specifiying a relative time it should be some number with a single letter specifying units')
        if(!valid.includes(unit.toLowerCase()))throw new Error('Invalid unit. Must be one of: y, m, w, d, h. (year, month, week, day, hour)')
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth()
        let dayOfMonth = now.getDate()
        let curHour = now.getHours()
        let fromDate = new Date()
        to = Infinity
        switch (unit) {
            case 'y':
                from = fromDate.setFullYear(year-1)
                break;
            case 'm':
                from = fromDate.setMonth(month-1)
                break;
            case 'w':
                from = fromDate.setDate(dayOfMonth-7)
                break;
            case 'd':
                from = fromDate.setDate(dayOfMonth-1)
                break;
            case 'h':
                from = fromDate.setHours(curHour-1)
                break;
            default:
                break;
        }

    }
    
    if(items){
        if(isNaN(items*1))throw new Error('If specifying max items, it must be a number')
        out.items = items*1
    }else{
        out.items = Infinity
    }


    if(from && from instanceof Date){
        out.from = from
    }else if(from && !(from instanceof Date)){
        let d = new Date(from) //if it is unix or anything valid, attempt to make a date
        if(d.toString() !== 'Invalid Date'){
            out.from = d
        }else{
            throw new Error('Cannot parse "from" argument in RANGE')
        }
    }
    if(to && to instanceof Date){
        out.to = to
    }else if(to && !(to instanceof Date)){
        let d = new Date(to) //if it is unix or anything valid, attempt to make a date
        if(d.toString() !== 'Invalid Date'){
            out.to = d
        }else{
            throw new Error('Cannot parse "from" argument in RANGE')
        }
    }
    return out
}
function parseQuery(qArr,path,colArr){
    //qArr optional, if none specified, range is ALL
    //if qArr, if RANGE: parseRange(), if FILTER: checkFunction(), ...rest: validate args
    let out = []
    let t = false
    for (const qArgObj of qArr) {
        if(!Array.isArray(Object.values(qArgObj)[0]))throw new Error('Query arguments must be in an array: [{SEARCH:["String"]}]')
        if(qArgObj.SEARCH){
            out.push(parseSearch(qArgObj))
        }else if(qArgObj.FILTER){
            out.push(parseFilter(qArgObj,colArr))
        }else if(qArgObj.RANGE){
            t = parseRange(qArgObj,path)
        }
    }
    if(!t){
        t = parseRange({RANGE:[]},path)
    }
    return [t,out]
}
function gatherData(qObj){
    let {allColumns, rows, reQuery} = qObj
    console.log('Gathering Data; Rows: '+ rows.length + ' Columns: '+allColumns.join(', '))
    for (const rowID of rows) {
        let [cpath] = cachePathFromRowID(gb,rowID)
        let propArr = getValue(cpath,cache)
        if(propArr && propArr.length >= allColumns.length && !propArr.includes(undefined)){
            qObj.data[rowID] = Array.from(propArr)
            qObj.isRowDone(rowID,true)
        }else{
            for (const pval of allColumns) {
                if (pval !== null){
                    getRowProp(qObj,rowID,pval)
                }else{
                    addDataToQobj(rowID,pval,null,qObj)//fill archived or deleted indices with non-undefined value
                }
                
            }
        }
    }
}
function makeQobj(path, colArr, tRange, qArr, cb, isSub, sVal){
    let [base,tval,r,li,lir] = path.split('/')
    let table = [base,tval].join('/')
    let type
    let hasSearch = (qArr.filter(o => o.SEARCH).length) ? true : false
    let needCols = (!colArr) ? true : false
    colArr = colArr || getAllColumns(gb,[base,tval].join('/'),true)
    let allCols = getAllColumns(gb,[base,tval].join('/'))
    if(!r){
        type = 'table'
    }else if(r || (r && li && lir)){
        type = 'row'
        if(li){
            allCols = getAllColumns(gb,[base,tval,'li'].join('/'))
            if(needCols) colArr = getAllColumns(gb,[base,tval,'li'].join('/'),true)
        }
    }else{ //(r && li && !lir)
        type = 'li'
        allCols = getAllColumns(gb,[base,tval,'li'].join('/'))
        if(needCols) colArr = getAllColumns(gb,[base,tval,'li'].join('/'),true)
    }
    let subID
    if(sVal){
        subID = path + '-' + sVal
    }else{
        let id = Gun.text.random(4)
        subID = path + '-' + id
    }
    let {arrMap,last} = getValue([base,tval,subID],gsubsParams) || {arrMap: false,last:[]}
    return {
        reQuery: (arrMap) ? true : false,
        table,
        path,
        type,
        subscribe: (isSub) ? true : false,
        range: tRange, 
        userCB: cb,
        columns: colArr,
        allColumns: (hasSearch) ? allCols : colArr, //will break if FILTERed on pval not in colArr, currently throws error
        allRows: [],//total rows currently in this.range
        rows: [],//rows to look for on THIS query, allRows !== rows when data has been edited on row in allRows
        needRows: {},//rows that are not in cache, these need subs setup
        query: qArr,
        subID,
        arrMap: arrMap || {},
        retrievedCols: {},//to know if all rowIDs in this.rows has allColumns
        completedRows: [],
        data: {},
        output: last,
        done: function(){
            let added = false, removed = false
            if(this.type !== 'row'){
                if(this.reQuery){
                    for (const rowID of this.rows) {
                        let propArr = this.data[rowID]
                        let pass = this.testRowAgainstQuery(propArr,this.qParams)
                        if(pass && this.arrMap[rowID] === undefined){//add row to output
                            added = true
                            let i = this.output.length
                            this.arrMap[rowID] = i
                            this.output.push([rowID, pass])
                        }else if(!pass && this.allRows.includes(rowID)){//remove row from allRows, last
                            removed = true
                            let i = this.arrMap[rowID]
                            this.output.splice(i,1)
                            delete this.arrMap[rowID]
                        }
                    }
                    if(removed){
                        let j = 0
                        for (const el of this.output) {
                            let [rowid] = el
                            this.arrMap[rowid] = j
                            j++
                        }
                    }
                }else{
                    added = true
                    if(this.output.length)throw new Error('First query should have no previous output')
                    for (const rowID of this.rows) {
                        let propArr = this.data[rowID]
                        let pass = this.testRowAgainstQuery(propArr,this.qParams)
                        if(pass){
                            let i = this.output.length
                            this.arrMap[rowID] = i
                            this.output.push([rowID, pass])
                        }
                    }
                }
            }else{//return row
                this.output = []
                for (const rowID of this.rows) {
                    let propArr = this.data[rowID]
                    console.log(this.data,rowID)
                    console.log(propArr)
                    for (const pval of this.columns) {
                        console.log(pval)
                        let idx = pval.slice(1)
                        console.log(propArr, idx)
                        this.output.push(propArr[idx])
                    }
                }
            }
            if(this.subscribe){
                this.setupSub(this)
            }
            if(this.type === 'row' || added || removed){
                console.log('Returning query to cb on subID: '+subID)
                this.userCB.call(this,this.output,this.columns)
            }
            
        },
        next: function(){//this.data is empty yet
            this.gatherData(this)//this will attempt to get data from cache and then the rest from gun using this.rows and this.allColumns
        },
        get qParams(){
            return {range: this.range, type: this.type, columns: this.columns, query: this.query, userCB: this.userCB, allRows: this.allRows}
        },
        isRowDone: function(rowID,forceDone){
            let rowDone = forceDone || false
            if(!rowDone){
                let propArr = this.retrievedCols[rowID]
                rowDone = (propArr.length === this.allColumns.length) ? true : false
            }
            if(rowDone){
                this.completedRows.push(rowID)
                if(this.completedRows.length === this.rows.length){
                    this.done()
                }
            }
        },
        setupSub,
        gatherData,
        testRowAgainstQuery
        }
}
function addDataToQobj(rowID, pval, data, qObj){
    let idx = pval.slice(1)
    if(!Array.isArray(qObj.data[rowID]))qObj.data[rowID] = []
    if(!Array.isArray(qObj.retrievedCols[rowID]))qObj.retrievedCols[rowID] = []
    qObj.data[rowID][idx] = data
    qObj.retrievedCols[rowID].push(pval)
    qObj.isRowDone(rowID)
}
function getRowProp(qObj, rowID, pval){
    //path should be base/tval/rval
    let [base,tval,r,li,lir] = rowID.split('/')
    let {type} = getValue([base,'props',tval],gb)
    if(type === 'static'){
        let colSoul = [base,tval,pval].join('/')
        let isLink = getColumnType(gb,colSoul)
        let lType = false
        if(['prev','next'].includes(isLink)){
            lType = '/links/'
        }else if(isLink === 'association'){
            lType = '/associations/'
        }
        let rowLinks = rowID + lType + pval
        let subname = colSoul + '+' + rowID
        if(!gunSubs[subname] && lType){//may already be subd from rowprops
            gun.get(rowLinks, function(msg,eve){
                eve.off()
                qObj.needRows[rowID] = true
                if(msg.put === undefined){
                    addDataToQobj(rowID,pval,[],qObj)
                }else{
                    let links = []
                    for (const key in msg.put) {
                        if(key === '_')continue
                        const torf = msg.put[key];
                        if (torf) {//if current link
                            links.push(key) 
                        }
                    }
                    addDataToQobj(rowID,pval,links,qObj)
                }
            })
        }else if(!gunSubs[subname] && !lType){
            gun.get(colSoul).get(rowID, function(msg,eve){
                eve.off()
                qObj.needRows[rowID] = true
                if(msg.put === undefined){
                    addDataToQobj(rowID,pval,null,qObj)
                }else{
                    addDataToQobj(rowID,pval,msg.put,qObj)
                }
            })
        }else{//do nothing, gun is already subscribed and cache is updating
            let val = getRowPropFromCache(cachePathFromRowID(gb,rowID,pval)[0],cache)
            addDataToQobj(rowID,pval,val,qObj)
        }
    }else if(!li){//int||tr row prop
        let isLink = getColumnType(gb,[base,tval,pval].join('/'))
        let lType = false
        if(['prev','next'].includes(isLink)){
            lType = '/links/'
        }else if(isLink === 'association'){
            lType = '/associations/'
        }
        let rowLinks = rowID + lType + pval
        let subname = rowID + '+' + pval
        if(!gunSubs[subname] && lType){
            gun.get(rowLinks, function(msg,eve){
                eve.off()
                qObj.needRows[rowID] = true
                if(msg.put === undefined){
                    addDataToQobj(rowID,pval,[],qObj)
                }else{
                    let links = []
                    for (const key in msg.put) {
                        if(key === '_')continue
                        const torf = msg.put[key];
                        if (torf) {//if current link
                            links.push(key) 
                        }
                    }
                    addDataToQobj(rowID,pval,links,qObj)
                }
            })
        }else if(!gunSubs[subname] && !lType){
            gun.get(rowID).get(pval, function(msg,eve){
                eve.off()
                qObj.needRows[rowID] = true
                if(msg.put === undefined){
                    addDataToQobj(rowID,pval,null,qObj)
                }else{
                    addDataToQobj(rowID,pval,msg.put,qObj)
                }
            })
        }else{//do nothing, gun is already subscribed and cache is updating
            let val = getRowPropFromCache(cachePathFromRowID(gb,rowID,pval),cache)
            addDataToQobj(rowID,pval,val,qObj)
        }
    }else if(li && lir){
        let subname = rowID + '+' + pval
        if(!gunSubs[subname]){
            gun.get(rowID).get(pval, function(msg,eve){
                eve.off()
                qObj.needRows[rowID] = true
                if(msg.put === undefined){
                    addDataToQobj(rowID,pval,null,qObj)
                }else{
                    addDataToQobj(rowID,pval,msg.put,qObj)
                }
            })
        }else{
            let val = getRowPropFromCache(cachePathFromRowID(gb,rowID,pval)[0],cache)
            addDataToQobj(rowID,pval,val,qObj)
        }
    }
}




//REACT STUFF
function loadGBaseConfig(thisReact){
    reactConfigCB = thisReact

}



//WIP___________________________________________________





//OLD WRANGLER STUFF


function archive(){
    let gun = this;
    let gunRoot = this.back(-1)
    let result = {}
    let type
    let nodeSoul = gun['_']['soul'] || false
    if(!nodeSoul){
        return console.log('Must select a node with known nodeType. ie; .get("nodeType/00someID00").archive()')}
    gun.on(function(archiveNode){
        type = archiveNode['!TYPE']
        let forceDelete = archiveNode['!DELETED'] || false
        let props = GB[type].whereTag
        for (let i = 0; i < props.length; i++){
            result[props[i]] = {add: [],remove: []}
            gun.get(props[i]).once(function(tags){
                for (const key in tags) {
                    if(forceDelete && tags[key] !== '_' && tags[key] !== '!ARCHIVED'){
                        result[props[i]].remove.push(key) //null all tags even if they are '0'
                    }else if(tags[key] == 1){
                        gun.get(props[i]).get('!ARCHIVED').get(key).put(1)
                        result[props[i]].remove.push(key)
                    }
                }
            })
        }
        gun.get('!DELETED').put(true)
        gunRoot.get('!TYPE/'+type).get(nodeSoul).put(null)
        gunRoot.get('!TYPE/'+type+'/ARCHIVED').get(nodeSoul).put({'#': nodeSoul})
        console.log(result)

    })
    console.log(result)
    handleTags(gun,result,type)
}
function unarchive(){
    let gun = this;
    let gunRoot = this.back(-1)
    let type
    let result = {}
    let nodeSoul = gun['_']['soul'] || false
    if(!nodeSoul){
        return console.log('Must select a node with known nodeType. ie; .get("nodeType/00someID00").archive()')}
    gun.on(function(archiveNode){
        type = archiveNode['!TYPE']
        let props = GB[type].whereTag
        for (let i = 0; i < props.length; i++){
            result[props[i]] = {add: [],remove: []}
            gun.get(props[i]).get('!ARCHIVED').once(function(tags){
                for (const key in tags) {
                    if(tags[key] == 1){
                        
                        result[props[i]].add.push(key)
                    }
                }
            })
            gun.get(props[i]).get('!ARCHIVED').put(null)
        }
        gun.get('!DELETED').put(false)
        gunRoot.get('!TYPE/'+type).get(nodeSoul).put({'#': nodeSoul})
        gunRoot.get('!TYPE/'+type+'/ARCHIVED').get(nodeSoul).put(null)

    })
    console.log(result)
    handleTags(gun,result,type)
}
function deleteNode(){
    let gun = this;
    let gunRoot = this.back(-1)
    let fromNodeSoul = gun['_']['soul'] || false
    if(!fromNodeSoul){
        return console.log('Must select a node with known nodeType. ie; gun.get("nodeType/654someID123").delete()')}
    let check = new Promise( (resolve, reject) => {
        let exist = gun.then()
        resolve(exist)
    })
    check.then( (data) => {
        let fromType = data['!TYPE']
        let nextKey = Object.keys(GB[fromType]['next'])[0] //should only ever be a sinlge next key
        let prevKeys = Object.keys(GB[fromType]['prev'])
        gun.get(nextKey).on( (ids) => {
                for (const key in ids) {
                    if(ids[key] !== null){
                        gun.get(key).unlink(gunRoot.get(fromNodeSoul))
                    }
                }
            })
        for (let i = 0; i < prevKeys.length; i++) {
            const prop = prevKeys[i];
            gun.get(prop).on(function(ids){
                for (const key in ids) {
                    if(ids[key] !== null){
                        gun.get(fromNodeSoul).unlink(gunRoot.get(key))
                    }
                }
            })
        }



        // gun.once(function(archiveNode){//null out fields
        //     let type = archiveNode['!TYPE']
        //     gunRoot.get('!TYPE/'+type+'/ARCHIVED').get(fromNodeSoul).put(null)
        //     gunRoot.get('!TYPE/'+type+'/DELETED').get(fromNodeSoul).put({'#': fromNodeSoul})
        //     for (const key in archiveNode) {
        //         if(key !== '_' || key !== '!DELETED'){//otherwise we break things
        //             gun.get(key).put(null)
        //         }
        //     }
            
        // })
    })
}


async function assembleTree(gun, node, fromID, archived, max, inc, arr){
    let res
    let idRef
    let newNode
    if(inc === undefined){//initial call
        newNode = Gun.obj.copy(node)
        inc = 0
        max = max || Infinity
        arr = [[],[]];
        let arrObj = {id: fromID,
                    data: newNode,
                    from: false,
                    prop: false
                    }   
        arr[0][0] = arrObj
        res = [node, arr]
        fromID = fromID
        
    }
    if(inc == max){return}
    //console.log(inc)
    inc++
    let refsToTraverse = Object.keys(GB[node['!TYPE']]['prev'])
    if (refsToTraverse){
        for (let i = 0; i < refsToTraverse.length; i++){
            if (node[refsToTraverse[i]]){
                if(!Array.isArray(arr[inc])){arr[inc] = []}
                let lookup = node[refsToTraverse[i]]["#"]
                let id = {id: lookup} //arr
                idRef = Object.assign({}, id) //arr
                let subthings = []
                //console.log(lookup)
                let propRef = await gunGetListNodes(gun, lookup)
                propRef.map(function(node){
                    let subNode = Gun.obj.copy(node)

                    if(!archived && subNode['!DELETED']){
                        
                    }else{
                        subthings.push(subNode)
                        let newObj = Object.assign({}, subNode)
                        let nodeInfo = {data: newObj,
                                        from: fromID,
                                        prop: refsToTraverse[i]}
                        let arrObj = Object.assign({}, idRef, nodeInfo)
                        arr[inc].push(arrObj)
                    }
                })
            node[refsToTraverse[i]] = Gun.obj.copy(subthings)
            }
        }
        //console.log(node)
        //console.log(arr)
        for (let i = 0; i < refsToTraverse.length; i++){
            if (node[refsToTraverse[i]]){
                for (let j = 0; j < node[refsToTraverse[i]].length; j++){
                let nextLevel = node[refsToTraverse[i]][j]
                assembleTree(gun, nextLevel, idRef.id, archived, max, inc, arr);//fires for each prop with refs, and once for each ref on said prop
                }
            }
        }
    }
    //accumulate math?
    return res; // Should return the full tree
}

function reduceRight(treeArr, method , acc){
    acc = acc || false //accumulate all mapper returns to single value, if false, will tree reduce
    let reduced = 0
    let calcArr = JSON.parse(JSON.stringify(treeArr))//?
    treeArr.push(calcArr)
    for (let i = calcArr.length-1; i > -1; i--){
        for (let j = 0; j < calcArr[i].length; j++){
            let node = (calcArr[i][j].data) ? calcArr[i][j].data : calcArr[i][j]//?
            let fromID = calcArr[i][j].from
            let fromProp = calcArr[i][j].prop
            if(node && !node['!DELETED']){
                let mapper = GB[node['!TYPE']]["methods"][method]
                let res = mapper(node)
                reduced += res
                console.log(calcArr[i][j])
                calcArr[i][j].data = res//?
                //let parent = _.find(calcArr[i-1], ['id', fromID])
                let parent = (calcArr[i-1]) ? calcArr[i-1].find(function(i){
                    return i.id == fromID
                }) : undefined
                if(!parent){
                    console.log(reduced)
                    treeArr = res
                }else{
                    if(typeof parent.data[fromProp] !== 'number'){//if it is a ref, replace with first value
                    parent.data[fromProp] = res
                    }else{
                        parent.data[fromProp] += res //if not a ref, then take old value and add it to new value
                        console.log(calcArr)
                    }
                }
            }
        }
    }
    let ret = (acc) ? reduced : treeArr
    return ret
}
function generateTreeObj(startNodeID, opt){
    let gun = this.back(-1)
    let archived = (opt) ? opt.archived || false : false
    let max = (opt) ? opt.max || undefined : undefined
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
    let tree = gunGet(gun,startNodeID).then(parentNode =>{
        let copy = Gun.obj.copy(parentNode) 
        return assembleTree(gun, copy, startNodeID, archived, max)})
    return tree
}
function generateTreeArr(startNodeID, max, archived){
    let gun = this.back(-1)
    archived = archived || false
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
	let parentNode
	gun.get(startNodeID).on(e => parentNode = Gun.obj.copy(e))
    let tree = assembleTree(gun, parentNode, startNodeID, archived, max)//?
    return tree[1]
}
function treeReduceRight(startNodeID, method, acc, max){
    let gun = this.back(-1)
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
	let parentNode
	gun.get(startNodeID).on(e => parentNode = Gun.obj.copy(e))
    let tree = assembleTree(gun, parentNode, startNodeID, false, max)//?
    let methodCalc = reduceRight(tree[1], method, acc)
    return methodCalc
}

//Tree Logic



module.exports = {
    buildRoutes,
    getRow,
    tableToState,
    rowToState,
    loadGBaseConfig,
    gbase,
    gunToGbase,
    linkOptions,
    fnOptions,
    formatQueryResults
}