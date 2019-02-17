const{newBaseConfig,newTableConfig,newColumnConfig} = require('./configs')
const{getValue,checkConfig, configPathFromChainPath, findID, findRowID, tsvJSONgb, watchObj} = require('./util')

//GBASE CHAIN COMMANDS
const makenewBase = gun => (alias, tname, pname, baseID) =>{
    if(baseID === undefined){
        baseID = 'B' + Gun.text.random(4)   
    }
    gun.get('GBase').put({[baseID]: true})
    gun.get(baseID + '/config').put(newBaseConfig({alias}))
    gun.get(baseID + '/t0/config').put(newTableConfig({alias: tname}))
    gun.get(baseID + '/t0/r/p0/config').put(newColumnConfig({alias: pname}))   
    gun.get(baseID + '/t0/r/p').put({p0: true})
    gun.get(baseID + '/t').put({t0: true})
    return baseID
}
const makenewTable = (gun, findNextID, nextSortval) => (path) => (tname, pname)=>{
    let nextT = findNextID(path)
    let tconfig = newTableConfig({alias: tname, sortval: nextSortval(path)})
    let pconfig = newColumnConfig({alias: pname})
    gun.get(path + '/' + nextT + '/config').put(tconfig)
    gun.get(path + '/' + nextT + '/r/p0/config').put(pconfig)
    gun.get(path + '/t').put({[nextT]: true})
    gun.get(path + '/' + nextT + '/r/p').put({p0: true})
}
const makenewColumn = (gun, findNextID, nextSortval) => (path) => (pname, type)=>{
    let nextP = findNextID(path)
    let pconfig = newColumnConfig({alias: pname, GBtype: type, sortval: nextSortval(path)})
    let typeCheck = checkConfig(newColumnConfig(), pconfig)
    if(typeCheck){
        gun.get(path + '/r/' + nextP + '/config').put(pconfig)
        gun.get(path + '/r/p').put({[nextP]: true})
    }else{
        return console.log('ERROR: invalid type give: '+ type)
    }
    return nextP
}
const makenewRow = (checkUniqueAlias, edit) => (path) => (alias, data)=>{//HANDLE NEW PUT HERE, MOVE FROM EDIT
    if(alias === undefined || typeof alias === 'object'){
        return console.log('ERROR: You must specify an alias for this column, you supplied: '+ alias)}
    let tpath = path
    let id = 'r' + Gun.text.random(6)
    let fullpath = tpath + '/' + id
    let rowpath = configPathFromChainPath(fullpath)
    let aliasCheck = checkUniqueAlias(rowpath, alias)
    let call = edit(fullpath,false,true,alias)
    if(aliasCheck){
        call(data)
    }else{
        return console.log('ERROR: [ ' + alias + ' ] is not a unique row name on this table')
    }
}
const makelinkColumnTo = (gb, handleConfigChange) => path => (linkTableOrBackLinkCol)=>{
    if(path.split('/')[2]==='p0'){return console.log("ERROR: Cannot use the first column to link another table")}
    let cpath = configPathFromChainPath(path)
    let colType = getValue(cpath, gb).GBtype
    let configObj = {}
    if(!colType){return console.log("ERROR: Cannot find the type of this column")}
    if(colType === 'prev' || colType === 'next'){
        return console.log('ERROR: Column is already a link column, to add more links, use "linkRowTo()"')
    }else{
        configObj.GBtype = 'link'
    }
    if(typeof linkTableOrBackLinkCol === 'object'){
        linkTableOrBackLinkCol = linkTableOrBackLinkCol._path || undefined
    }
    if(linkTableOrBackLinkCol === undefined){return console.log('ERROR: Must pass in a gbase[baseID][tval] or the column with the recipricol links')}
    configObj.linksTo = linkTableOrBackLinkCol
    let linkPath = linkTableOrBackLinkCol.split('/')
    if(linkPath.length === 2 || linkPath.length === 3 && linkPath[2] === 'p0'){//table or table key column
        handleConfigChange(configObj, path, undefined)
    }else{// it is assumed to be the actual backlinkcolumn
        handleConfigChange(configObj, path, linkTableOrBackLinkCol)
    }
}
const makeconfig = handleConfigChange => (path) => (configObj, backLinkCol) =>{
    try{
        handleConfigChange(configObj, path, backLinkCol)
        return true
    }catch(e){
        console.log(e)
        return false
    }
}
const makeedit = (gun,gb,validateData,handleRowEditUndo) => (path,byAlias,newRow,newAlias) => (editObj)=>{//MOVE NEW ROW TO THE NEWROW API
    newRow = (newRow) ? true : false
    let aliasCol = (byAlias) ? true : false
    let args = path.split('/')
    let base = args[0]
    let tval = args[1]
    let tpath = configPathFromChainPath([base,tval].join('/'))
    let ppath = tpath.slice()
    let checkTable = getValue(tpath, gb)
    ppath.push('props')
    let cols = getValue(ppath, gb)
    let putObj = {}
    //parse meaning of non config edit
    if (checkTable !== undefined) {//valid base and table
        //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
        if(aliasCol){
            for (const palias in editObj) {
                let pval = findID(cols, palias)
                if (pval) {
                    putObj[pval] = editObj[palias]; 
                }else{
                    return console.log('ERROR: Cannot find column with name [ '+ palias +' ]. Edit aborted')
                }
            }
        }else{
            putObj = editObj
        }
        let validatedObj = validateData(path,putObj) //strip prev, next, tags, fn keys, check typeof on rest
        if(!validatedObj){return}
        console.log(validatedObj)
        for (const key in validatedObj) {
            let colSoul = base + '/' + tval + '/r/' + key
            const value = validatedObj[key];
            if(key !== 'p0'){//put non-row name changes
                gun.get(colSoul).get(path).put(value)
            }else if(key === 'p0' && !newRow){
                //check uniqueness
                let rowpath = configPathFromChainPath(path)
                let aliasCheck = checkUniqueAlias(rowpath, alias)
                if(aliasCheck){
                    gun.get(colSoul).get(path).put(value)
                }
            }else if(newRow && newAlias){
                //new row, uniqueness already checked
                gun.get(colSoul).get(path).put(newAlias)
            }         
        }
        handleRowEditUndo(path,validatedObj)
    }else{
        return console.log('Cannot find base:[ '+ base +' ] and/or table: '+ tval)
    }
}
const makesubscribe = (gb,gsubs, requestInitialData) => (path) => (callBack, colArr, onlyVisible, notArchived, udSubID) =>{
    if(typeof callBack !== 'function'){return console.log('ERROR: Must pass a function as a callback')}

    if(onlyVisible === undefined){//default, only subscribe/return to items that are both visible and not archived, UI basically
        onlyVisible = true //false would subscribe/return hidden columns as well
    }
    if(notArchived === undefined){
        notArchived = true //false would subscribe/return archived columns
    }
    let pathArgs = path.split('/')
    let subID = udSubID || Gun.text.random(6)
    let base = pathArgs[0]
    let tval = pathArgs[1]
    let pval, rowid, level, objKey

    if(pathArgs.length === 2){
        level = 'table'
    }else if(pathArgs.length === 3 && pathArgs[2][0] === 'r'){
        level = 'row'
    }else{
        level = 'column'
    }
    let columns = []
    if(level !== 'column'){
        let cols = getValue([pathArgs[0], 'props', pathArgs[1], 'props'], gb)
        if(colArr){// check for pvals already, or attemept to convert col array to pvals
            for (let j = 0; j < colArr.length; j++) {
                const col = colArr[j];
                if(col[0] === 'p' && col.slice(1)*1 > -1){//if col is 'p' + [any number] then already pval
                    columns.push(col)
                }else{
                    let pval = findID(cols, col)
                    if(pval !== undefined && cols[pval].vis === onlyVisible && !cols[pval].archived === notArchived && !cols[pval].deleted){
                        columns.push(pval)
                    }else{
                        console.log('ERROR: Cannot find column with name: '+ col)
                    }
                }
            }
        }else{//full object columns
            for (const colp in cols) {
                if(cols[colp].vis === onlyVisible && !cols[colp].archived === notArchived && !cols[colp].deleted){
                    columns.push(colp)
                }
            }
        }
    }
    let colsString
    if(Array.isArray(columns)){colsString = columns.join(',')}
    let tstring = base +'/' + tval + '/'
    //with filtered column list, generate configs from given args
    if(level === 'row'){//row path
        rowid = pathArgs[2]
        if(colArr !== undefined){
            objKey = tstring + rowid + '/' + colsString + '-' + subID
        }else{
            objKey = tstring + rowid + '/' + 'ALL-' + subID
        }
    }else if(level === 'column'){//column path
        pval = pathArgs[2]
        objKey = tstring + 'r/' + pval + '-' + subID
    }else{//table path
        rowid = false
        pval = false
        if(colArr !== undefined){
            objKey = tstring  + colsString + '-' + subID
        }else{
            objKey = tstring + 'ALL-' + subID
        }
    }
    if(typeof gsubs[base] !== 'object'){
        gsubs[base] = new watchObj()
    }
    if(!gsubs[base][objKey]){
        gsubs[base].watch(objKey,callBack)//should fire CB on update
        let cached = requestInitialData(path,columns,level)//returns what is in cache, sets up gun subs that are missing
        gsubs[base][objKey] = cached //should fire off with user CB?
    }
}
const makeretrieve = gb => (path) => (colArr) =>{
    let pathArgs = path.split('/')
    let cols = getValue([pathArgs[0], 'props', pathArgs[1], 'props'], gb)
    let rowid = pathArgs[2]
    let results = {}
    let columns = []
    if(colArr){// check for pvals already, or attemept to convert col array to pvals
        for (let j = 0; j < colArr.length; j++) {
            const col = colHeaders[j];
            if(col[0] === 'p' && col.slice(1)*1){//if col is 'p' + [any number] then already pval
                columns.push(col)
            }else{
                let pval = findID(cols, col)
                if(pval !== undefined){
                    columns.push(pval)
                }else{
                    console.log('ERROR: Cannot find column with name: '+ col)
                }
            }
        }
    }else{//full object columns
        for (const colp in cols) {
            if(!cols[colp].archived || !cols[colp].deleted){
                columns.push(colp)
            }
        }
    }
    console.log(path)
    return getRow(path, columns, 0)

}
const makelinkRowTo = (gun, gb, getCell) => (path, byAlias) => function thisfn(property, gbaseGetRow){
    //gbaseGetRow = gbase[base][tval][rowID]
    let [base,tval,r] = path.split('/')
    let cols = getValue([base,'props',tval,'props'], gb)
    let pval
    if(byAlias){
        pval = findID(cols,property)
        if(!pval){
            return console.log('ERROR: Cannot find column with name [ '+ pval +' ]. Edit aborted')
        }
    }else{
        pval = property
    }
    let colpath = [base,tval,pval].join('/')
    let colType = cols[pval].GBtype
    let linksTo = cols[pval].linksTo
    if(colType !== 'prev' && colType !== 'next'){throw new Error('Can only link rows if the column type is already set.')}

    let targetLink
    if(typeof gbaseGetRow === 'object'){
        targetLink = gbaseGetRow._path
    }else if(gbaseGetRow.split('/').length === 3){
        targetLink = gbaseGetRow
    }else{
        throw new Error('Cannot detect what row you are trying to link to. For the second argument pass in the gbase chain for the link row: gbase[baseID][table][row]')
    }
    let [lbase,ltval,lr] = targetLink.split('/')
    let lt = linksTo.split('/')
    let lpval = lt[2]
    let lconfig = getValue([lbase,'props',ltval,'props',lpval],gb)
    let llinksTo = lconfig.linksTo
    let lcolpath = [lbase,ltval,lpval].join('/')
    let lcollm = lconfig.linkMultiple
    if(llinksTo !== colpath){throw new Error('Column mismatch, cannot find the back link')}
    let prevCol = {}
    if(colType === 'prev'){//figure out which is prev col
        prevCol.path = path
        prevCol.colpath = colpath
        prevCol.lm = cols[pval].linkMultiple
    }else{
        prevCol.path = targetLink
        prevCol.colpath = lcolpath
        prevCol.lm = lcollm
    }
    if(!prevCol.lm){//link single, check for no current links
        let links = getCell(prevCol.path, prev.colpath)
        if(links === undefined){
            setTimeout(thisfn,100,property,gbaseGetRow)
            return false
        }else if(links.length !== 0){
            throw new Error('Cannot link another row, as the column settings only allow a single link')
        }
    }
    let pathLinkSoul = path +'/links/'+pval
    let lpathLinkSoul = targetLink + '/links/'+lpval
    gun.get(pathLinkSoul).get(targetLink).put(true)
    gun.get(lpathLinkSoul).get(path).put(true)
    return true
}
const makeunlinkRow = (gun, gb) => (path, byAlias) => function thisfn(property, gbaseGetRow){
    //gbaseGetRow = gbase[base][tval][rowID]
    let [base,tval,r] = path.split('/')
    let cols = getValue([base,'props',tval,'props'], gb)
    let pval
    if(byAlias){
        pval = findID(cols,property)
        if(!pval){
            return console.log('ERROR: Cannot find column with name [ '+ pval +' ]. Edit aborted')
        }
    }else{
        pval = property
    }
    let colpath = [base,tval,pval].join('/')
    let colType = cols[pval].GBtype
    let linksTo = cols[pval].linksTo
    if(colType !== 'prev' && colType !== 'next'){throw new Error('Can only unlink rows if the column type is already set.')}

    let targetLink
    if(typeof gbaseGetRow === 'object'){
        targetLink = gbaseGetRow._path
    }else if(gbaseGetRow.split('/').length === 3){
        targetLink = gbaseGetRow
    }else{
        throw new Error('Cannot detect what row you are trying to link to. For the second argument pass in the gbase chain for the link row: gbase[baseID][table][row]')
    }
    let [lbase,ltval,lr] = targetLink.split('/')
    let lt = linksTo.split('/')
    let lpval = lt[2]
    let lconfig = getValue([lbase,'props',ltval,'props',lpval],gb)
    let llinksTo = lconfig.linksTo
    if(llinksTo !== colpath){throw new Error('Column mismatch, cannot find the back link')}
    let pathLinkSoul = path +'/links/'+pval
    let lpathLinkSoul = targetLink + '/links/'+lpval
    gun.get(pathLinkSoul).get(targetLink).put(false)
    gun.get(lpathLinkSoul).get(path).put(false)
    return true
}
const makeimportData = (gb, handleImportColCreation, handleTableImportPuts) => (path) => (tsv, ovrwrt, append)=>{//UNTESTED
    //gbase[base].importNewTable(rawTSV, 'New Table Alias')
    if(ovrwrt !== undefined){//turn truthy falsy to boolean
        ovrwrt = (ovrwrt) ? true : false
    }else{
        ovrwrt = false
    }
    if(append !== undefined){
        append = (append) ? true : false
    }else{
        append = true
    }
    //append && ovrwrt: Add non-existing rows, and update existing rows
    //append && !ovrwrt: Add non-exiting rows, do not update existing rows <---Default
    //!append && ovrwrt: Do not add non-existing rows, update existing rows

    let dataArr = tsvJSONgb(tsv)
    let base = path.split('/')[0]
    let tval = path.split('/')[1]
    let result = {}
    let headers = dataArr[0]
    let headerPvals = handleImportColCreation(base, tval, headers, dataArr[1], append)
    let existingRows = getValue([base,'props',tval,'rows'], gb)

    for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
        const rowArr = dataArr[i];
        let rowsoul = findRowID(existingRows, rowArr[0])
        if(rowsoul === undefined){
            rowsoul =  base + '/' + tval + '/r' + Gun.text.random(6)
        }
        if(rowArr[0] && ((append && ovrwrt)||(!append && ovrwrt && soul) || (!ovrwrt && append && !soul))){//only add if user said so
            for (let j = 0; j < rowArr.length; j++) {
                const value = rowArr[j];
                if(value !== ""){//ignore empty strings only
                    const header = headers[j]
                    const headerPval = headerPvals[header]
                    let GBidx = {}
                    GBidx[rowsoul] = value
                    result[headerPval] = Object.assign(result[headerPval], GBidx)
                }
            }
        }
    }
    handleTableImportPuts(path, result)
}
const makeimportNewTable = (gun, checkUniqueAlias, findNextID,nextSortval,handleImportColCreation,handleTableImportPuts,rebuildGBchain) => (path) => (tsv, tAlias,)=>{
    //gbase[base].importNewTable(rawTSV, 'New Table Alias')
    let checkTname = checkUniqueAlias([path],tAlias)
    if(!checkTname){return console.log('ERROR: '+tAlias+' is not a unique table name')}
    let dataArr = tsvJSONgb(tsv)
    let tval = findNextID(path)
    let nextSort = nextSortval(path)
    let tconfig = newTableConfig({alias: tAlias, sortval: nextSort})
    gun.get(path + '/' + tval + '/config').put(tconfig)
    let result = {}
    let headers = dataArr[0]
    let headerPvals = handleImportColCreation(path, tval, headers, dataArr[1], true)
    for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
        const rowArr = dataArr[i];
        let rowsoul
        rowsoul =  path + '/' + tval + '/r' + Gun.text.random(6)
        if(rowArr[0]){//skip if HID is blank
            for (let j = 0; j < rowArr.length; j++) {
                const value = rowArr[j];
                if(value !== ""){//ignore empty strings only
                    const header = headers[j]
                    const headerPval = headerPvals[header]
                    if(typeof result[headerPval] !== 'object'){
                        result[headerPval] = {}
                    }
                    let GBidx = {}
                    GBidx[rowsoul] = value
                    result[headerPval] = Object.assign(result[headerPval], GBidx)
                }
            }
        }
    }
    gun.get(path + '/t').put({[tval]: true})
    let tpath = path + '/' + tval
    handleTableImportPuts(tpath, result)
    rebuildGBchain(tpath)
}

const makeshowgb = (gb) => () =>{
    console.log(gb)
}
const makeshowcache = (cache) => () =>{
    console.log(cache)
}
const makeshowgsub = (gsubs) => () =>{
    return gsubs
}
const makeshowgunsub = (gunSubs)=> () =>{
    return gunSubs
}

module.exports = {
    makenewBase,
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
    makeunlinkRow
}