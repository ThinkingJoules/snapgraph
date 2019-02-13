const {convertValueToType, configPathFromChainPath, configSoulFromChainPath, findRowID, findID, getValue} = require('../gbase_core/util')
//CONFIG FUNCTIONS
const newBaseConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Base'
    let sortval = config.sortval || 0
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    return {alias, sortval, vis, archived, deleted}
}
const newTableConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Table'
    let sortval = config.sortval || 0
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    return {alias, sortval, vis, archived, deleted}
}
const newColumnConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Column'
    let sortval = config.sortval || 0
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    let GBtype = config.GBtype || 'string' 
    let required = config.requred || false 
    let defaultval = config.defaultval || null 
    let fn = config.fn || "" 
    let usedIn = JSON.stringify({})
    let linksTo = config.linksTo || JSON.stringify({})
    let linkMultiple = config.linkMultiple || true
    return {alias, sortval, vis, archived, deleted, GBtype, required, defaultval, fn, usedIn, linksTo, linkMultiple}
}
const validGBtypes = {string: true, number: true, boolean: true, null: true, prev: true, next: true, function: true, tag: true, link: true} //link is not really valid, but is always handled
const checkConfig = (validObj, testObj) =>{//use for new configs, or update to configs
    //whichConfig = base, table, column, ..row?
    let nullValids = {string: true, number: true, boolean: true, null: true, object: false, function: false}
    let output
    for (const key in testObj) {
        if (validObj[key] !== undefined) {//key is valid
            const tTypeof = typeof testObj[key];
            const vTypeof = typeof validObj[key]
            if(vTypeof === null && !nullValids[tTypeof]){//wildcard check
                throw new Error('typeof value must be one of:', nullValids)
            }else if(vTypeof !== tTypeof){
                throw new Error(vTypeof+ ' !== '+ tTypeof)
            }
            if(key === 'GBtype' && validGBtypes[testObj[key]] === undefined ){//type check the column data type
                throw new Error('GBtype does not match one of:', Object.keys(validGBtypes))
            }
            return true
        }else{
            throw new Error(key + ' does not match valid keys of:', Object.keys(validObj))
        }
    }    
}

const makehandleConfigChange = (gun, checkUniqueAlias, checkUniqueSortval, changeColumnType, handleRowEditUndo) => (configObj, path, backLinkCol)=>{
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    //this._path from wherever config() was called
    let cpath = configPathFromChainPath(path)
    let csoul = configSoulFromChainPath(path)
    let validConfig
    let tstamp = Date.now()
    let history = {}
    if(cpath[cpath.length-1][0] === 'p'){//col
        validConfig = newColumnConfig()
    }else if(cpath[cpath.length-1][0] === 't'){//table
        validConfig = newTableConfig()
    }else{//base (or row, but validConfig is not called)
        validConfig = newBaseConfig()
    }
    if(cpath[cpath.length-2] === 'props' || cpath.length === 1){//base,table,col config change
        try{
            checkConfig(validConfig, configObj)
            checkUniqueAlias(cpath, configObj.alias)
            checkUniqueSortval(cpath, configObj.sortval)
        }catch (e){
            return console.log(e)
        }
        if(configObj.GBtype){
            let linkstuff = {}
            for (const key in configObj) {//split config obj for normal configs vs type/link configs
                if(key === 'GBtype' || key === 'linksTo' || key === 'linkMultiple'){
                    linkstuff[key] = configObj[key]
                    delete configObj[key]
                }else{

                }
            }
            changeColumnType(path, linkstuff, backLinkCol)
        }
        if(Object.keys(configObj).length !== 0){
            history.old = oldConfigVals(cpath, configObj)
            history.new = configObj
            gun.get(csoul+'/history').get(tstamp).put(JSON.stringify(history))
            gun.get(csoul).put(configObj)
        }
    }else{//handle HID change
        //expects path argument of base/tval/rowid
        let checkAlias = (configObj.alias) ? checkUniqueAlias(cpath, configObj.alias) : false
        if(checkAlias){
            let chainpath = path.split('/')
            let rowID = chainpath[chainpath.length-1]
            //put data on p0 soul
            gun.get(path).get('p0').put(configObj.alias)
            gun.get(csoul).get(rowID).put(configObj.alias)
            let put = {p0: configObj.alias}
            handleRowEditUndo(path,put)            
        }else{
            return console.log('ERROR: New row alias is not unique')
        }
    }
    return true
}
const makechangeColumnType = (gun,gb,cache,loadColDataToCache,changeColumnType) =>(path, configObj, backLinkCol)=>{
    let [base, tval, pval] = path.split('/')
    let newType = configObj.GBtype
    if(pval[0] !== 'p'){
        return console.log('ERROR: Can only change GBtype of columns')
    }
    let cpath = configPathFromChainPath(path)
    let configCheck = newColumnConfig()
    let check = checkConfig(configCheck, {GBtype: newType})
    if(!check && newType !== 'link'){return console.log('Error: Invalid column type', newType)}
    let colParam = getValue(cpath,gb)
    if(colParam.GBtype === newType){
        return console.log('GBtype is already this type')
    }
    let colSoul = base + '/' + tval + '/r/' + pval
    
    if(newType === 'string' || newType === 'number' || newType === 'boolean'){//100% pass, or error and change nothing.
        let data = getValue([base,tval,pval], cache)
        console.log(data)
        if(!data){
            loadColDataToCache(base,tval,pval)
            setTimeout(changeColumnType, 100, path, configObj, backLinkCol)
            return
        }
        //forin keys and attempt to change values over
        //maybe just abort the conversion and alert user which cell(s) needs attention
        let putObj = {}
        if(newType === 'string'){
            for (const key in data) {
                putObj[key] = convertValueToType(data[key], 'string')
            }
        }else if(newType === 'number'){
            for (const key in data) {
                let HID = getValue([base, 'props', tval, 'rows', key], gb)
                const value = data[key];
                try{
                    putObj[key] = convertValueToType(value, 'number', HID) 
                }catch (e){
                    return console.log(e)
                }
            }
        }else if(newType === 'boolean'){
            for (const key in data) {
                let HID = getValue([base, 'props', tval, 'rows', key], gb)
                const value = data[key]
                try{
                    putObj[key] = convertValueToType(value, 'boolean', HID) 
                }catch (e){
                    return console.log(e)
                }
            }
        }
        gun.get(colSoul + '/config').get('GBtype').put(newType)
        gun.get(colSoul).put(putObj)
      //  })
    }else if (newType === 'link' || newType === 'prev' || newType === 'next'){//parse values for linking
        //initial upload links MUST look like: "HIDabc, HID123" spliting on ", "
        let [linkBase, linkTval, linkPval] = (configObj.linksTo) ? configObj.linksTo.split('/') : [false,false,false]
        let [backLBase, backLTval, backLPval] = (backLinkCol) ? backLinkCol.split('/') : [false,false,false]
        if(configObj.linksTo && getValue([linkBase,'props',linkTval, 'props', linkPval], gb)){//check linksTo is valid table
            if(backLinkCol && !getValue([backLBase,'props',backLTval, 'props', backLPval], gb)){//if backLinkCol specified, validate it exists
                return console.log('ERROR-Aborted Linking: Back link column ['+backLinkCol+ '] on sheet: ['+ linkRowTo + '] Not Found')
            }
            handleLinkColumn(path, configObj, backLinkCol) 
        }else{
            return console.log('ERROR: config({linksTo: '+configObj.linksTo+' } is either not defined or invalid')
        }            
    }else{
        return console.log('ERROR: Cannot understand what GBtype')
    }
    
}
const makeoldConfigVals = gb =>(pathArr, configObj)=>{
    let oldObj = {}
    let config = getValue(pathArr, gb)
    for (const key in configObj) {
        oldObj[key] = config[key]
    }
    return oldObj
}
//LINK STUFF

