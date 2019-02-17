const {convertValueToType, configPathFromChainPath, configSoulFromChainPath, findRowID, findID, getValue, removeFromArr} = require('../gbase_core/util')
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
    let usedIn = JSON.stringify([])
    let linksTo = config.linksTo || ""
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

const makehandleConfigChange = (gun, gb, checkUniqueAlias, checkUniqueSortval, changeColumnType, handleRowEditUndo, oldConfigVals) => (configObj, path, backLinkCol)=>{
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    //this._path from wherever config() was called
    let cpath = configPathFromChainPath(path)
    let csoul = configSoulFromChainPath(path)
    let validConfig
    let tstamp = Date.now()
    let history = {}
    let thisColConfig = getValue(cpath,gb)
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
            checkUniqueAlias(cpath, configObj.alias)//will pass if alias is not present
            checkUniqueSortval(cpath, configObj.sortval)//same as alias
        }catch (e){
            return console.log(e)
        }
        if(configObj.GBtype || configObj.linksTo || configObj.fn){//new type change or update to link of fn
            let typeStuff = {}
            for (const key in configObj) {//split config obj for normal configs vs type/link configs
                if(key === 'GBtype' || key === 'linksTo' || key === 'linkMultiple' || key === "function" || key === "fn"){
                    typeStuff[key] = configObj[key]
                    delete configObj[key]
                }
            }
            if(typeStuff.GBtype && typeStuff.GBtype !== thisColConfig.GBtype){//change col type
                changeColumnType(path, typeStuff, backLinkCol)
            }else if(typeStuff.fn && thisColConfig.GBtype === 'function'){//update function
                handleFNColumn(path, typeStuff)
            }else if(typeStuff.linksTo && ['prev', 'next'].includes(thisColConfig.GBtype)){//update linksTo
                if(thisColConfig.usedIn.length !== 0){
                    throw new Error('Cannot change link to this column. A function references it')
                }else{
                    handleLinkColumn(path,typeStuff,backLinkCol)
                }
                
                //else> just make the change? Only if there is no data?, convert? delete?
            }else{
                throw new Error('Must specify GBtype in your config Obj to change a column to that type')
            }
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
const makechangeColumnType = (gun,gb,cache,loadColDataToCache,handleLinkColumn, handleFNColumn, handleUnlinkColumn) =>function thisfn(path, configObj, backLinkCol){
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
    if(colParam.GBtype === 'prev' || colParam.GBtype === 'next'){//changing a link column to non-link, need to find the linked one
        if(newType !== 'string'){throw new Error('Link Columns can only be converted to strings')}
        let cpath = configPathFromChainPath(path)
        let colParams = getValue(cpath,gb)
        let otherLink = colParams.linksTo
        let lcpath
        let lcolParams
        let changeLinkCol = false
        if(otherLink.length > 0){//need to undo other col
            lcpath = configPathFromChainPath(otherLink)
            lcolParams = getValue(lcpath,gb)
            if(lcolParams && (lcolParams.GBtype === 'prev' || lcolParams.GBtype === 'next')){
                changeLinkCol = true
            }
        }
        let csoul = configSoulFromChainPath(path)
        gun.get(csoul).put({linksTo: ""})
        if(changeLinkCol){
            thisfn(otherLink,{GBtype: 'string'})
        }
    }
    let colSoul = base + '/' + tval + '/r/' + pval
    
    if(newType === 'string' || newType === 'number' || newType === 'boolean'){//100% pass, or error and change nothing.
        let data = getValue([base,tval,pval], cache)
        if(!data){
            loadColDataToCache(base,tval,pval)
            setTimeout(thisfn, 100, path, configObj, backLinkCol)
            return
        }
        //forin keys and attempt to change values over
        //maybe just abort the conversion and alert user which cell(s) needs attention
        let putObj = {}
        if(newType === 'string'){
            for (const key in data) {
                putObj[key] = convertValueToType(gb, data[key], 'string')
            }
        }else if(newType === 'number'){
            for (const key in data) {
                let HID = getValue([base, 'props', tval, 'rows', key], gb)
                const value = data[key];
                try{
                    putObj[key] = convertValueToType(gb, value, 'number', HID) 
                }catch (e){
                    return console.log(e)
                }
            }
        }else if(newType === 'boolean'){
            for (const key in data) {
                let HID = getValue([base, 'props', tval, 'rows', key], gb)
                const value = data[key]
                try{
                    putObj[key] = convertValueToType(gb, value, 'boolean', HID) 
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
    }else if (newType === 'function'){//parse equation and store
        let fn = configObj.fn
        if(!fn){return console.log('ERROR: Must specify a function')}
        //check equation for valididty? balanced () and only one comparison per comma block?
        basicFNvalidity(fn)
        handleFNColumn(path, configObj, backLinkCol ,true) //initial change to fn column         
    }else{
        throw new Error('Cannot understand what GBtype is specified')
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
//FN STUFF
function basicFNvalidity(fnString){
    let args = fnString.split(',')
    let lpar = 0
    let rpar = 0
    for (let i = 0; i < fnString.length; i++) {
        const char = fnString[i];
        if(char === '('){
            lpar++
        }else if(char === ')'){
            rpar++
        }
    }
    if(lpar !== rpar){
        throw new Error('Check Equation, the parenthesis are unbalanced.')
    }
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let toks = 0
        for (let j = 0; j < arg.length; j++) {
            const argchar = arg[j];
            if("!<>".indexOf(argchar) !== -1){
                toks++
                if(arg[j+1] === '='){//skip next char
                    j++
                }
            }else if(argchar === '='){
                toks++
            }
        }
        if(toks > 1){
            throw new Error('Check your arguments, this one has more than one logical comparison in it: '+ args[i])
        }
    }
    return true
}
const makehandleFNColumn = (gun,gb,gunSubs,cache,loadColDataToCache, initialParseLinks, solve) => function thisfn(path,configObj){
    //parse equation for all links
    let [base,tval,pval] = path.split('/')
    loadColDataToCache(base,tval,pval)
    let cpath = configPathFromChainPath(path)
    let thisColConfig = getValue(cpath,gb)
    let thisColConfigSoul = configSoulFromChainPath(path)
    let fn = configObj.fn
    let oldfn = thisColConfig.fn

    let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
    let oldLinksTo = []
    let newLinksTo = []
    let match
    while (match = allLinkPattern.exec(oldfn)) {
        let path = match[1]
        oldLinksTo = oldLinksTo.concat(path.split('.'))
    }
    while (match = allLinkPattern.exec(fn)) {
        let path = match[1]
        newLinksTo = newLinksTo.concat(path.split('.'))
    }
    let remove = oldLinksTo.filter(val => !newLinksTo.includes(val))
    let add = newLinksTo.filter(val => !oldLinksTo.includes(val))

    let usedIn = {}
    let result = {}
    let inMemory = true
    for (let i = 0; i < add.length; i++) {
        const link = add[i];
        let csoul = configSoulFromChainPath(link)
        let cpath = configPathFromChainPath(link)
        cpath.push('usedIn')
        let newUsedIn = getValue(cpath,gb)
        newUsedIn.push(path)
        usedIn[csoul] = {usedIn: JSON.stringify(newUsedIn)}
    }
    for (let i = 0; i < remove.length; i++) {
        const link = remove[i];
        let csoul = configSoulFromChainPath(link)
        let cpath = configPathFromChainPath(link)
        cpath.push('usedIn')
        let newUsedIn = removeFromArr(path,getValue(cpath,gb))
        usedIn[csoul] = {usedIn: JSON.stringify(newUsedIn)}
    }
    for (let i = 0; i < newLinksTo.length; i++) {
        const link = newLinksTo[i];
        let [base,tval,pval] = link.split('/')
        let soul = [base,tval,'r',pval].join('/')
        if(!gunSubs[soul]){
            inMemory = false
            loadColDataToCache(base,tval,pval)
        }
    }
    let data = getValue([base,tval,pval], cache)
    if(!inMemory){
        console.log(data)
        setTimeout(thisfn,1000,path,configObj)
        return
    }
    for (const rowid in data) {
        result[rowid] = solve(rowid, fn)
    }
    console.log(usedIn)

    for (const csoul in usedIn) {//update all usedIn's effected
        let val = usedIn[csoul]
        gun.get(csoul).put(val)
    }
    if(configObj.GBtype && configObj.GBtype !== thisColConfig.GBtype){//update the config type, this is a changeColType
        gun.get(thisColConfigSoul).put({GBtype: 'function'})
    }
    gun.get(thisColConfigSoul).put({fn: fn})//add fn to config
    let colSoul = [base,tval,'r',pval].join('/')
    gun.get(colSoul).put(result)//put the new calc results in to gun

    //need to check if this col is used in anything else and manually start the cascadesS
    let triggers = thisColConfig.usedIn
    // for (let i = 0; i < triggers.length; i++) {
    //     const triggeredCol = triggers[i];
    //     cascade(triggeredCol)
    // }
}


//LINK STUFF

const makehandleLinkColumn = (gb,cache,loadColDataToCache,handleNewLinkColumn) =>function thisfn(path, configObj, backLinkCol){
    let [base, tval, pval] = path.split('/')
    let [linkBase, linkTval, linkPval] = (configObj.linksTo) ? configObj.linksTo.split('/') : [false,false,false]
    let [backLBase, backLTval, backLPval] = (backLinkCol) ? backLinkCol.split('/') : [false,false,false]
    let cpath = configPathFromChainPath(path)
    let config = getValue(cpath,gb)
    let data = getValue([base,tval,pval], cache)
    if(!data){
        loadColDataToCache(base,tval,pval)
        setTimeout(thisfn, 100, path, configObj, backLinkCol)
        return
    }
    if(config.GBtype === 'prev' || config.GBtype === 'next'){//already a link col
        for (const key in data) {
            const value = data[key];
            if(![undefined, false, null, "",0].includes(value)){
                throw new Error('To change a link column, you must remove all data from column.')
            }
        }
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
            //putObj[GBID] = JSON.stringify(putObj[GBID])
        }
    }
    // for (const key in nextObj) {
    //     let value = nextObj[key];
    //     nextObj[key] = JSON.stringify(value)
    // }
    console.log(putObj)
    console.log(nextObj)
    prevConfig.data = putObj
    nextConfig.data = nextObj
    handleNewLinkColumn(prevConfig, nextConfig)
}
const makehandleUnlinkColumn = (gb, changeColumnType) => (path) => {
    console.log(path)
    let cpath = configPathFromChainPath(path)
    let colParams = getValue(cpath,gb)
    let otherLink = colParams.linksTo
    let lcpath
    let lcolParams
    let changeLinkCol = false
    if(otherLink.length > 0){//need to undo other col
        console.log(otherLink)
        lcpath = configPathFromChainPath(otherLink)
        lcolParams = getValue(lcpath,gb)
        console.log(lcolParams)
        if(lcolParams && (lcolParams.GBtype === 'prev' || lcolParams.GBtype === 'next')){
            changeLinkCol = true
        }
    }
    let csoul = configSoulFromChainPath(path)
    gun.get(csoul).put({linksTo: ""})
    console.log(changeLinkCol)
    if(changeLinkCol){
        changeColumnType(otherLink,{GBtype: 'string'})
    }

}
const makehandleNewLinkColumn = (gun, gunSubs, newColumn, loadColDataToCache) =>(prev, next)=>{
    // let prevConfig = {path,colSoul, data: prevPutObj}
    // let nextConfig = {path: configObj.linksTo,nextLinkCol: backLinkCol, data: nextPutObj}
    gunSubs[prev.colSoul] = false
    if(next.colSoul){//all data
        gunSubs[next.colSoul] = false
        gun.get(next.colSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            //gun.get(next.colSoul).put(next.data)
            let [base,tval,r,pval] = next.colSoul.split('/')
            for (const rowid in next.data) {
                const linksObj = next.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: next.nextLinkCol})
        if (prev.data !== undefined) {
            //gun.get(prev.colSoul).put(prev.data)
            let [base,tval,r,pval] = prev.colSoul.split('/')
            for (const rowid in prev.data) {
                const linksObj = prev.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
    }else{//create new next col on linksTo sheet
        let nextPathArgs = next.path.split('/')
        nextPathArgs.pop()
        let call = newColumn(_path)
        let nextP = call(prev.t + "'s")
        if(next.data === undefined){
            next.data = false
        }
        if(nextP[0] !== 'p'){return console.log('did not return a new pval for new next col')}
        nextColSoul = nextPathArgs[0] + '/' + nextPathArgs[1] + '/r/' + nextP
        let nextPath = nextPathArgs[0] + '/' + nextPathArgs[1] + '/' + nextP
        gun.get(nextColSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            //gun.get(nextColSoul).put(next.data)
            for (const rowid in next.data) {
                const linksObj = next.data[rowid];
                let linkSoul = rowid +'/links/'+nextP
                gun.get(linkSoul).put(linksObj)
            }
            gunSubs[nextColSoul] = false
            let [base,tval,r,pval]=nextColSoul
            loadColDataToCache(base,tval,pval)
        }
        

        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: nextPath})
        if (prev.data !== undefined) {
            //gun.get(prev.colSoul).put(prev.data)
            let [base,tval,r,pval] = prev.colSoul.split('/')
            for (const rowid in prev.data) {
                const linksObj = prev.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
    }
    
}
const makehandleLinkRowTo = (gun,gb) => (linkObj)=>{
    //linkObj.prevPath = base/tval/rid
    //linkObj.prevCol = base/tval/pval
    //linkObj.nextPath = base/tval/rid
    //linkObj.nextCol = base/tval/pval



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
    makehandleTableImportPuts,
    makehandleFNColumn,
    makehandleUnlinkColumn

}