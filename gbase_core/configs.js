const {convertValueToType,
    configPathFromChainPath,
    configSoulFromChainPath,
    findRowID,
    findID,
    getValue,
    removeFromArr,
    handleRowEditUndo,
    checkUniqueAlias,
    checkUniqueSortval,
    findNextID
} = require('../gbase_core/util')

const {verifyLinksAndFNs, verifyLILinksAndFNs} = require('../function_lib/function_utils')

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
    let sortval = config.sortval || 0
    let alias = config.alias || 'New Table ' + sortval
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    let type = config.type || 'static'
    return {alias, type, sortval, vis, archived, deleted}
}
const newColumnConfig = (config) =>{
    config = config || {}
    let sortval = config.sortval || 0
    let alias = config.alias || 'New Column ' + sortval
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    let GBtype = config.GBtype || 'string' 
    let required = config.required || false 
    let defaultval = config.defaultval || null 
    let fn = config.fn || "" 
    let usedIn = JSON.stringify([])
    let linksTo = config.linksTo || ""
    let linkMultiple = config.linkMultiple || false
    let associatedWith = config.associatedWith || ""
    let associateMultiple = config.associateMultiple || true
    let loadAssociated = config.loadAssociated || "15i"
    let associatedIndex = config.associatedIndex || ""
    let format = config.format || ""
    let dateFormat = config.dateFormat || ""
    let result = config.result || ""
    return {alias, sortval, vis, archived, deleted, GBtype, required, defaultval, fn, usedIn, linksTo, linkMultiple, associatedWith, associateMultiple, loadAssociated, associatedIndex,dateFormat, format, result}
}
const newInteractionTableConfig = (config) =>{
    config = config || {}
    let sortval = config.sortval || 0
    let alias = config.alias || 'New Interaction Table ' + sortval
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    let type = config.type || 'interaction'
    let transactions = (config.transactions && JSON.stringify(config.transactions)) || JSON.stringify({}) // {resultColPath1: inc || dec}, must have an instance column in li with same tval
    let reference = config.reference || "" //only for transactions, could be any table path that has the same context
    let completed = config.completed || "" //column on table that shows whether record is complete.
    let context = config.context || "" //only for transactions, this is a static table path
    let loadInteractions = config.loadInteractions || "100i"
    /*reference and context will be tPaths, and there will be 'association' columns made on this transaction for each
    basically the reference and context will treat those association columns with special rules.
    */
    return {alias, type, sortval, vis, transactions, completed, context, reference, loadInteractions,archived, deleted}
}
const newInteractionColumnConfig = (config) =>{
    config = config || {}
    let sortval = config.sortval || 0
    let alias = config.alias || 'New Interaction Column ' + sortval
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    let GBtype = config.GBtype || 'string' 
    let required = config.required || false 
    let defaultval = config.defaultval || null 
    let fn = config.fn || "" 
    let usedIn = (config.usedIn && JSON.stringify(config.usedIn)) || JSON.stringify([])
    let associatedWith = config.associatedWith || ""
    let associateMultiple = config.associateMultiple || false
    let loadAssociated = config.loadAssociated || ""
    let associatedIndex = config.associatedIndex || ""
    let format = config.format || ""
    let dateFormat = config.dateFormat || ""
    return {alias, sortval, vis, archived, deleted, GBtype, required, defaultval, fn, usedIn,  associatedWith, associateMultiple, loadAssociated, associatedIndex, dateFormat, format}
}
const newListItemsConfig = (config) =>{
    config = config || {}
    let type = 'li'
    let total_AU = config.total_AU || ""
    let total = config.total || ""
    let completed = config.completed || "" //column on li that should show that row as being completed
    return {total_AU, total, completed, type}
}
const newListItemColumnConfig = (config) =>{
    config = config || {}
    let sortval = config.sortval || 0
    let alias = config.alias || 'New Line Item Column ' + sortval
    let vis = config.vis || true
    let archived = config.archived || false
    let deleted = config.deleted || false
    let GBtype = config.GBtype || 'string' 
    let required = config.required || false 
    let defaultval = config.defaultval || null 
    let fn = config.fn || "" 
    let usedIn = (config.usedIn && Array.isArray(config.usedIn) && JSON.stringify(config.usedIn)) || JSON.stringify([])
    return {alias, sortval, vis, archived, deleted, GBtype, required, defaultval, fn, usedIn}
}
const validGBtypes = ["string", "number", "boolean", "date", "list", "null", "prev", "next", "function", "tag", "association", "result", "cumulative", "link"] //link is not really valid, but is always handled
const validTableTypes = ['static', 'transaction', 'interaction']
const validListItemTypes = ['context','contextLink','function','string','number','result']
const validNumberFormats = ['AU', '%',]
const checkConfig = (validObj, testObj, li) =>{//use for new configs, or update to configs
    //whichConfig = base, table, column, ..row?
    li = (li) ? true : false
    let nullValids = {string: true, number: true, boolean: true, null: true, object: false, function: false}
    for (const key in testObj) {
        if (validObj[key] !== undefined) {//key is valid
            const tTypeof = typeof testObj[key];
            const vTypeof = typeof validObj[key]
            if(vTypeof === null && !nullValids[tTypeof]){//wildcard check
                let err = 'typeof value must be one of: '+ nullValids
                throw new Error(err)
            }else if(vTypeof !== tTypeof){
                let err = vTypeof + ' !== '+ tTypeof
                throw new Error(err)
            }
            if(key === 'type' && !validTableTypes.includes(testObj[key])){
                let err = 'Table type does not match one of: '+ validTableTypes.join(', ')
                throw new Error(err)
            }
            if(key === 'GBtype' && !li && !validGBtypes.includes(testObj[key])){//type check the column data type
                let err = 'GBtype does not match one of: '+ validGBtypes.join(', ')
                throw new Error(err)
            }
            if(key === 'GBtype' && li && !validListItemTypes.includes(testObj[key])){//type check the column data type
                let err = 'GBtype does not match one of: '+ validListItemTypes.join(', ')
                throw new Error(err)
            }
            return true
        }else{
            let err = key + ' does not match valid keys of: '+ Object.keys(validObj).join(', ')
            throw new Error(err)
        }
    }    
}