const makehandleLinkColumn = (gb,cache,loadColDataToCache,handleNewLinkColumn) =>function thisfn(path, configObj, backLinkCol){
    let [base, tval, pval] = path.split('/')
    let [linkBase, linkTval, linkPval] = (configObj.linksTo) ? configObj.linksTo.split('/') : [false,false,false]
    let [backLBase, backLTval, backLPval] = (backLinkCol) ? backLinkCol.split('/') : [false,false,false]
    
    let data = getValue([base,tval,pval], cache)
    if(!data){
        loadColDataToCache(base,tval,pval)
        setTimeout(thisfn, 100, path, configObj, backLinkCol)
        return
    }
    let targetLink = configObj.linksTo
    let targetTable = targetLink.t

    let colSoul = base + '/' + tval + '/r/' + pval
    let nextColSoul = (backLinkCol) ? backLBase + '/' + backLTval + '/r/' + backLPval : false
   
    let prevConfig = {path,colSoul}
    let nextConfig = {path: configObj.linksTo,nextLinkCol: backLinkCol, colSoul: nextColSoul}
    

    if(Object.keys(data).length === 0){
        handleNewLinkColumn(prevConfig, nextConfig)
        return console.log('No data to convert, config updated')
    }
    let putObj = {}
    let nextObj = {}
    let linkHIDs = getValue([linkBase, 'props',linkTval,'rows'], gb)
    for (const GBID in data) {//for values, create array from string
        const linkStr = String(data[GBID]);
        let linkGBID
        if(linkStr){
            putObj[GBID] = {}
            let linkArr = linkStr.split(', ')
            for (let i = 0; i < linkArr.length; i++) {//build new objects of GBids, prev and next links
                const HID = linkArr[i];
                linkGBID = findRowID(linkHIDs,HID)
                if(linkGBID){
                    if(!nextObj[linkGBID]){nextObj[linkGBID] = {}}
                    if(!putObj[GBID]){putObj[GBID] = {}}
                    putObj[GBID][linkGBID] = true
                    nextObj[linkGBID][GBID] = true
                }else{
                    if(!confirm('Cannot find: '+ HID + '  Continue linking?')){
                        return console.log('LINK ABORTED: Cannot find a match for: '+ HID + ' on table: ' + targetTable)
                    }
                    if(!putObj[GBID]){putObj[GBID] = {}}
                }
                
            }
            putObj[GBID] = JSON.stringify(putObj[GBID])
        }
    }
    for (const key in nextObj) {
        let value = nextObj[key];
        nextObj[key] = JSON.stringify(value)
    }
    console.log(putObj)
    console.log(nextObj)
    prevConfig.data = putObj
    nextConfig.data = nextObj
    handleNewLinkColumn(prevConfig, nextConfig)
}
const makehandleNewLinkColumn = (gun, newColumn) =>(prev, next)=>{
    // let prevConfig = {path,colSoul, data: prevPutObj}
    // let nextConfig = {path: configObj.linksTo,nextLinkCol: backLinkCol, data: nextPutObj}
    if(next.colSoul){//all data
        gun.get(next.colSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            gun.get(next.colSoul).put(next.data)
        }
        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: next.nextLinkCol})
        if (prev.data !== undefined) {
            gun.get(prev.colSoul).put(prev.data)
        }
    }else{//create new next col on linksTo sheet
        let nextPathArgs = next.path.split('/')
        nextPathArgs.pop()
        let nextTPath = nextPathArgs.join('/')
        let call = newColumn(_path)
        let nextP = call(prev.t + "'s")
        let params = {GBtype: 'next', linksTo: prev.colSoul}
        if(next.data === undefined){
            next.data = false
        }
        if(nextP[0] !== 'p'){return console.log('did not return a new pval for new next col')}
        nextColSoul = nextPathArgs[0] + '/' + nextPathArgs[1] + '/r/' + nextP
        let nextPath = nextPathArgs[0] + '/' + nextPathArgs[1] + '/' + nextP
        gun.get(nextColSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            gun.get(nextColSoul).put(next.data)
        }
        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: nextPath})
        if (prev.data !== undefined) {
            gun.get(prev.colSoul).put(prev.data)
        }
    }
}

