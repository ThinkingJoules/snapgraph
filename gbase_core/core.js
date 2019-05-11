"use strict";
let isNode
if(typeof window !== "undefined"){
    var Gun = window.Gun;
    isNode = false
}else{
    var Gun = global.Gun;
    isNode = true
}
if (!Gun)
throw new Error("gundb-gbase: Gun was not found globally!");
let Radisk
let Radix
let radata
const esc = String.fromCharCode(27)
if(typeof window === "undefined"){//if this is running on a server
    Radisk = (Gun.window && Gun.window.Radisk) || require('gun/lib/radisk');
    Radix = Radisk.Radix;
    const RFS = require('gun/lib/rfs')({file: 'radata'})
    radata = Radisk({store: RFS})
}
let gun
let gbase = {}
let gb = {}
let cache = {} 
let gsubs = {}
let gsubsParams = {}
let gunSubs = {}
let subBuffer = {}
let bufferState = false
let reactConfigCB
let gbChainState = true

const {
    cachePathFromChainPath,
    configPathFromSoul,
    configPathFromChainPath,
    gbForUI,
    gbByAlias,
    setValue,
    setMergeValue,
    getValue,
    getPropType,
    getDataType,
    findLinkingCol,
    getRowPropFromCache,
    cachePathFromRowID,
    setRowPropCacheValue,
    bufferPathFromSoul,
    getAllColumns,
    watchObj,
    formatQueryResults,
    hasColumnType,
    makeSoul,
    parseSoul
} = require('./util.js')

const {makehandleConfigChange,
    basicFNvalidity
}= require('./configs')
let handleConfigChange

const {makenewBase,
    makenewNodeType,
    makeaddProp,
    makenewNode,
    makelinkColumnTo,
    makeconfig,
    makeedit,
    makelinkRowTo,
    makeimportData,
    makeimportNewTable,
    makeshowgb,
    makeshowcache,
    makeshowgsub,
    makeshowgunsub,
    makeunlinkRow,
    makeassociateTables,
    makeassociateWith,
    makeunassociate,
    makesubscribeQuery,
    makeretrieveQuery,
    makesetAdmin,
    makenewGroup,
    makeaddUser,
    makeuserAndGroup,
    makechp
} = require('./chain_commands')
let newBase,newNodeType,addProp,newNode,linkColumnTo,config,edit
let linkRowTo,unlinkRow,clearColumn,importData,importNewTable,associateTables,associateWith,unassociate
let subscribeQuery,retrieveQuery,setAdmin,newGroup,addUser,userAndGroup,chp
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


const {timeIndex,
    queryIndex,
    timeLog
} = require('../chronicle/chronicle')
let qIndex,tIndex,tLog