const makehandleConfigChange = (gun,gb,cache,gunSubs,loadColDataToCache,newColumn,cascade,solve,timeLog) => (configObj, path, backLinkCol, cb)=>{
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    //this._path from wherever config() was called
    cb = (cb instanceof Function && cb) || function(){}
    const handleFNColumn = makehandleFNColumn(gun,gb,gunSubs,cache,loadColDataToCache,cascade,solve)
    const handleLinkColumn = makehandleLinkColumn(gun, gb,cache, gunSubs, loadColDataToCache,newColumn)
    const changeColumnType = makechangeColumnType(gun,gb,cache,loadColDataToCache,handleLinkColumn,handleFNColumn)
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
        //these should throw errors and stop the call if they don't pass
        checkConfig(validConfig, configObj)
        checkUniqueAlias(gb, cpath, configObj.alias)//will pass if alias is not present
        checkUniqueSortval(gb,cpath, configObj.sortval)//same as alias
        if(configObj.GBtype || configObj.linksTo || configObj.fn){//new type change or update to link of fn
            let typeStuff = {}
            for (const key in configObj) {//split config obj for normal configs vs type/link configs
                if(key === 'GBtype' || key === 'linksTo' || key === 'linkMultiple' || key === "fn" || key === 'linkColumnTo'){
                    typeStuff[key] = configObj[key]
                    delete configObj[key]
                }
            }
            if(typeStuff.GBtype && typeStuff.GBtype !== thisColConfig.GBtype){//change col type
                if(thisColConfig.GBtype === 'function'){
                    handleFNColumn(path, {fn: ''}, cb)
                }
                changeColumnType(path, typeStuff, backLinkCol,cb)
            }else if(typeStuff.fn && thisColConfig.GBtype === 'function'){//update function
                handleFNColumn(path, typeStuff, cb)
            }else if(typeStuff.linksTo && ['prev', 'next'].includes(thisColConfig.GBtype)){//update linksTo
                if(thisColConfig.usedIn.length !== 0){
                    throw new Error('Cannot change link to this column. A function references it')
                }else{
                    handleLinkColumn(path,typeStuff,backLinkCol,cb)
                }
                
            }else{
                throw new Error('GBtype is already type specified')
            }
        }
        if(Object.keys(configObj).length !== 0){
            timeLog(csoul, configObj)
            gun.get(csoul).put(configObj)
            cb.call(this, undefined)
        }
    }
    return true
}
const makechangeColumnType = (gun,gb,cache,loadColDataToCache,handleLinkColumn, handleFNColumn) =>function changeColtype(path, configObj, backLinkCol,cb){
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let [base, tval, pval] = path.split('/')
        let newType = configObj.GBtype
        if(pval[0] !== 'p'){
            throw new Error('Can only change GBtype of columns')
        }
        let cpath = configPathFromChainPath(path)
        let configCheck = newColumnConfig()
        checkConfig(configCheck, {GBtype: newType})
        let colParam = getValue(cpath,gb)
        if(colParam.GBtype === newType){
            throw new Error('GBtype is already this type')
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
                changeColtype(otherLink,{GBtype: 'string'},cb)
            }else{
                cb.call(this,undefined)
            }
        }
        let colSoul = base + '/' + tval + '/' + pval
        
        if(newType === 'string' || newType === 'number' || newType === 'boolean'){//100% pass, or error and change nothing.
            let data = getValue([base,tval,pval], cache)
            if(!data){
                loadColDataToCache(base,tval,pval)
                setTimeout(changeColtype, 100, path, configObj, backLinkCol,cb)
                return
            }
            //forin keys and attempt to change values over
            //maybe just abort the conversion and alert user which cell(s) needs attention
            let putObj = {}
            for (const key in data) {
                let HID = getValue([base, 'props', tval, 'rows', key], gb)
                const value = data[key]
                putObj[key] = convertValueToType(gb, value, newType, HID) 
            }
            gun.get(colSoul + '/config').get('GBtype').put(newType)
            gun.get(colSoul).put(putObj)
            cb.call(this, undefined)         
        }else if (newType === 'link' || newType === 'prev' || newType === 'next'){//parse values for linking
            //initial upload links MUST look like: "HIDabc, HID123" spliting on ", "
            let [linkBase, linkTval, linkPval] = (configObj.linksTo) ? configObj.linksTo.split('/') : [false,false,false]
            let [backLBase, backLTval, backLPval] = (backLinkCol) ? backLinkCol.split('/') : [false,false,false]
            if(configObj.linksTo && getValue([linkBase,'props',linkTval], gb)){//check linksTo is valid table
                if(backLinkCol && !getValue([backLBase,'props',backLTval, 'props', backLPval], gb)){//if backLinkCol specified, validate it exists
                    throw new Error('Aborted Linking: Back link column ['+backLinkCol+ '] on sheet: ['+ linkRowTo + '] Not Found')
                }
                handleLinkColumn(path, configObj, backLinkCol,cb) 
            }else{
                let err = 'config({linksTo: '+configObj.linksTo+' } is either not defined or invalid'
                throw new Error(err)
            }            
        }else if (newType === 'function'){//parse equation and store
            let fn = configObj.fn
            if(!fn){throw new Error('Must specify a function')}
            //check equation for valididty? balanced () and only one comparison per comma block?
            basicFNvalidity(fn)
            handleFNColumn(path, configObj, cb) //initial change to fn column         
        }else{
            throw new Error('Cannot understand what GBtype is specified')
        }
    }catch(e){
        cb.call(this,e)
        return
    }
    
}
const oldConfigVals = (gb,pathArr, configObj)=>{
    let oldObj = {}
    let config = getValue(pathArr, gb)
    for (const key in configObj) {
        oldObj[key] = config[key]
    }
    return oldObj
}

