"use strict";
let gun
let gbase = {}
let gb = {}
let cache = {}
let gsubs = {}
let gunSubs = {}
let subBuffer = {}
let bufferState = false
let vTable = {}
let reactConfigCB
let gbChainState = true
if(!gun){}

const {
    cachePathFromChainPath,
    cachePathFromSoul,
    configPathFromSoul,
    configPathFromChainPath,
    configSoulFromChainPath,
    findID,
    findRowID,
    makefindRowAlias,
    gbForUI,
    gbByAlias,
    makelinkColPvals,
    setValue,
    setMergeValue,
    getValue,
    makevalidateData,
    makehandleRowEditUndo,
    makecheckUniqueAlias,
    makecheckUniqueSortval,
    makefindNextID,
    makenextSortval,
    convertValueToType,
    makeisLinkMulti,
    makegetColumnType,
    tsvJSONgb,
    findLinkingCol
} = require('./util.js')
const findRowAlias = makefindRowAlias(gb)
const linkColPvals = makelinkColPvals(gb)
const validateData = makevalidateData(gb)
let handleRowEditUndo
const checkUniqueAlias = makecheckUniqueAlias(gb)
const checkUniqueSortval = makecheckUniqueSortval(gb)
const findNextID = makefindNextID(gb)
const nextSortval = makenextSortval(gb)
const isLinkMulti = makeisLinkMulti(gb)
const getColumnType = makegetColumnType(gb)

const {makehandleConfigChange,
    makechangeColumnType,
    makeoldConfigVals,
    makehandleLinkColumn,
    makehandleNewLinkColumn,
    makehandleImportColCreation,
    makehandleTableImportPuts,
    makehandleFNColumn,
    makehandleUnlinkColumn
}= require('./configs')
let handleConfigChange
let changeColumnType
let handleLinkColumn
const oldConfigVals = makeoldConfigVals(gb)
let handleNewLinkColumn 
let handleImportColCreation
let handleTableImportPuts
let handleFNColumn
let handleUnlinkColumn


const {makenewBase,
    makenewTable,
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
    makeclearColumn
} = require('./chain_commands')
let newBase
let newTable
let newColumn
let newRow
let linkColumnTo
let config
let edit
const subscribe = makesubscribe(gb,gsubs,requestInitialData)
const retrieve = makeretrieve(gb)
let linkRowTo
let unlinkRow
let clearColumn
const importData = makeimportData(gb,handleImportColCreation,handleTableImportPuts)
let importNewTable
const showgb = makeshowgb(gb)
const showcache = makeshowcache(cache)
const showgsub = makeshowgsub(gsubs)
const showgunsub = makeshowgunsub(gunSubs)

const {makesolve,
    makeinitialParseLinks,
    makegetCell,
    makegetLinks,
    makeverifyLinksAndFNs
} = require('../function_lib/function_utils');
const initialParseLinks = makeinitialParseLinks(isLinkMulti,getColumnType)
const getCell = makegetCell(gunSubs,cache,loadRowPropToCache)
const getLinks = makegetLinks(gb,initialParseLinks,getCell,getColumnType)
const solve = makesolve(getLinks)
const verifyLinksAndFNs = makeverifyLinksAndFNs(isLinkMulti,getColumnType)






const {maketableToState,
    makerowToState,
    makebuildRoutes,
    makegenerateHeaderRow,
    makexformRowObjToArr,
    makelinkColIdxs,
    makelinkOptions,
    makefnOptions
} = require('../react_tables/to_state')

const generateHeaderRow = makegenerateHeaderRow(gb)
const linkColIdxs = makelinkColIdxs(generateHeaderRow,linkColPvals)
const xformRowObjToArr = makexformRowObjToArr(findRowAlias)
const tableToState = maketableToState(gb,vTable,subscribe,generateHeaderRow,linkColPvals,linkColIdxs, xformRowObjToArr)
const rowToState = makerowToState(vTable,subscribe,generateHeaderRow,linkColPvals, xformRowObjToArr)
const buildRoutes = makebuildRoutes(gb)
const linkOptions = makelinkOptions(gb)
const fnOptions = makefnOptions(gb)