const gunToGbase = (gunInstance,baseID) =>{
    gun = gunInstance
    startGunConfigSubs(baseID)
    //DI after gunInstance is received from outside
    newBase = makenewBase(gun)
    newNodeType = makenewNodeType(gun,gb)
    addProp = makeaddProp(gun,gb)

    tLog = timeLog(gun)
    tIndex = timeIndex(gun)
    edit = makeedit(gun,gb,cascade,tLog,tIndex)
    newNode = makenewNode(edit)
    linkRowTo = makelinkRowTo(gun,gb,getCell)
    unlinkRow = makeunlinkRow(gun,gb)
    importData = makeimportData(gun, gb)
    importNewTable = makeimportNewTable(gun,gb,tLog,tIndex,triggerConfigUpdate)
    associateTables = makeassociateTables(gun,gb)
    handleConfigChange = makehandleConfigChange(gun,gb,cache,gunSubs,addProp,cascade,solve,tLog)
    linkColumnTo = makelinkColumnTo(gb,handleConfigChange)
    config = makeconfig(gb,handleConfigChange)
    qIndex = queryIndex(gun)
    associateWith = makeassociateWith(gun,gb,getCell)
    unassociate = makeunassociate(gun,gb)
    subscribeQuery = makesubscribeQuery(gb,setupQuery)
    retrieveQuery = makeretrieveQuery(gb,setupQuery)
    setAdmin = makesetAdmin(gun)
    newGroup = makenewGroup(gun)
    addUser = makeaddUser(gun)
    userAndGroup = makeuserAndGroup(gun)
    chp = makechp(gun)
    gbase.newBase = newBase
    gbase.ti = tIndex
    gbase.tl = tLog
    gbase.qi = qIndex
    

    gbase = Object.assign(gbase,gbaseChainOpt())
    //random test command to fire after start
    // const testPut = ()=>{
    //     gunInstance.get('test').put({data:true})
        
    // }
    // let msg = {
    //     put: {
    //         test: {_:
    //                 {'#':'test','>':{data:Date.now()}},
    //               data: true
    //         }
    //     },
    //     '#':Gun.text.random(9)
    // }
    // let to = {}
    // to.next = (messg) => {
    //     gun._.on('in',messg)
    // }
    // addHeader(gun._,msg,to)

    // const testGet = () =>{
    //     gun.get('test').get(function(data,eve){
    //         eve.off()
    //         console.log('gun.get("test")`: ',data.put)
    //     })
    // }
    // if(typeof window === "undefined"){
    //     addHeader(gun._,msg,to)
    // }
    //testPut()
    //setTimeout(testGet,50000)


}
//GBASE INITIALIZATION
/*
---GUN SOULS---
see ./util soulSchema
*/
function startGunConfigSubs(baseID){
    if(gun){
        gun.get('GBase').on(function(gundata, id){
            let data = Gun.obj.copy(gundata)
            delete data['_']
            for (const key in data) {
                const value = data[key];
                if (key === baseID) {
                    let baseconfig = makeSoul({b:key,'%':true})
                    gun.get(baseconfig).on(function(gundata, id){
                        gunSubs[baseconfig] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let configpath = configPathFromSoul(id)
                        setMergeValue(configpath,data,gb)
                        setupTypesSubs(baseID)
                        //setupPropSubs(key)
                        triggerConfigUpdate(id)
                    })

                    let baseGrps = makeSoul({b:key,'^':true})
                    gun.get(baseGrps).on(function(gundata, id){
                        gunSubs[baseGrps] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let configpath = configPathFromSoul(id)
                        setMergeValue(configpath,data,gb)
                    })
                }
            }
        })    }
    else{
        setTimeout(startGunConfigSubs, 3000);
    }
}
function setupTypesSubs(baseID){
    let tlist = makeSoul({b:baseID})
    gun.get(tlist).on(function(gundata, id){//should have both relations and nodeTypes on this soul
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const tval in data) {//tval '#' + id
            const value = data[tval];
            if(value){
                let {t,rt} = parseSoul(tval)
                handleGunSubConfig(makeSoul({b:baseID,t,rt,'%':true}))//will sub if not already subed and merge in gb
                setupPropSubs(tval)
            }
        }
    })


}
function setupPropSubs(tpath){
    //tpath should be either !# or !-   
    let {b,t,rt} = parseSoul(tpath) 
    gun.get(tpath).on(function(gundata, id){
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const pval in data) { // pval = id
            const value = data[pval];
            if (value) {
                handleGunSubConfig(makeSoul({b,t,rt,p:pval,'%':true}))//will sub if not already subed
            }
        }
    })
}
function handleGunSubConfig(subSoul){
    //will be type config or prop config 
    let configpath = configPathFromSoul(subSoul)
    let configLoaded = getValue(configpath,gb)
    if(!configLoaded || configLoaded.alias === undefined){//create subscription
        gun.get(subSoul, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
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
    if(reactConfigCB){
        let configObj = {}
        configObj.byAlias = gbByAlias(gb)
        configObj.forUI = gbForUI(gb)
        configObj.byGB = gb
        reactConfigCB.call(this,configObj)
        gbChainState = true
        //console.log(configObj.forUI, configObj.byGB)
    }
}

//CHAIN CONSTRUCTORS
function base(base){
    //check base for name in gb to find ID, or base is already ID
    //return baseChainOpt
    let path = '!'
    if(gb[base] !== undefined){
        path += base
    }else{
        for (const baseID in gb) {
            const {alias} = gb[baseID];
            if(base === alias){
                path += baseID
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
function nodeType(label){
    //check base for name in gb to find ID, or base is already ID
    //return depending on table type, return correct tableChainOpt
    let base = this._path
    let id
    let tvals = gb[base].props
    let check = getValue([base,'props',label],gb)
    if(check !== undefined){
        id = label
    }else{
        for (const tval in tvals) {
            const {alias} = tvals[tval];
            if(label === alias){
                id = tval
                break
            }
        }
    }
    if(!id){
        throw new Error('Cannot find corresponding ID for nodeType alias supplied')
    }
    let out
    let newPath = [base,'#',id].join('')
    out = nodeTypeChainOpt(newPath)
    return out
}
function relation(label){
    let base = this._path
    let id
    let rtvals = gb[base].props
    let check = getValue([base,'relations',label],gb)
    if(check !== undefined){
        id = label
    }else{
        for (const tval in rtvals) {
            const {alias} = rtvals[tval];
            if(label === alias){
                id = tval
                break
            }
        }
    }
    if(!id){
        throw new Error('Cannot find corresponding ID for relation alias supplied')
    }
    let out
    let newPath = [base,'-',id].join('')
    out = relationChainOpt(newPath)
    return out
}
function group(group){
    let base = this._path
    let check = getValue([base,'groups'],gb)
    if(check === undefined || !(check && check[group])){
        throw new Error('Cannot find group specified')
    }
    let out = groupChainOpt(base,group)
    return out
}
function prop(prop){
    //check base for name in gb to find ID, or base is already ID
    //return depending on table type, return correct columnChainOpt
    let path = this._path
    let {b,t,tr} = parseSoul(path)
    let id
    let pvals = gb[b].props[t].props
    let isNode = path.includes('#')
    let check = (isNode) ? getValue([b,'props',t,'props',prop],gb) : getValue([b,'relations',tr,'props',prop],gb)
    let ptype
    if(check !== undefined){
        ptype = check.propType
        id = prop
    }else{
        for (const pval in pvals) {
            const {alias, propType} = pvals[pval];
            if(nodeType === alias){
                ptype = propType
                id = pval
                break
            }
        }
    }
    if(!id){
        throw new Error('Cannot find corresponding ID for prop alias supplied')
    }
    let out
    let newPath = [path,'.',id].join('')
    if(isNode){
        out = propChainOpt(newPath, ptype)
    }else{
        out = relationPropChainOpt(newPath)
    }
    return out
}
function node(nodeID){
    //can be with just id of or could be whole string (!#$ or !-$)
    //can someone edit !-$ directly? I don't think so, should use the correct relationship API since data is in 3 places (each node, and relationship node)
    let out
    let newPath
    if(nodeID.includes('!') && nodeID.includes('#') && nodeID.includes('$')){
        newPath = nodeID
    }else if(this._path && nodeID.length === 10){//assumes nodeID is standard 10 digit idval
        let path = this._path
        newPath = [path,'$',nodeID].join('')
    }else{
        throw new Error('Cannot decipher rowID given')
    }
    out = nodeChainOpt(newPath)
    return out
}




//STATIC CHAIN OPTS
function gbaseChainOpt(){
    return {newBase, showgb, showcache, showgsub, showgunsub, solve, base, item: node}
}
function baseChainOpt(_path){
    return {_path, config: config(_path), newNodeType: newNodeType(_path), importNewTable: importNewTable(_path), relation,nodeType,group,newGroup: newGroup(_path),setAdmin: setAdmin(_path),addUser: addUser(_path)}
}
function groupChainOpt(base, group){
    return {_path:base, add: userAndGroup(base,group,true), remove:userAndGroup(base,group,false), chp:chp(base,group)}
}
function nodeTypeChainOpt(_path){
    return {_path, config: config(_path), newNode: newNode(_path), addProp: addProp(_path), importData: importData(_path), subscribe: subscribeQuery(_path), retrieve: retrieveQuery(_path), associateTables: associateTables(_path),prop,node}
}
function relationChainOpt(_path){
    return {_path, config: config(_path), newRow: newNode(_path), newColumn: addProp(_path), importData: importData(_path),prop}
}

function propChainOpt(_path, GBtype){
    let out = {_path, config: config(_path), clearColumn: clearColumn(_path)}
    if(['string','number'].includes(GBtype)){
        out = Object.assign(out,{linkColumnTo: linkColumnTo(_path)})
    }
    return out
}
function relationPropChainOpt(_path){
    let out = {_path, config: config(_path)}
    return out
}
function nodeChainOpt(_path){
    return {_path, edit: edit(_path,false,false,false,_alias), retrieve: retrieveQuery(_path), subscribe: subscribeQuery(_path), linkRowTo: linkRowTo(_path), unlinkRow: unlinkRow(_path), associateWith: associateWith(_path), unassociate: unassociate(_path)}
}


//CACHE

function loadRowPropToCache(rowID, pval){
    let {b,t,tr,r} = parseSoul(rowID)
    let p = pval
    let dataType = (t) ? getDataType(gb,makeSoul({b,t,p})) : getDataType(gb,makeSoul({b,tr,p}))//rowID will only have one or other
    let cpath = cachePathFromRowID(rowID,pval)
    let propSet = (t) ? makeSoul({b,t,p,r}) : makeSoul({b,tr,p,r})
    let nodeSoul = (t) ? makeSoul({b,t,r}): makeSoul({b,tr,r})
    let subname = nodeSoul+'+'+p

    if(dataType === 'set' && !gunSubs[propSet]){//may already be subd from rowprops
        gun.get(propSet, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
                setRowPropCacheValue(cpath,pval,[],cache)
            }
        })
        gun.get(propSet).on(function(gundata,id){//gundata should be whole node, not just changes
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
        gunSubs[propSet] = true
    }else if(!gunSubs[subname] && !lType){
        gun.get(nodeSoul).get(p, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
                setRowPropCacheValue(cpath, null, cache)
            }
        })
        gun.get(nodeSoul).get(p).on(function(value){
            handleNewRowPropData(nodeSoul,pval,value) //<<
            setRowPropCacheValue(cpath,value,cache)
        }) 
        gunSubs[subname] = true
    }else{//do nothing, gun is already subscribed and cache is updating

    }
}
function getCell(rowID,pval){//shouldn't need this after reworking
    let cpath = cachePathFromRowID(rowID,pval)
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
//redo cascade and function to use similar method as query does to gather data and then fire call back for next thing

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

    }
    if(triggered){
        reQuerySub(subID,triggered)
    }
}
function newRowSubCheck(path){//never implemented??
    //this is also called directly from .edit(newRow:true) to see if this row meets any current subs
    let [base,tval] = path.split('/')
    let subs = getValue([base,tval],gsubs)
    for (const subID in subs) {
       reQuerySub(subID,newNode)
    }
}
function reQuerySub(subID,triggers,newRow){
    let [path,sID] = subID.split('-')
    let {b,t} = parseSoul(path)
    let {columns,range,query,userCB,allRows} = getValue([b,t,subID],gsubsParams)
    let q = makeQobj(path,columns,range,query,userCB,true,sID, true)
    if(newRow && q.type !== 'row'){//redo range, to see if new row needs to be added to .rows for table or li subs
        getRange(q)
    }else{//something updated on a row already in .rows, update data in store, and return store
        q.allRows = Array.from(new Set(allRows))
        q.rows = Array.from(new Set(triggers))
        q.next()
    }
     

}
function handleNewRowPropData(rowID,pval,value){
    //parse gun soul and keys in data
    //console.log('handle new Data' ,soul)
    let cpath = bufferPathFromSoul(rowID,pval)
    setValue(cpath,value,subBuffer)
    if(!bufferState){
        bufferState = true
        setTimeout(flushSubBuffer, 250)
    }
}
function setupSub(qObj){
    //subParams will have rows object in it {range: {from,to,idx,items}, type: table,row,li, columns: {p0,p1,etc}, query: [qArr], userCB, allRows}
    let {subID,allRows,allColumns,range,type,columns,query,userCB,arrMap,data,output,needRows} = qObj
    let [path] = subID.split('-')
    let {b,t} = parseSoul(path)
    let subParams = {userCB,query,allRows,range,columns,type,allColumns,arrMap,last:output}
    console.log('setting up or updating sub: '+ subID)
    setValue([b,t,subID],subParams,gsubsParams)
    for (const soul in needRows) {
        for (const p of allColumns) {
            loadRowPropToCache(soul,p)
        } 
    }
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
    //let [base,tval] = qObj.table.split('/')
    //let {type} = getValue([base,'props',tval],gb)
    let {index,to,from,items} = qObj.range
    //let idx = index.split('/')
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
    

    //need to revisit this after time index stuff is reworked
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
    //^^to here



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
    let {b,t} = parseSoul(path)
    let [tIndex,from,to,items, relativeTime, __toDate,last__,firstDayOfWeek] = obj.RANGE
    let out = {}
    if(!tIndex){



        //need to rework this
        tIndex = [b,t,'created'].join('/') //default is 'created'
        //need to makes sure all of this works together.



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
        let cpath = cachePathFromRowID(rowID)
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
            console.log('Query Done, returning data')
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
                        }else if(pass){//not added or removed, updated
                            let i = this.arrMap[rowID]
                            this.output[i][1] = pass
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
            if(this.type === 'row' || added || removed || this.reQuery){
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
    let {b,t,tr,r} = parseSoul(rowID)
    let p = pval
    let dataType = (t) ? getDataType(gb,makeSoul({b,t,p})) : getDataType(gb,makeSoul({b,tr,p}))//rowID will only have one or other
    let propSet = (t) ? makeSoul({b,t,p,r}) : makeSoul({b,tr,p,r})
    let nodeSoul = (t) ? makeSoul({b,t,r}): makeSoul({b,tr,r})
    let subname = nodeSoul+'+'+p

    if(dataType === 'set' && !gunSubs[propSet]){//may already be subd from rowprops
        gun.get(propSet, function(msg,eve){//check for existence only
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
    }else if(!gunSubs[subname]){
        gun.get(nodeSoul).get(p, function(msg,eve){//check for existence only
            eve.off()
            qObj.needRows[rowID] = true
            if(msg.put === undefined){
                addDataToQobj(rowID,pval,null,qObj)
            }else{
                addDataToQobj(rowID,pval,msg.put,qObj)
            }
        })
    }else{//do nothing, gun is already subscribed and cache is updating
        let val = getRowPropFromCache(cachePathFromRowID(rowID,pval),cache)
        addDataToQobj(rowID,pval,val,qObj)
    }
}


//PERMISSIONS
let authdConns = {}
function clientAuth(ctx){
    let root = ctx.root
    let msg = {}
    msg.creds = Object.assign({},root.user.is)
    msg['#'] = Gun.text.random(9)
    Gun.SEA.sign(msg['#'],root.opt.creds,function(sig){
        Gun.SEA.encrypt(sig,root.opt.pid,function(data){
            msg.authConn = data
            root.on('out',msg)
        })
    })
}
function verifyClientConn(ctx,msg){
    let root = ctx.root
    let ack = {'@':msg['#']}
    let{authConn,creds} = msg
    let pid = msg._ && msg._.via && msg._.via.id || false
    if(!pid){console.log('No PID'); return;}
    Gun.SEA.decrypt(authConn,pid,function(data){
        if(data){
            Gun.SEA.verify(data,creds.pub,function(sig){
                if(sig !== undefined && sig === msg['#']){
                    //success
                    authdConns[pid] = creds.pub
                    console.log("AUTH'd Connections: ",authdConns)
                    root.on('in',ack)
                }else{
                    ack.err = 'Could not verify signature'
                    root.on('in', ack)
                    //failure
                }
            })
        }else{
            console.log('decrypting failed')
        }
    })
}
function clientLeft(msg){
    let pid = msg && msg.id || false
    if(pid){
        delete authdConns[pid]
        console.log('Removed: ',pid, ' from: ',authdConns)
    }
}
function addHeader(ctx,msg,to){//no longer needed?
    let pair = ctx.opt.creds
    let type = (msg.get) ? 'get' : (msg.put) ? 'put' : false
    msg.header = {type,pub:false,sig:false}
    if(pair && type){
        let pub = pair.pub
        msg.header.pub = pub
        msg.header.token = token
        msg.header.sig = tokenSig
        
        to.next(msg)
        // let toSign = msg['#'] || msg['@'] //msg ID as entropy
        // Gun.SEA.sign(toSign,pair,function(sig){
        //     if(sig !== undefined){
        //         msg.header = {pub:pub,sig,alias:pair.alias}
        //         //console.log('HEADER ADDED: ',msg)
        //         to.next(msg)
        //     }else{
        //         to.next(msg)
        //     }
        // })
    }else{
        to.next(msg)
    }
    //console.log('OUT: ',msg)
}

function verifyPermissions(ctx,msg,to){
    if(msg.get && msg.get['#']){// get
        verifyOp(ctx,msg,to,'get')
    }else if (msg.put && Object.keys(msg.put).length){// put
        verifyOp(ctx,msg,to,'put')
    }else{
        to.next(msg)
    }
}

function isRestricted(soul,op){
    let getWhiteList = [/~/,/\|/,/GBase/,/config/,/\/t$/,/\/t\d*\/p/]
    if(op === 'get'){
        for (const t of getWhiteList) {
            let p = t.test(soul)
            if(p){
                return false
            }
        }
        //console.log('not on whiteList:', soul)
        let isGBase = /\/t\d+/g.test(soul) //looks for anything that has = '/t' + Number() (that didn't pass the whiteList)
        if(isGBase)return true
        return false //default everything else to read w/o login
    }else{
        if(/~/.test(soul))return false //allow user puts
        if(/GBase/.test(soul))return false //allow additions to list of bases
        
        return true //default all other puts to needing permission
    }
}
// let validTokens = {}
// const expireTok = (tok) =>{
//     delete validTokens[tok]
// }
function verifyOp(ctx,msg,to,op){
    let root = ctx.root
    let pobj = {msg,to,op}
    pobj.pub = false
    pobj.verified = false
    pobj.soul = (op==='put') ? Object.keys(msg.put)[0] : msg.get['#']
    pobj.prop = (op==='put') ? msg.put[pobj.soul] : msg.get['.']
    pobj.who = msg._ && msg._.via && msg._.via.id || false
    if(!isRestricted(pobj.soul,pobj.op)){//no auth needed
        //console.log('No auth needed: ',pobj.soul)
        to.next(msg)
        return
    }
    let authdPub = authdConns[pobj.who]
    //console.log('MSG FROM: ',pobj.who,' PUB: ',authdPub)
    if(pobj.who && authdPub){
        //console.log('Valid Connection')
        pobj.verified = true
        pobj.pub = authdConns[pobj.who]
        testRequest(root,pobj)
    }
    // if(msg.header && msg.header.sig && msg.header.pub && msg.header.token){
    //     if(msg.header.token !== 0 && validTokens[msg.header.token] && validTokens[msg.header.token] === msg.header.pub){
    //         console.log('Valid Token!')
    //         pobj.verified = true
    //         pobj.pub = msg.header.pub
    //         testRequest(root,pobj,pobj.soul)
    //     }else{
    //         let {pub,sig,token} = msg.header
    //         Gun.SEA.verify(sig,pub,function(data){
    //             if(data !== undefined && data === token){
    //                 console.log('Valid Sig!')
    //                 pobj.verified = true
    //                 pobj.pub = pub 
    //                 validTokens[token] = pub
    //                 setTimeout(expireTok,20000,token)
    //             }
    //             if(pobj.verified){
    //                 console.log('Message Sender Verified ', pobj.soul)
    //             }else{
    //                 //console.log('NOT VERIFIED: Sig/Pub mismatch',msg)
    //             }
    //             testRequest(root,pobj,pobj.soul)
    //         })
    //     }
    //     console.log('Checking ', pobj.op,': ', pobj.soul)
        
    // }
    else{//not logged in, could potentially have permissions?
        console.log('No/Empty message header! Attempting access to soul: ',pobj.soul)
        testRequest(root,pobj)
    }
}
let permCache = {}
function testRequest(root, request, testSoul){
    let {pub,msg,to,verified,soul,prop,op} = request
    testSoul = testSoul || soul
    if(!gb)throw new Error('Cannot find GBase config file') //change to fail silent for production
    let [path,...perm] = soul.split('|')
    let [base,tval,...rest] = testSoul.split('|')[0].split('/') //path === testSoul if not a nested property
    if(soul.includes('timeLog') || soul.includes('timeIndex')){
        path = path.split('>')[1]
        let[b,t,...r] = testSoul.split(':')[0].split('>')[1].split('/')
        base = b
        tval = t
        rest = (r) ? r[0].split('/') : r
    }
    let own = getValue([base,'props',tval,'owner'],gb) || false //false === row perms will be overridden by table perms
    let inherit = getValue([base,'inherit_permissions'],gb) || true // true === row will inherit table perms which will inherit base perms if missing
    let traverse = true
    let reqType
    
    if(soul.includes('|')){//permission change (put),(get is whitelisted)
        //console.log('Permission msg: ',msg)
        if((soul.includes('|super') || soul.includes('|group/admin|permissions')) && pub && verified){//attempt to modify 'baseID|super' node
            console.log('Attempting to create a Super Admin or Admin group')
            getSoul(soul,pub,true,function(data){
                //console.log(soul, ' IS: ',data)
                if(data && soul.includes('|super')){
                    console.log('Already exists! ',data)
                    root.on('in',{'@': msg['#'],  err: 'There is already a Super Admin for this base'})
                }else if(!data && soul.includes('|super')) {
                    //console.log('Creating new super node for new base')
                    to.next(msg)
                }else if(!data){
                    isSuper()
                }else{
                    attemptCHP(data,'group')
                }
            })
        }else if(soul.includes('|group/')){//group or group permission options
            if(soul.includes('permissions')){
                // console.log('CREATING GROUP PERMISSIONS')
                getSoul(soul,false, true ,function(data){
                    if(data){
                        attemptCHP(data,'group')
                    }else{//if node doesn't exist
                        isGrpOwner()//must have rowID|permission node created before creating group/...|permissions
                    }
                })
            }else{//changing membership
                //console.log('CHANGING MEMBERSHIP')
                let perms = soul + '|permissions'
                getSoul(perms,false,true,function(val){
                    //console.log('GROUP CHANGE, pubVerified: ', verified, 'pub: ', pub)
                    if(val){
                        addRemoveMember(val)
                    }else{// no permissions node for group. Must be admin?
                        isGrpOwner()
                    }
                })
            }
            
        }else if(soul.includes('permissions')){//for permission nodes themselves, sould be either base, table, or row permissions
            if(rest[0] === undefined){// baseID|permissions || baseID/tval|permissions : must be admin or super
                isAdmin()
            }else{//row permission
                //soul = baseID/tval/rval|permissions
                getSoul(soul,false, true, function(data){
                    if(data){
                        attemptCHP(data,'row') //editing existing soul
                    }else{//if node doesn't exist
                        //find 'create' permissions
                        checkScope('create') //creating this node
                    }
                })
            }
            
        }else if(soul.includes('|groups')){
            isAdmin()
        }
    }else if(soul.includes('config') && pub && verified){//no permissions node on config, must be admin or super
        isAdmin()
    }else{//all other restricted nodes, should be rows, can be 'get' or 'put'
        if(rest && rest[0] && rest[0][0] && rest[0][0] === 'r' || rest[0] === 'created'){// is some sort of row..
            let path
            if(rest[0] === 'created'){
                path = [base,tval].join('/')
            }else{
                path = [base,tval,rest[0]].join('/')
                reqType = 'row'
            }
            let permSoul = path +'|permissions'
            let hasNext = hasColumnType(gb,[base,tval].join('/'),'next') //false || [pval]
            let opAs = (soul !== testSoul) ? 'get' : op
            if(!hasNext)traverse = false
            if(inherit || !own){
                checkScope(isOp(false, opAs))///read || create
            }else{
                getSoul(permSoul,false,true,function(val){
                    if(val){
                        testPermissions(val,isOp(true, opAs))
                    }else{
                        isAdmin('ERROR: NO PERMISSIONS FOUND!') 
                    }
                })
            }
            
        }else if(rest && rest[0] && rest[0][0] && rest[0][0] === 'p'){
            //going to deprecate these nodes in gbase soon.
            to.next(msg)
            //column soul base/tval/pval
        }else if(!rest){
            //base or base/tval
            to.next(msg)
        }else{
            //doesn't match anything in gbase
            isAdmin('Invalid Soul')
        }
        function isOp(exists, opAs){
            let tryOp = opAs || op
            if(tryOp === 'get'){
                return 'read'
            }
            if(exists){
                return 'update'
            }else{
                return 'create'
            }
        }
    }
    function checkScope(operation){
        let bPerm = base+'|permissions'
        let tPerm = [base,tval].join('/') +'|permissions'
        getSoul(tPerm,false,true,function(val){
            if(val){
                testPermissions(val,operation)
            }else if(inherit){
                getSoul(bPerm,false,true,function(val){
                    if(val){
                        testPermissions(val,operation)
                    }else{
                        isAdmin('ERROR: NO PERMISSIONS TO INHERIT!!')
                    }
                })
            }else{
                isAdmin('ERROR: NO PERMISSIONS TO INHERIT!!')  
            }
        })
    }
    function lookLocal(soul,prop,cb) {
        //console.log('lookLocal, ',soul,prop)
        if(!isNode){
            return undefined
        }
        prop = prop || ''
        cb = (cb instanceof Function && cb) || console.log
        var id = msg['#'], has = prop, opt = {}, graph, lex, key, tmp;
        if(typeof soul == 'string'){
            key = soul;
        } 
        //else 
        // if(soul){
        //     if(tmp = soul['*']){ opt.limit = 1 }
        //     key = tmp || soul['='];
        // }
        if(key && !opt.limit){ // a soul.has must be on a soul, and not during soul*
            if(typeof has == 'string'){
                key = key+esc+(opt.atom = has);
            }
            // else 
            // if(has){
            //     if(tmp = has['*']){ opt.limit = 1 }
            //     if(key){ key = key+esc + (tmp || (opt.atom = has['='])) }
            // }
        }
        // if((tmp = get['%']) || opt.limit){
        //     opt.limit = (tmp <= (opt.pack || (1000 * 100)))? tmp : 1;
        // }
        radata(key, function(err, data, o){
            if(err)console.log('ERROR: ',err)
            if(data){
                if(typeof data !== 'string'){
                    if(opt.atom){
                        data = u;
                    } else {
                        Radix.map(data, each) 
                    }
                }
                if(!graph && data){ each(data, '') }
            }
            cb.call(this,graph)
            //gun._.on('in', {'@': id, put: graph, err: err? err : u, rad: Radix});
        }, opt);
        function each(val, has, a,b){
            if(!val){ return }
            has = (key+has).split(esc);
            var soul = has.slice(0,1)[0];
            has = has.slice(-1)[0];
            opt.count = (opt.count || 0) + val.length;
            tmp = val.lastIndexOf('>');
            var state = Radisk.decode(val.slice(tmp+1), null, esc);
            val = Radisk.decode(val.slice(0,tmp), null, esc);
            (graph = graph || {})[soul] = Gun.state.ify(graph[soul], has, state, val, soul);
            if(opt.limit && opt.limit <= opt.count){ return true }
        }
        
    }
    function testPermissions(permsObj,opType){
        let {owner,create,read,update,destroy,chp} = permsObj
        //opType should be one of ['create','read','update','destroy']
        let grp = permsObj[opType]
        if(grp === undefined)isAdmin('Cannot find permissions for this operation!')
        if(grp === null && owner === pub && verified){
            to.next(msg)
        }else if(reqType === 'row' && traverse){
            isMember(grp,function(valid){
                if(valid){
                    traverseNext()
                }else if(owner === pub && verified){
                    traverseNext()
                }else{//admin can do whatever, no need to recur, if not admin, acks err
                    isAdmin()
                }
            })
        }else{
            isMember(grp,function(valid){
                if(valid){
                    to.next(msg)
                }else if(owner === pub && verified){
                    to.next(msg)
                }else{
                    isAdmin()
                }
            })
        }

    }
    function isGrpOwner(){
        let groupName = soul.split('|')[1].split('group/')[1]
        let isRow = /[^\/]+\/t[0-9]+\/r[^|]*/.test(groupName)
        if(isRow){
            let rowPermSoul = groupName + '|permissions'
            getSoul(rowPermSoul,'owner',false,function(message,eve){
                eve.off()
                if(message.put){
                    if(message.put === pub){//is Owner
                        to.next(msg)
                    }else{
                        isAdmin()
                    }
                }else{
                    isAdmin('No permission node found!')
                }
            })
        }else{
            isAdmin('Must be admin to make change to this group')
        }
        
    }
    function isMember(groupName,cb){
        if(groupName === 'ANY'){
            cb.call(this,true)
            return
        }
        let gsoul = base+'|group/'+groupName
        getSoul(gsoul,pub,false,function(val){
            cb.call(this,val)
        })
    }
    function isAdmin(errMsg){
        errMsg = errMsg || op+' PERMISSION DENIED on: '+JSON.stringify(msg)
        if(!verified){
            console.log('PERMISSION DENIED User not verified! OP: ',op,' ON SOUL: ',soul)
            root.on('in',{'@': msg['#']||msg['@'], err: errMsg})
            return
        }
        let [base] = path.split('/')
        getSoul(base+'|group/admin',pub,true, function(val){
            if(val){
                to.next(msg)
                //console.log('An Admin is performing action')
            }else{
                isSuper(errMsg)
            }
        })

    }
    function isSuper(errMsg){
        errMsg = errMsg || op+' PERMISSION DENIED on: '+JSON.stringify(msg)
        getSoul(base+'|super',pub,true, function(val){
            if(val){
                to.next(msg)
                //console.log('Super is performing action')
            }else{
                console.log(errMsg)
                root.on('in',{'@': msg['#']||msg['@'], err: errMsg})
            }
        })
    }
    function addRemoveMember(put){
        let {add,remove} = put
        let ops = Object.values(msg.put[soul])
        let adding = ops.includes(true)
        let removing = ops.includes(false)
        if(adding && removing){
            isMember(add,function(valid){
                if(valid){
                    isMember(remove,function(valid){
                        if(valid){
                            to.next(msg)
                        }else{
                            isGrpOwner()
                        }
                    })
                }else{
                    isGrpOwner()
                }
            })

        }else if(removing){
            isMember(remove,function(valid){
                if(valid){
                    to.next(msg)
                }else{
                    isGrpOwner()
                }
            })
        }else if(adding){
            isMember(add,function(valid){
                if(valid){
                    to.next(msg)
                }else{
                    isGrpOwner()
                }
            })
        }
    }
    function attemptCHP(perms, type){
        console.log('ATTEMPTING TO CHANGE PERMISSIONS')
        let {owner,chp} = perms
        let putKeys = Object.keys(msg.put[soul])
        let needsOwner = putKeys.includes('chp')
        let row = false
        if(type ==='row'){
            needsOwner = (putKeys.includes('chp') || putKeys.includes('owner')) //changing ownership or chp
            row = true
        }
        if(chp === 'ANY'){//not sure when this would be... Anyone could change who could CRUD.
            if(!needsOwner){//cannot change 'chp' unless you own the row (if not row, need admin)
                console.log('`ANY` is editing permissions')
                to.next(msg)
            }else if(needsOwner){
                isOwner()
            }else{
                isAdmin('Invalid permission change, `any` cannot edit owner or group permission settings')
            }
        }else if(verified && pub && chp !== null){//if in group, can edit
            let groupSoul = base+'|group/'+chp
            getSoul(groupSoul,false, true, function(data){//must do lookLocal in case group is referencing itself.
                if(data[pub]){
                    if(!needsOwner){//is on list, can edit
                        to.next(msg)
                    }else if(needsOwner){
                       isOwner()
                    }
                }else{
                    isOwner()
                    //isAdmin('Cannot find a list of group members for group specified in permissions!') //if no group list? or emit a different error message?
                }
            })
        }else if(verified && pub && chp === null){
            isOwner()
        }else{//admins or super can change permissions regardless of permission settings
            isAdmin()
        }
        function isOwner(){
            if(row && pub === owner){//is this the owner of the row
                to.next(msg)
            }else if(!row){
                isGrpOwner()
            }else{
                isAdmin()
            }
        }
    }
    function traverseNext(){
        let pval = hasNext[0] //should be single 'next' column
        let links = path + '/links/'+ pval
        getSoul(links,false,false,function(val){
            if(val){
                for (const nextLink in val) {
                    const valid = val[nextLink];
                    if(valid){//take first valid link, should only be one
                        testRequest(root,request,nextLink)
                    }
                }
            }
        })
    }
    function getSoul(soul,prop,local,cb){
        //local = true; Will ignore cache and always get from disk? Maybe always check cache first?
        //console.log('GETTING SOUL ', soul, prop ,local,permCache[soul])
        //console.log('getting ', soul,' from...')
        if(!(cb instanceof Function)) cb = function(){}
        if(permCache[soul] !== undefined){//null if node does not exist, but has been queried and sub is set
            //console.log('cache')
            if(prop){
                cb.call(this, getValue([soul,prop],permCache)) 
            }else{
                cb.call(this, permCache[soul]) 
            }
        }else if(local){//local could have been cached from a previous local:false get
            //do no setup sub or ask gun, because we might need to know if it is a 'create' vs 'update', ie: super
            //console.log('disk')
            lookLocal(soul,prop||false,function(node){
                let obj = node || {}
                let out
                if(prop){
                    out = getValue([soul,prop],obj)
                }else{
                    out = getValue([soul],obj)
                }
                if(!node){//no data, null to avoid a disk read next time.
                    permCache[soul] = null
                }else{
                    permCache[soul] = out
                }
                addSub(soul) //add sub to update cache to avoid a slow disk read
                cb.call(this,out) 
            })
        }else{
            //console.log('gun')
            let get = {'#':soul}
            if(prop){
                get['.'] = prop
            }
            gun._.on('in', {//faster than .get(function(msg,eve){...????
                get,
                '#': gun._.ask(function(msg){
                    cb.call(this,msg.put && msg.put[soul] || undefined)
                    permCache[soul] = msg.put && msg.put[soul] || null //non-undefined in case no data, but still falsy
                })
            })
            // gun.get(soul).get(function(messg,eve){//check existence
            //     eve.off()
            //     cb.call(this,messg.put)
            //     permCache[soul] = messg.put || null //non-undefined in case no data, but still falsy
            // })
            addSub(soul)
        }
    }
    function addSub(soul){//if you get a local, and it already exists, subscribe and put it in the cache
        gun.get(soul).on(function(data){//setup sub to keep cache accurate
            permCache[soul] = data
        })
    }
}







//REACT STUFF
function loadGBaseConfig(cb){
    reactConfigCB = cb

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
    loadGBaseConfig,
    gbase,
    gunToGbase,
    formatQueryResults,
    addHeader,
    verifyPermissions,
    clientAuth,
    verifyClientConn,
    clientLeft
}