const makehandleInteractionConfigChange = (gun,gb,timeLog) => (configObj, path, cb)=>{
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    //this._path from wherever config() was called
    cb = (cb instanceof Function && cb) || function(){}
    let cpath = configPathFromChainPath(path)
    let csoul = configSoulFromChainPath(path)
    //cannot edit these config values from here, use .archive() or .delete() to change these values
    delete configObj.archived
    delete configObj.deleted
    if(cpath.length === 3 ){//tval change
        let validConfig = newInteractionTableConfig()
        checkConfig(validConfig, configObj)
        checkUniqueAlias(gb, cpath, configObj.alias)//will pass if alias is not present
        checkUniqueSortval(gb,cpath, configObj.sortval)//same as alias
        if(Object.keys(configObj).length !== 0){
            timeLog(csoul,configObj)
            gun.get(csoul).put(configObj)
            cb.call(this, undefined)
        }
        return true
    }else if(cpath.length === 5){//reg pval change
        const handleIntFNColumn = makehandleInteractionFNColumn(gun,gb)
        let validConfig = newInteractionColumnConfig()
        checkConfig(validConfig, configObj)
        checkUniqueAlias(gb, cpath, configObj.alias)//will pass if alias is not present
        checkUniqueSortval(gb,cpath, configObj.sortval)//same as alias
        let thisColConfig = getValue(cpath,gb)

        if(configObj.GBtype || configObj.associatedWith || configObj.fn){//new type change or update to link of fn
            let typeStuff = {}
            for (const key in configObj) {//split config obj for normal configs vs type/link configs
                if(key === 'GBtype' || key === 'associatedWith' || key === "fn"){
                    typeStuff[key] = configObj[key]
                    delete configObj[key]
                }
            }
            if(typeStuff.GBtype && typeStuff.GBtype !== thisColConfig.GBtype){//change col type
                throw new Error('Cannot change column type for interaction tables. Can only archive/delete and create another column')
            }else if(typeStuff.fn && thisColConfig.GBtype === 'function'){//update function
                handleIntFNColumn(path, typeStuff, cb)
            }else if(typeStuff.associatedWith && thisColConfig.GBtype === 'association'){//update linksTo
                throw new Error('Cannot change which table this is associated with, can only archive/delete this column')
            }else if (typeStuff.GBtype === thisColConfig.GBtype){
                throw new Error('GBtype is already type specified')
            }
        }

        if(Object.keys(configObj).length !== 0){
            timeLog(csoul,configObj)
            gun.get(csoul).put(configObj)
            cb.call(this, undefined)
        }
        return true
    }else if(cpath.length === 4){//li change
        let validConfig = newListItemsConfig()
        checkConfig(validConfig, configObj)
        if(Object.keys(configObj).length !== 0){
            timeLog(csoul,configObj)
            gun.get(csoul).put(configObj)
            cb.call(this, undefined)
        }
        return true
    }else if(cpath.length === 6){//li pval change
        const handleLIFNColumn = makehandleLIFNColumn(gun,gb)
        let validConfig = newListItemColumnConfig()
        checkConfig(validConfig, configObj, true)
        checkUniqueAlias(gb, cpath, configObj.alias)//will pass if alias is not present
        checkUniqueSortval(gb,cpath, configObj.sortval)//same as alias
        let thisColConfig = getValue(cpath,gb)

        if(configObj.GBtype || configObj.associatedWith || configObj.fn){//new type change or update to link of fn
            let typeStuff = {}
            for (const key in configObj) {//split config obj for normal configs vs type/link configs
                if(key === 'GBtype' || key === "fn"){
                    typeStuff[key] = configObj[key]
                    delete configObj[key]
                }
            }
            if(typeStuff.GBtype && typeStuff.GBtype !== thisColConfig.GBtype){//change col type
                throw new Error('Cannot change column type for list item sub-table. Can only archive/delete and create another column')
            }else if(typeStuff.fn && thisColConfig.GBtype === 'function'){//update function
                handleLIFNColumn(path, typeStuff, cb)
            }else if(typeStuff.fn && thisColConfig.GBtype === 'contextLink'){//update contextLink
                throw new Error('Cannot change a columns contextLink, can only archive/delete and create another column')
            }else if(thisColConfig.GBtype === 'context'){//update linksTo
                throw new Error('Cannot change context on List Item table')
            }else if (typeStuff.GBtype === thisColConfig.GBtype){
                throw new Error('GBtype is already type specified')
            }
        }

        if(Object.keys(configObj).length !== 0){
            timeLog(csoul,configObj)
            gun.get(csoul).put(configObj)
            cb.call(this, undefined)
        }
        return true
    }
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
function checkForCirc(gb, origpath, checkpathArr){//see if add this function will create a circular reference
    // get an object of all columns and their usedIn
    //while lookForArr is not empty >> foreach lookForArr Fullcollector.push && whileCollector.push all new links, set lookForArr = whileCollector??
    //after while loop stops, all usedIn's are traversed.
    //fullcollector should not include origpath
    let cols = {}
    let [base,tval,pval] = origpath.split('/')
    let cpath = configPathFromChainPath(origpath)
    let {usedIn} = getValue(cpath,gb)
    if(usedIn.length === 0){return true}
    for (const t in gb[base].props) {
        const ps = gb[base].props[t].props;
        for (const p in ps) {
            const pusedIn = ps[p].usedIn;
            let ppath = [base,t,p].join('/')
            cols[ppath] = pusedIn
        }
    }
    let lookFor = usedIn
    let collector = []
    let safety = 0
    //console.log(cols)
    while (lookFor.length !== 0 && safety < 500) {//will get stuck if there is already a circular reference
        safety ++
        let nextLook = []
        for (let i = 0; i < lookFor.length; i++) {
            const link = lookFor[i];
            if(cols[link]){
                collector = collector.concat(cols[link])
                nextLook = nextLook.concat(cols[link])
            }
        }
        lookFor = nextLook
    }
    if(safety >= 500){
        throw new Error('Already existing ciruclar reference detected')
    }
    console.log(collector, safety)
    for (let i = 0; i < checkpathArr.length; i++) {
        const path = checkpathArr[i];
        if(collector.includes(path)){
            let err = 'Adding this function will create a cirular reference through: '+ path
            throw new Error(err)
        }
    }
    return true
}
const makehandleFNColumn = (gun,gb,gunSubs,cache,loadColDataToCache, cascade, solve) => function handlefncol(path,configObj,cb){
    //parse equation for all links
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval,pval] = path.split('/')
        loadColDataToCache(base,tval,pval)
        let cpath = configPathFromChainPath(path)
        let thisColConfig = getValue(cpath,gb)
        let thisColConfigSoul = configSoulFromChainPath(path)
        let fn = configObj.fn
        let oldfn = thisColConfig.fn
        verifyLinksAndFNs(gb,path,fn)
        let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
        let links = []
        let checkmatch
        while (checkmatch = allLinkPattern.exec(fn)) {
            let path = checkmatch[1]
            links.push(path.split('.'))
        }
        let usedInLinks = []
        for (let i = 0; i < links.length; i++) {
            const linkArr = links[i];
            let link
            if (linkArr.length === 1){
                link = linkArr[0]
            }else{
                link = linkArr[1]
            }
            usedInLinks.push(link)
        }
        checkForCirc(gb,path,usedInLinks)
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
        //console.log(add, remove)
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
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        for (let i = 0; i < remove.length; i++) {
            const link = remove[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = removeFromArr(path,getValue(cpath,gb))
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        //console.log(usedIn)
        for (let i = 0; i < newLinksTo.length; i++) {
            const link = newLinksTo[i];
            let [base,tval,pval] = link.split('/')
            let soul = link
            if(!gunSubs[soul]){
                inMemory = false
                loadColDataToCache(base,tval,pval)
            }
        }
        let data = getValue([base,tval,pval], cache)
        if(!inMemory){
            //console.log(data)
            setTimeout(handlefncol,1000,path,configObj,cb)
            return
        }else{
            for (const rowid in data) {
                let val = solve(rowid, fn)
                result[rowid] = val
            }
            // console.log(usedIn)

            for (const csoul in usedIn) {//update all usedIn's effected
                let val = usedIn[csoul]
                gun.get(csoul).put(val)
            }
            if(configObj.GBtype && configObj.GBtype !== thisColConfig.GBtype){//update the config type, this is a changeColType
                gun.get(thisColConfigSoul).put({GBtype: 'function'})
            }
            gun.get(thisColConfigSoul).put({fn: fn})//add fn to config
            let colSoul = [base,tval,pval].join('/')
            //console.log(result)
            gun.get(colSoul).put(result)//put the new calc results in to gun

            //need to check if this col is used in anything else and manually start the cascades
            let triggers = thisColConfig.usedIn
            if(triggers.length){
                let rows = getValue([base,'props',tval,'rows'])
                //console.log(rows, pval)
                for (const rowid in rows) {
                    cascade(rowid, pval)
                }
            }
            cb.call(this,undefined)
        }
    }catch(e){
        console.log(e)
        cb.call(this, e)
        return
    }
}
const makehandleInteractionFNColumn = (gun,gb) => function handlefncol(path,configObj,cb){
    //parse equation for all links
    try{
        cb = (cb instanceof Function && cb) || function(){}
        //let [base,tval,pval] = path.split('/')
        //loadColDataToCache(base,tval,pval)
        let cpath = configPathFromChainPath(path)
        let thisColConfig = getValue(cpath,gb)
        let thisColConfigSoul = configSoulFromChainPath(path)
        let fn = configObj.fn
        let oldfn = thisColConfig.fn
        verifyLinksAndFNs(gb,path,fn)
        let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
        let links = []
        let checkmatch
        while (checkmatch = allLinkPattern.exec(fn)) {
            let path = checkmatch[1]
            links.push(path.split('.'))
        }
        let usedInLinks = []
        for (let i = 0; i < links.length; i++) {
            const linkArr = links[i];
            let link
            if (linkArr.length === 1){
                link = linkArr[0]
            }else{
                link = linkArr[1]
            }
            usedInLinks.push(link)
        }
        checkForCirc(gb,path,usedInLinks)
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
        //console.log(add, remove)
        let usedIn = {}
        //let result = {}
        //let inMemory = true
        for (let i = 0; i < add.length; i++) {
            const link = add[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = getValue(cpath,gb)
            newUsedIn.push(path)
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        for (let i = 0; i < remove.length; i++) {
            const link = remove[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = removeFromArr(path,getValue(cpath,gb))
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        //console.log(usedIn)
        // for (let i = 0; i < newLinksTo.length; i++) {
        //     const link = newLinksTo[i];
        //     let [base,tval,pval] = link.split('/')
        //     let soul = link
        //     if(!gunSubs[soul]){
        //         inMemory = false
        //         loadColDataToCache(base,tval,pval)
        //     }
        // }
        // let data = getValue([base,tval,pval], cache)
        // if(!inMemory){
        //     //console.log(data)
        //     setTimeout(handlefncol,1000,path,configObj,cb)
        //     return
        // }else{
        //     for (const rowid in data) {
        //         let val = solve(rowid, fn)
        //         result[rowid] = val
        //     }
        //     // console.log(usedIn)

        for (const csoul in usedIn) {//update all usedIn's effected
            let val = usedIn[csoul]
            gun.get(csoul).put(val)
        }
        // if(configObj.GBtype && configObj.GBtype !== thisColConfig.GBtype){//update the config type, this is a changeColType
        //     gun.get(thisColConfigSoul).put({GBtype: 'function'})
        // }
        gun.get(thisColConfigSoul).put({fn: fn})//add fn to config
        //let colSoul = [base,tval,pval].join('/')
        //console.log(result)
        //gun.get(colSoul).put(result)//put the new calc results in to gun

        //need to check if this col is used in anything else and manually start the cascades
        // let triggers = thisColConfig.usedIn
        // if(triggers.length){
        //     let rows = getValue([base,'props',tval,'rows'])
        //     //console.log(rows, pval)
        //     for (const rowid in rows) {
        //         cascade(rowid, pval)
        //     }
        // }
        cb.call(this,undefined)
    //}
    }catch(e){
        console.log(e)
        cb.call(this, e)
        return
    }
}
const makehandleLIFNColumn = (gun,gb) => function handlefncol(path,configObj,cb){
    //parse equation for all links
    try{
        cb = (cb instanceof Function && cb) || function(){}
        //let [base,tval,pval] = path.split('/')
        //loadColDataToCache(base,tval,pval)
        let cpath = configPathFromChainPath(path)
        let thisColConfig = getValue(cpath,gb)
        let thisColConfigSoul = configSoulFromChainPath(path)
        let fn = configObj.fn
        let oldfn = thisColConfig.fn
        verifyLILinksAndFNs(gb,path,fn)
        let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
        let links = []
        let checkmatch
        while (checkmatch = allLinkPattern.exec(fn)) {
            let path = checkmatch[1]
            links.push(path.split('.'))
        }
        let usedInLinks = []
        for (let i = 0; i < links.length; i++) {
            const linkArr = links[i];
            let link
            if (linkArr.length === 1){
                link = linkArr[0]
            }else{
                link = linkArr[1]
            }
            usedInLinks.push(link)
        }
        checkForCirc(gb,path,usedInLinks)
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
        //console.log(add, remove)
        let usedIn = {}
        //let result = {}
        //let inMemory = true
        for (let i = 0; i < add.length; i++) {
            const link = add[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = getValue(cpath,gb)
            newUsedIn.push(path)
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        for (let i = 0; i < remove.length; i++) {
            const link = remove[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = removeFromArr(path,getValue(cpath,gb))
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        //console.log(usedIn)
        // for (let i = 0; i < newLinksTo.length; i++) {
        //     const link = newLinksTo[i];
        //     let [base,tval,pval] = link.split('/')
        //     let soul = link
        //     if(!gunSubs[soul]){
        //         inMemory = false
        //         loadColDataToCache(base,tval,pval)
        //     }
        // }
        // let data = getValue([base,tval,pval], cache)
        // if(!inMemory){
        //     //console.log(data)
        //     setTimeout(handlefncol,1000,path,configObj,cb)
        //     return
        // }else{
        //     for (const rowid in data) {
        //         let val = solve(rowid, fn)
        //         result[rowid] = val
        //     }
        //     // console.log(usedIn)

        for (const csoul in usedIn) {//update all usedIn's effected
            let val = usedIn[csoul]
            gun.get(csoul).put(val)
        }
        // if(configObj.GBtype && configObj.GBtype !== thisColConfig.GBtype){//update the config type, this is a changeColType
        //     gun.get(thisColConfigSoul).put({GBtype: 'function'})
        // }
        gun.get(thisColConfigSoul).put({fn: fn})//add fn to config
        //let colSoul = [base,tval,pval].join('/')
        //console.log(result)
        //gun.get(colSoul).put(result)//put the new calc results in to gun

        //need to check if this col is used in anything else and manually start the cascades
        // let triggers = thisColConfig.usedIn
        // if(triggers.length){
        //     let rows = getValue([base,'props',tval,'rows'])
        //     //console.log(rows, pval)
        //     for (const rowid in rows) {
        //         cascade(rowid, pval)
        //     }
        // }
        cb.call(this,undefined)
    //}
    }catch(e){
        console.log(e)
        cb.call(this, e)
        return
    }
}
//LINK STUFF

const makehandleLinkColumn = (gun, gb, cache, gunSubs, loadColDataToCache, newColumn) =>function handlelinkcol(path, configObj, backLinkCol, cb){
    try{
        cb = (cb instanceof Function && cb) || function(){}
        if(configObj.linkColumnTo === undefined){throw new Error('Must use the ".linkColumnTo()" API to make a column a link')}
        let [base, tval, pval] = path.split('/')
        let [linkBase, linkTval, linkPval] = (configObj.linksTo) ? configObj.linksTo.split('/') : [false,false,false]
        let [backLBase, backLTval, backLPval] = (backLinkCol) ? backLinkCol.split('/') : [false,false,false]
        let cpath = configPathFromChainPath(path)
        let config = getValue(cpath,gb)
        let data = getValue([base,tval,pval], cache)
        if(!data){
            loadColDataToCache(base,tval,pval)
            setTimeout(handlelinkcol, 100, path, configObj, backLinkCol,cb)
            return
        }
        if(config.GBtype === 'prev' || config.GBtype === 'next'){//already a link col
            for (const key in data) {
                const value = data[key];
                if(Array.isArray(value) && value.length !== 0){
                    throw new Error('To change a link column, you must remove all data from column.')
                }
            }
        }
        let targetLink = configObj.linksTo
        let targetTable = targetLink.t

        let colSoul = [base,tval,pval].join('/')
        let nextColSoul = (backLinkCol) ? [backLBase,backLTval,backLPval].join('/') : false
    
        let prevConfig = {path,colSoul}
        let nextConfig = {path: configObj.linksTo,nextLinkCol: backLinkCol, colSoul: nextColSoul}
        

        if(Object.keys(data).length === 0){
            handleNewLinkColumn(gun, gb, gunSubs, newColumn, loadColDataToCache, prevConfig, nextConfig,cb)
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
                    }else if(HID !== 'null'){
                        if(!confirm('Cannot find: '+ HID + '  Continue linking?')){
                            let err = 'LINK ABORTED: Cannot find a match for: '+ HID + ' on table: ' + targetTable
                            throw new Error(err)
                        }
                        if(!putObj[GBID]){putObj[GBID] = {}}
                    }else{
                        if(!putObj[GBID]){
                            putObj[GBID] = {}
                        }
                    }
                }
            }
        }
        prevConfig.data = putObj
        nextConfig.data = nextObj
        handleNewLinkColumn(gun, gb, gunSubs, newColumn, loadColDataToCache, prevConfig, nextConfig,cb)
    }catch(e){
        cb.call(this,e)
    }
}
function handleNewLinkColumn(gun, gb, gunSubs, newColumn, loadColDataToCache, prev, next,cb){
    // let prevConfig = {path,colSoul, data: prevPutObj}
    // let nextConfig = {path: configObj.linksTo,nextLinkCol: backLinkCol, data: nextPutObj}
    cb = (cb instanceof Function && cb) || function(){}
    gunSubs[prev.colSoul] = false
    if(next.colSoul){//all data
        gunSubs[next.colSoul] = false
        gun.get(next.colSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            //gun.get(next.colSoul).put(next.data)
            let [base,tval,pval] = next.colSoul.split('/')
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
            let [base,tval,pval] = prev.colSoul.split('/')
            for (const rowid in prev.data) {
                const linksObj = prev.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
        cb.call(this,undefined)
    }else{//create new next col on linksTo sheet
        console.log(next.path)
        let [nextb,nextt] = next.path.split('/')
        let call = newColumn(next.path)
        let [pbase,ptval]=prev.path.split('/')
        let {alias} = getValue([pbase,'props',ptval],gb)
        let nextP = call(alias)
        if(next.data === undefined){
            next.data = false
        }
        console.log(nextP)
        if(nextP[0] !== 'p'){return console.log('did not return a new pval for new next col')}
        let nextColSoul = [nextb,nextt,nextP].join('/')
        gun.get(nextColSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            //gun.get(nextColSoul).put(next.data)
            for (const rowid in next.data) {
                const linksObj = next.data[rowid];
                let linkSoul = rowid +'/links/'+nextP
                gun.get(linkSoul).put(linksObj)
            }
            gunSubs[nextColSoul] = false
            let [base,tval,pval]=nextColSoul.split('/')
            loadColDataToCache(base,tval,pval)
        }
        

        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: nextColSoul})
        if (prev.data !== undefined) {
            //gun.get(prev.colSoul).put(prev.data)
            let [base,tval,pval] = prev.colSoul.split('/')
            for (const rowid in prev.data) {
                const linksObj = prev.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
        cb.call(this, undefined)
    }
    
}


//IMPORT STUFF

const handleImportColCreation = (gun, gb, base, tval, colHeaders, datarow, append)=>{
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
            const palias = String(colHeaders[i]);
            const colType = typeof datarow[i]
            const pval = 'p'+ i
            const sort = i*10
            results[palias] = pval
            let pconfig = newColumnConfig({alias: palias, GBtype: colType, sortval: sort})
            let typeCheck = checkConfig(newColumnConfig(), pconfig)
            if(typeCheck){
                gun.get(path + '/' + pval + '/config').put(pconfig)
                gun.get(path + '/p').put({[pval]: true})
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
        let nextP = findNextID(gb, path)
        let pInt = nextP.slice(1) *1
        let nextS = nextSortval(gb, path)
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
                    gun.get(path + '/' + pval + '/config').put(pconfig)
                    gun.get(path + '/p').put({[pval]: true})
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
const handleTableImportPuts = (gun, path, resultObj, cb)=>{
    //console.log(resultObj)
    //path base/tval
    cb = (cb instanceof Function && cb) || function(){}
    let basesoul = path + '/'
    //console.log(basesoul)
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
    cb.call(this, undefined)
}
module.exports = {
    newBaseConfig,
    newTableConfig,
    newInteractionTableConfig,
    newInteractionColumnConfig,
    newColumnConfig,
    makehandleConfigChange,
    makehandleInteractionConfigChange,
    makechangeColumnType,
    oldConfigVals,
    makehandleLinkColumn,
    handleNewLinkColumn,
    handleImportColCreation,
    handleTableImportPuts,
    makehandleFNColumn,
    newListItemsConfig,
    newListItemColumnConfig,
    checkConfig,
    basicFNvalidity
}