startGunConfigSubs()

const gunToGbase = gunInstance =>{
    gun = gunInstance
    //DI after gunInstance is received from outside
    handleRowEditUndo = makehandleRowEditUndo(gun, gb)
    handleNewLinkColumn = makehandleNewLinkColumn(gun,gunSubs,newColumn,loadColDataToCache)
    handleImportColCreation = makehandleImportColCreation(gun,gb)
    handleTableImportPuts = makehandleTableImportPuts(gun)
    newBase = makenewBase(gun)
    newTable = makenewTable(gun,findNextID,nextSortval,checkUniqueAlias)
    newColumn = makenewColumn(gun,findNextID,nextSortval,checkUniqueAlias)
    edit = makeedit(gun,gb,validateData,handleRowEditUndo,cascade)
    newRow = makenewRow(checkUniqueAlias,edit)
    importNewTable = makeimportNewTable(gun,checkUniqueAlias,findNextID,nextSortval,handleImportColCreation,handleTableImportPuts,triggerChainRebuild)
    handleLinkColumn = makehandleLinkColumn(gb,cache,loadColDataToCache,handleNewLinkColumn)
    handleFNColumn = makehandleFNColumn(gun,gb,gunSubs,cache,loadColDataToCache,cascade,solve,verifyLinksAndFNs)
    handleUnlinkColumn = makehandleUnlinkColumn(gb,changeColumnType)
    changeColumnType = makechangeColumnType(gun,gb,cache,loadColDataToCache,handleLinkColumn,handleFNColumn, handleUnlinkColumn)
    handleConfigChange = makehandleConfigChange(gun,gb,checkUniqueAlias,checkUniqueSortval,changeColumnType,handleRowEditUndo,oldConfigVals,handleFNColumn)
    linkColumnTo = makelinkColumnTo(gb,handleConfigChange)
    linkRowTo = makelinkRowTo(gun,gb,getCell)
    unlinkRow = makeunlinkRow(gun,gb)
    config = makeconfig(handleConfigChange)
    clearColumn = makeclearColumn(gun,gb,cache,gunSubs,loadColDataToCache,getColumnType)


    gbase.newBase = newBase

}