//IMPORT STUFF

const makehandleImportColCreation = (gun, gb, findNextID, nextSortval) => (base, tval, colHeaders, datarow, append)=>{
    // create configs
    let path = base+'/'+tval
    let gbpath = configPathFromChainPath(path)
    let colspath = gbpath.slice()
    colspath.push('props')
    let cols = getValue(colspath, gb)
    let results = {}
    let colExists = {}
    if(cols === undefined){//new table
        for (let i = 0; i < colHeaders.length; i++) {
            const palias = colHeaders[i];
            const colType = typeof datarow[i]
            const pval = 'p'+ i
            const sort = i*10
            results[palias] = pval
            let pconfig = newColumnConfig({alias: palias, GBtype: colType, sortval: sort})
            let typeCheck = checkConfig(newColumnConfig(), pconfig)
            if(typeCheck){
                gun.get(path + '/r/' + pval + '/config').put(pconfig)
                gun.get(path + '/r/p').put({[pval]: true})
            }
        }
    }else if(append){//existing table and we can add more columns/rows
        for (let j = 0; j < colHeaders.length; j++) {
            const col = colHeaders[j];
            let pval = findID(cols, col)
            if(pval !== undefined){
                colExists[col] = pval
            }else{
                colExists[col] = false
            }
        }
        let nextP = findNextID(path)
        let pInt = nextP.slice(1) *1
        let nextS = nextSortval(path)
        for (let i = 0; i < colHeaders.length; i++) {
            const palias = colHeaders[i];
            if(!colExists[palias]){
                let newP = 'p' + pInt
                const colType = typeof datarow[i]
                const pval = newP
                const sort = nextS
                results[palias] = pval
                let pconfig = newColumnConfig({alias: palias, GBtype: colType, sortval: sort})
                let typeCheck = checkConfig(newColumnConfig(), pconfig)
                if(typeCheck){
                    gun.get(path + '/r/' + pval + '/config').put(pconfig)
                    gun.get(path + '/r/p').put({[pval]: true})
                    pInt ++
                    nextS += 10
                }
            }else{
                results[palias] = colExists[palias]
            }
            
        }
    }
    
    return results
}
const makehandleTableImportPuts = gun => (path, resultObj)=>{
    console.log(resultObj)
    //path base/tval
    let basesoul = path + '/r/'
    console.log(basesoul)
    gun.get(basesoul + 'p0').put(resultObj.p0)//put alias keys in first, to ensure they write first in case of disk error, can reimport
    //create instance nodes
    for (const rowID in resultObj.p0) {//put alias on row node
        const rowAlias = resultObj.p0[rowID]
        gun.get(rowID).get('p0').put(rowAlias)
    }
    //put column idx objs
    for (const key in resultObj) {//put rest of column data in
        if (key !== 'p0') {
            const putObj = resultObj[key];
            let gbsoul = basesoul + key
            gun.get(gbsoul).put(putObj)
        }
    }
}
module.exports = {
    newBaseConfig,
    newTableConfig,
    newColumnConfig,
    makehandleConfigChange,
    makechangeColumnType,
    makeoldConfigVals,
    makehandleLinkColumn,
    makehandleNewLinkColumn,
    makehandleImportColCreation,
    makehandleTableImportPuts

}