//GBASE INITIALIZATION
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
                        setupPropSubs(key)
                        triggerChainRebuild(id)
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
function setupPropSubs(frompath){
    let pathArgs = frompath.split('/')
    if(pathArgs[pathArgs.length -1] === 'config'){
        pathArgs.pop()
    }
    if(pathArgs.length === 1){//find all tables
        let tpath = pathArgs.slice()
        tpath.push('t')
        tpath = tpath.join('/')
        gun.get(tpath).on(function(gundata, id){
            let data = Gun.obj.copy(gundata)
            delete data['_']
            for (const tval in data) {
                const value = data[tval];
                if (value) {
                    let tsoul = pathArgs.slice()
                    tsoul.push(tval)
                    tsoul.push('config')
                    tsoul = tsoul.join('/')
                    handleGunSubConfig(tsoul)//will sub if not already subed and merge in gb
                    setupPropSubs(tsoul)
                }
            }
        })
    }
    if(pathArgs[pathArgs.length -1][0] === 't' && pathArgs[pathArgs.length -1].length > 1){//find all columns on table && all rows
        let colPath = pathArgs.slice()
        colPath.push('r/p')
        colPath = colPath.join('/')
        let rowPath = pathArgs.slice()
        rowPath.push('r/p0')
        rowPath = rowPath.join('/')
        gun.get(colPath).on(function(gundata, id){
            let data = Gun.obj.copy(gundata)
            delete data['_']
            for (const pval in data) {
                const value = data[pval];
                if (value) {
                    let psoul = pathArgs.slice()
                    psoul.push('r')
                    psoul.push(pval)
                    psoul.push('config')
                    psoul = psoul.join('/')
                    handleGunSubConfig(psoul)//will sub if not already subed
                }
            }
        })
        handleGunSubConfig(rowPath)
    }

    
}
function handleGunSubConfig(subSoul){
    //will be table config, column config or p0 col for rows
    let p0col = subSoul.split('/')
    let configpath = configPathFromSoul(subSoul)
    let cachepath = cachePathFromSoul(subSoul)
    let base, tval, pval
    [base,tval,pval] = cachepath
    if(p0col[p0col.length-1] === 'p0'){//handle row case
        loadColDataToCache(base,tval,pval)
    }else{
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
                triggerChainRebuild(id)
            })
            
            
        }else{//do nothing, gun is already subscribed and cache is updating
    
        }
    }



}
function buildTablePath(baseID, tval){
    let colRes = []
    let rowRes = []
    let res = []
    const path = baseID + '/' + tval
    const tableConfig = gb[baseID].props[tval];
    let colgb = colRes[0] = {}
    let cola = colRes[1] = {}
    for (const p in tableConfig.props) {
        const palias = tableConfig.props[p].alias;
        let colpath = buildColumnPath(baseID, tval, p)
        colgb[p] = colpath
        cola[palias] = colpath
    }
    let rowgb = rowRes[0] = {}
    let rowa = rowRes[1] = {}
    if(tableConfig.rows){
        for (const gbid in tableConfig.rows) {
                const alias = tableConfig.rows[gbid];
                rowgb[gbid] = buildRowPath(gbid,false,false)
                rowa[alias] = buildRowPath(gbid,true,false)
        }
    }
    setupGBalias(path)
    res[0] = Object.assign({}, colgb, rowgb, tableChainOpt(path))
    res[1] = Object.assign({}, cola, rowa, tableChainOpt(path))
    return res
}
function buildColumnPath(baseID, tval, pval){
    let res
    const path = baseID + '/' + tval + '/' + pval
    setupGBalias(path)
    res = columnChainOpt(path)
    return res

}
function buildRowPath(rowID,byAlias,newRow){
    let res
    const path = rowID
    res = rowChainOpt(path,byAlias,newRow)
    setupGBalias(path)
    return res

}
function triggerChainRebuild(path){
    if(gbChainState){
        gbChainState = false
        setTimeout(rebuildGBchain, 3000, path)
    }
}
function rebuildGBchain(path){
    //console.log('rebuilding gbase.chain from: ' + path)
    gbChainState = true
    let res = {}
    for (const baseID in gb) {
        const baseConfig = gb[baseID];
        const baseAlias = baseConfig.alias
        res[baseID] = baseChainOpt(baseID)
        res[baseAlias] = baseChainOpt(baseID)
        for (const t in baseConfig.props) {
            let talias = baseConfig.props[t].alias
            let topts =  buildTablePath(baseID, t)
            res[baseID][t] = topts[0]
            res[baseID][talias] = topts[1]
            res[baseAlias][talias] = topts[1]
        }
        
    }
    res = Object.assign(res, gbaseChainOpt())
    for (const key in gbase) {//clear obj without losing reference
        if (gbase.hasOwnProperty(key)) {
            delete gbase[key]
        }
    }
    gbase = Object.assign(gbase,res)
    if(reactConfigCB && reactConfigCB.setState){
        let configObj = {}
        configObj.byAlias = gbByAlias(gb)
        configObj.forUI = gbForUI(gb)
        configObj.byGB = gb
        reactConfigCB.setState({config: configObj})
    }

}
function setupGBalias(gbasechainpath){
    let cpath = configPathFromChainPath(gbasechainpath)
    let gbvalue = getValue(cpath, gb)
    //console.log(cpath, gbvalue)
    if(gbvalue){
        if(!gb[gbasechainpath]){
            Object.defineProperty(gb,gbasechainpath, {
                get: function(){
                    return gbvalue
                }
            })
        }
    }
}

//STATIC CHAIN OPTS
function gbaseChainOpt(){
    return {newBase, showgb, showcache, showgsub, showgunsub, solve}
}
function baseChainOpt(_path){
    return {_path, config: config(_path), newTable: newTable(_path), importNewTable: importNewTable(_path)}
}
function tableChainOpt(_path){
    return {_path, config: config(_path), newRow: newRow(_path), newColumn: newColumn(_path), importData: importData(_path), subscribe: subscribe(_path)}
}
function columnChainOpt(_path){
    return {_path, config: config(_path), subscribe: subscribe(_path), linkColumnTo: linkColumnTo(_path), clearColumn: clearColumn(_path)}
}
function rowChainOpt(_path,byAlias){
    return {_path, edit: edit(_path,byAlias), retrieve: retrieve(_path), subscribe: subscribe(_path), linkRowTo: linkRowTo(_path,byAlias), unlinkRow: unlinkRow(_path,byAlias)}
}

//CACHE
function loadColDataToCache(base, tval, pval){
    //gun.gbase(baseID).loadColDataToCache('t0','p0', this)
    let colSoul = base + '/' + tval + '/r/' + pval
    let p0soul = [base,tval,'r','p0'].join('/')
    let path = [base, tval, pval]
    let rows = getValue([base,tval,'p0'], cache)
    let inc = 0
    let isLink = getColumnType([base,tval,pval].join('/'))
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
        }else{
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
                        triggerChainRebuild(colSoul)
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
                    triggerChainRebuild(id)
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
function loadRowPropToCache(path, pval){
    //path should be base/tval/rowid
    let pArgs = path.split('/')
    let base = pArgs[0]
    let tval = pArgs[1]
    let colSoul = base + '/' + tval + '/r/' + pval
    let cpath = [base, tval, pval, path]
    //console.log(cpath)
    //console.log(getValue(cpath,cache))
    let isLink = getColumnType([base,tval,pval].join('/'))
    let rowLinks = path +'/links/'+pval
    let subname = colSoul + '+' + path
    if(!gunSubs[rowLinks] && (isLink === 'prev' || isLink === 'next')){//may already be subd from rowprops
        gun.get(rowLinks, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
                setMergeValue(cpath,[],cache)
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
            setValue(cpath,links,cache)
            handleNewData(colSoul, {[path]:links})
        })
        gunSubs[rowLinks] = true
    }else if(!gunSubs[subname] && isLink !== 'prev' && isLink !== 'next'){
        gun.get(colSoul).get(path, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
                setMergeValue(cpath, null, cache)
            }
        })
        gun.get(colSoul).get(path).on(function(gundata,id){
            let subname = colSoul + '+' + path
            let data = Gun.obj.copy(gundata)
            let dataObj = {[path]: data}
            handleNewData(colSoul, dataObj)
            setMergeValue(cpath,data,cache)
            let rowpath = [base, tval, 'rows', path]
            if (getValue(rowpath,cache) !== undefined) {
                delete cache[base][tval].rows[path] 
            }
            
        }) 
        gunSubs[subname] = true
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
    if(!colArr && reqType === 'row' || reqType === 'table'){
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
            let colSoul = base + '/' + tval +'/r/' + pval
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
        let colSoul = base + '/' + tval +'/r/' + pval
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


//CASCADE
function cascade(rowID, pval, inc){//will only cascade if pval has a 'usedIn'
    try{
        inc = inc || 0
        console.log('cascading:', rowID, pval, inc)
        let [base,tval,r] = rowID.split('/')
        let maxTries = 5
        let colconfig = getValue([base,'props',tval,'props',pval], gb)
        let usedIn = colconfig.usedIn
        let colType = colconfig.GBtype
        if(colconfig === undefined || colType === 'prev' || colType === 'next' || usedIn.length === 0){return false}
        if(inc === maxTries){
            let err = 'Could not load all dependencies for: '+ rowID
            throw new Error(err)
        }
        let linkCol
        let linkColInfo
        let usedInFN = {}
        let missingData = false
        let checkData = {}
        //get links
        for (let i = 0; i < usedIn.length; i++) {
            const path = usedIn[i];
            [linkCol,linkColInfo] = findLinkingCol(gb,rowID,path)
            if(linkCol === undefined){throw new Error('Cannot resolve "usedIn" reference')}
            if(linkColInfo.GBtype === 'function'){
                checkData[path] = getLinks(rowID,linkColInfo.fn)
                usedInFN[path] = {rows: rowID, fn: linkColInfo.fn}
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
                let call = edit(rowid,false,false,false,true)
                call({[upval]: fnresult})//edit will call cascade if needed
            }
        }
    }catch(e){
        console.log(e)
    }
}



//EVENT HANDLING AND BUFFER

//sub id format: 
//row: tval/rowid/pval1,pval2,pvaln-subID <--subID is random AN string
//table: tval/pval1,pval2,pvaln-subID <--subID is random AN string
//column: tval/r/pval-subID <--subID is random AN string

//basically any data edit on a column soul will update any sub
function flushSubBuffer(){
    let buffer = Gun.obj.copy(subBuffer)
    subBuffer = {}
    console.log('flushing buffer', buffer)
    bufferState = false
    for (const base in gsubs) {
        const subs = gsubs[base];
        for (const subID in subs) {
            handleSubUpdate(subID, buffer)
        }
    }
}
function parseSubID(subID){
    let subType
    let baseArgs = subID.split('/')
    let base = baseArgs[0]
    let tval = baseArgs[1]
    let rowid
    if(baseArgs[2][0] === 'r' && baseArgs[2].length > 1){
        subType = 'row'
        rowid = base + '/' + tval + '/' + baseArgs[2]
    }else if(baseArgs[2][0] === 'p' || baseArgs[2][0] === 'A'){
        subType = 'table'
    }else{
        subType = 'column'
    }
    let pvalstr = baseArgs.pop()//last '/' should be ',' pvals and '-' id
    let pvalandid = pvalstr.split('-')
    let pvals = pvalandid[0].split(',')
    let id = pvalandid[1]
    return [subType,base,tval,pvals,rowid]
}
function handleSubUpdate(subID, buffer){
    let out = {}
    let [type, base, tval, pvals, rowid] = parseSubID(subID)
    //console.log(subID, type)
    if(type === 'row'){
        let row = getValue([base,tval,rowid], buffer)
        if(row !== undefined && pvals[0] !== 'ALL'){
            if(pvals[0] !== 'ALL'){
                let rowCopy = Gun.obj.copy(row)
                for (const pval in rowCopy) {
                    if(!pvals.includes(pval)){
                        delete rowCopy[pval]
                    }
                }
                out = rowCopy
            }else{
                out = row
            }
            
        }
    }else if(type === 'table'){
        let table = getValue([base,tval], buffer)
        //console.log(table)
        if(table !== undefined){
            //console.log(pvals[0])
            if(pvals[0] !== 'ALL'){
                for (const rowid in table) {
                    const row = table[rowid];
                    let rowCopy = Gun.obj.copy(row) || {}
                    for (const pval in rowCopy) {
                        if(!pvals.includes(pval)){
                            delete rowCopy[pval]
                        }
                    }
                    out = Object.assign(out,rowCopy)
                    //console.log(out)
                }
            }else{
                out = table
                console.log('all',out)
            }
            
        }
    }else{//column
        let table = getValue([base,tval], buffer)
        let pval = pvals[0]//should only be one
        if(table !== undefined){
            for (const rowid in table) {
                const row = table[rowid];
                if(row[pval] !== undefined){
                    let colObj = {[rowid]: row[pval]}
                    out = object.assign(out,colObj)
                }
            }
        }
    }
    if(Object.keys(out).length > 0){
        gsubs[base][subID] = out //should fire user CB from .watch
    }
}
function handleNewData(soul, data){
    //parse gun soul and keys in data
    //console.log('handle new Data' ,soul)
    let pathArgs = soul.split('/')
    let base = pathArgs[0]
    let tval = pathArgs[1]
    let pval = pathArgs[3]
    for (const rowid in data) {
        const value = data[rowid];
        setValue([base,tval,rowid,pval], value, subBuffer)
    }
    if(!bufferState){
        bufferState = true
        setTimeout(flushSubBuffer, 100)
    }
    // determine what has changed
    //set new values
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
    fnOptions  
}