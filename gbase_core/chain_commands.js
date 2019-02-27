const{newBaseConfig,newTableConfig,newColumnConfig,handleImportColCreation,handleTableImportPuts,checkConfig} = require('./configs')
const{getValue,
    configPathFromChainPath,
    findID,
    findRowID,
    tsvJSONgb,
    watchObj,
    convertValueToType,
    validateData,
    handleRowEditUndo,
    checkUniqueAlias,
    findNextID,
    nextSortval,
    getColumnType
} = require('./util')

//GBASE CHAIN COMMANDS
const makenewBase = gun => (alias, tname, pname, baseID) =>{
    baseID = baseID || 'B' + Gun.text.random(8)   
    gun.get('GBase').put({[baseID]: true})
    gun.get(baseID + '/config').put(newBaseConfig({alias}))
    gun.get(baseID + '/t0/config').put(newTableConfig({alias: tname}))
    gun.get(baseID + '/t0/r/p0/config').put(newColumnConfig({alias: pname}))   
    gun.get(baseID + '/t0/r/p').put({p0: true})
    gun.get(baseID + '/t').put({t0: true})
    return baseID
}
const makenewStaticTable = (gun, gb) => (path) => (tname, pname, tableType)=>{
    try{
        let cpath = configPathFromChainPath(path)
        let nextT = findNextID(gb,path)
        if(tableType && tableType !== 'static' && tableType !== 'asset'){
            throw new Error('Type must be either "static" or "asset".')
        }
        let tconfig = newTableConfig({alias: tname, sortval: nextSortval(gb,path), type:tableType})
        checkConfig(newTableConfig(), tconfig)
        checkUniqueAlias(gb, cpath, tconfig.alias)
        let pconfig = newColumnConfig({alias: pname})
        gun.get(path + '/' + nextT + '/config').put(tconfig)
        gun.get(path + '/' + nextT + '/r/p0/config').put(pconfig)
        gun.get(path + '/t').put({[nextT]: true})
        gun.get(path + '/' + nextT + '/r/p').put({p0: true})
        return nextT
    }catch(e){
        console.log(e)
        return e
    }
}
const makenewColumn = (gun, gb) => (path,linksTo) => (pname, type)=>{
    try{
        let cpath = configPathFromChainPath(path)
        let nextP = findNextID(gb,path)
        let pconfig
        if(linksTo){
            pconfig = newColumnConfig({alias: pname, GBtype: type, sortval: nextSortval(gb,path), linksTo})
        }else{
            pconfig = newColumnConfig({alias: pname, GBtype: type, sortval: nextSortval(gb,path)})
        }
        checkConfig(newColumnConfig(), pconfig)
        checkUniqueAlias(gb,cpath,pconfig.alias)
        gun.get(path + '/r/' + nextP + '/config').put(pconfig)
        gun.get(path + '/r/p').put({[nextP]: true})
        return nextP
    }catch(e){
        console.log(e)
        return false
    }
}
const makenewRow = (edit) => (path) => (alias, data, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        if(alias === undefined || typeof alias === 'object'){
            let err = 'You must specify an alias for this column, you supplied: '+ alias
            throw new Error(err)
        }
        let tpath = path
        let id = 'r' + Gun.text.random(6)
        let fullpath = tpath + '/' + id
        let call = edit(fullpath,false,true,alias)
        call(data, cb)
    }catch(e){
        cb.call(this, e)
        console.log(e)
    }
}
const makelinkColumnTo = (gb, handleConfigChange) => path => (linkTableOrBackLinkCol, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval,pval] = path.split('/')
        if(pval==='p0'){throw new Error("Cannot use the first column to link another table")}
        let cpath = configPathFromChainPath(path)
        let colType = getValue(cpath, gb).GBtype
        let configObj = {}
        if(!colType){throw new Error("Cannot find the type of this column")}
        if(colType === 'prev' || colType === 'next'){
            throw new Error('Column is already a link column, to add more links, use "linkRowTo()"')
        }else{
            configObj.GBtype = 'link'
        }
        if(typeof linkTableOrBackLinkCol === 'object'){
            linkTableOrBackLinkCol = linkTableOrBackLinkCol._path || undefined
        }
        if(linkTableOrBackLinkCol === undefined){throw new Error('Must pass in a gbase[baseID][tval] or gbase[baseID][tval][pval] where the pval is a column with the recipricol links')}
        configObj.linksTo = linkTableOrBackLinkCol
        let linkPath = linkTableOrBackLinkCol.split('/')
        let [lb, lt, lp] = linkPath
        let ltPs = getValue([lb,'props',lt,'props'], gb)
        if(lt === tval){throw new Error('Cannot link a table to itself')}
        //check for already existing 'next' link on lt, can only have one
        for (const p in ltPs) {
            let ltpconfig = ltPs[p]
            const type = ltpconfig.GBtype;
            const a = ltpconfig.archived;
            const d = ltpconfig.deleted;
            if(type === 'next' && !a && !d){
                let err = 'Can only have one "next" link column per table. Column: '+ ltpconfig.alias + ' is already a next column.'
                throw new Error(err)
            }
        }
        configObj.linkColumnTo = true
        if(linkPath.length === 2 || (linkPath.length === 3 && linkPath[2] === 'p0')){//table or table key column
            handleConfigChange(configObj, path, undefined, cb)
        }else if (linkPath.length === 3 && linkPath[2][0] === 'p'){// it is assumed to be the actual backlinkcolumn
            handleConfigChange(configObj, path, linkTableOrBackLinkCol, cb)
        }else{
            throw new Error('Cannot determine what table or column you are linking to')
        }
    }catch(e){
        cb.call(this,e)
        return
    }
}
const makeconfig = handleConfigChange => (path) => (configObj, backLinkCol,cb) =>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        handleConfigChange(configObj, path, backLinkCol,cb)
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return false
    }
}
const makeedit = (gun,gb,cascade) => (path,byAlias,newRow,newAlias,fromCascade) => (editObj, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        newRow = (newRow) ? true : false
        //let aliasCol = (byAlias) ? true : false
        let args = path.split('/')
        let base = args[0]
        let tval = args[1]
        let tpath = configPathFromChainPath([base,tval].join('/'))
        let ppath = tpath.slice()
        let checkTable = getValue(tpath, gb)
        ppath.push('props')
        let cols = getValue(ppath, gb)
        let putObj = {}
        //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
        //if(aliasCol){
        for (const palias in editObj) {
            let pval = findID(cols, palias) //will break if column has human name of 'p' + Number()
            if (pval) {
                putObj[pval] = editObj[palias]; 
            }else{
                let err = ' Cannot find column with name: '+ palias +'. Edit aborted'
                throw new Error(err)
            }
        }
        //}else{
        //    putObj = editObj
        //}
        let validatedObj = validateData(gb,path,putObj,fromCascade) //strip prev, next, tags, fn keys, check typeof on rest
        if(!validatedObj){return}
        //console.log(validatedObj)
        for (const key in validatedObj) {
            let colSoul = base + '/' + tval + '/r/' + key
            const value = validatedObj[key];
            if(key !== 'p0'){//put non-row name changes
                gun.get(colSoul).get(path).put(value)
                setTimeout(cascade,Math.floor(Math.random() * 500) + 250,path,key) //waits 250-500ms for gun call to settle, then fires cascade
            }else if(key === 'p0' && !newRow){
                //check uniqueness
                let rowpath = configPathFromChainPath(path)
                checkUniqueAlias(gb,rowpath, alias)
                gun.get(colSoul).get(path).put(value)
            }else if(newRow && newAlias){
                let rowpath = configPathFromChainPath(path)
                checkUniqueAlias(gb,rowpath,newAlias)
                gun.get(colSoul).get(path).put(newAlias)
            }else{
                throw new Error('Must specifiy at least a row alias for a new row.')
            }      
        }
        cb.call(this, false, path)

        handleRowEditUndo(gun,gb,path,validatedObj)
    }catch (e){
        cb.call(this, e)
    }
}
const makesubscribe = (gb,gsubs, requestInitialData) => (path) => (callBack, colArr, onlyVisible, notArchived, udSubID) =>{
    try{
        if(typeof callBack !== 'function'){
            throw new Error('Must pass a function as a callback')
        }

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
                    let pval = findID(cols, col)
                    if(pval !== undefined && cols[pval].vis === onlyVisible && cols[pval].archived !== notArchived && !cols[pval].deleted){
                        columns.push(pval)
                    }else if(pval === undefined){
                        let err = 'Cannot find column with name: '+ col
                        throw new Error(err)
                    }
                }
            }else{//full object columns
                for (const colp in cols) {
                    if(cols[colp].vis === onlyVisible && cols[colp].archived === !notArchived && !cols[colp].deleted){
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
            objKey = tstring + rowid + '/' + colsString + '-' + subID
        }else if(level === 'column'){//column path
            pval = pathArgs[2]
            objKey = tstring + 'r/' + pval + '-' + subID
        }else{//table path
            rowid = false
            pval = false
            objKey = tstring  + colsString + '-' + subID
        }
        if(typeof gsubs[base] !== 'object'){
            gsubs[base] = new watchObj()
        }
        if(!gsubs[base][objKey]){
            gsubs[base].watch(objKey,callBack)//should fire CB on update
            let cached = requestInitialData(path,columns,level)//returns what is in cache, sets up gun subs that are missing
            gsubs[base][objKey] = cached //should fire off with user CB?
        }
        return
    }catch(e){
        console.log(e)
        return e
    }
}
const makeretrieve = gb => (path) => (colArr) =>{//not acutally working, unsure if this should be an API
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
const makelinkRowTo = (gun, gb, getCell) => (path, byAlias) => function linkrowto(property, gbaseGetRow, cb){
    try{
        cb = (cb instanceof Function && cb) || function(){}
        //gbaseGetRow = gbase[base][tval][rowID]
        let [base,tval,r] = path.split('/')
        let cols = getValue([base,'props',tval,'props'], gb)
        let pval = findID(cols,property)
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
            let links = getCell(prevCol.path, pval)
            if(links === undefined){
                setTimeout(linkrowto,100,property,gbaseGetRow, cb)
                return false
            }else if(links.length !== 0){
                throw new Error('Cannot link another row, as the column settings only allow a single link')
            }
        }
        let pathLinkSoul = path +'/links/'+pval
        let lpathLinkSoul = targetLink + '/links/'+lpval
        gun.get(pathLinkSoul).get(targetLink).put(true)
        gun.get(lpathLinkSoul).get(path).put(true)
        cb.call(this, undefined)
    }catch(e){
        cb.call(this, e)
    }
}
const makeunlinkRow = (gun, gb) => (path, byAlias) => function unlinkrow(property, gbaseGetRow, cb){
    try{
        //gbaseGetRow = gbase[base][tval][rowID]
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval,r] = path.split('/')
        let cols = getValue([base,'props',tval,'props'], gb)
        let pval = findID(cols,property)
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
        cb.call(this, undefined)
    }catch(e){
        cb.call(this, e)
    }
}
const makeimportData = (gun, gb) => (path) => (tsv, ovrwrt, append,cb)=>{//UNTESTED
    //gbase[base].importNewTable(rawTSV, 'New Table Alias')
    cb = (cb instanceof Function && cb) || function(){}
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
    let headerPvals = handleImportColCreation(gun, gb, base, tval, headers, dataArr[1], append)
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
    handleTableImportPuts(gun, path, result, cb)
}
const makeimportNewTable = (gun,gb,triggerChainRebuild) => (path) => (tsv, tAlias,cb)=>{
    //gbase[base].importNewTable(rawTSV, 'New Table Alias')
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let cpath = configPathFromChainPath(path)
        checkUniqueAlias(gb,cpath, tAlias)
        let dataArr = tsvJSONgb(tsv)
        let tval = findNextID(gb,path)
        let nextSort = nextSortval(gb,path)
        let tconfig = newTableConfig({alias: tAlias, sortval: nextSort})
        gun.get(path + '/' + tval + '/config').put(tconfig)
        let result = {}
        let headers = dataArr[0]
        let headerPvals = handleImportColCreation(gun, gb, path, tval, headers, dataArr[1], true)
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
        handleTableImportPuts(gun, tpath, result,cb)
        triggerChainRebuild(tpath)
    }catch(e){
        console.log(e)
        return e
    }
}
const makeclearColumn = (gun,gb,cache, gunSubs, loadColDataToCache) => (path) => function clearcol(cb){
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval,pval] = path.split('/')
        let csoul = [base,tval,'r',pval].join('/')
        let data = getValue([base,tval,pval],cache)
        let type = getColumnType(gb,path)
        if(!gunSubs[path] && data === undefined){
            loadColDataToCache(base,tval,pval)
            setTimeout(clearcol,1000, cb)
            return
        }
        let out = {}
        for (const rowid in data) {
            const value = data[rowid];
            if (value !== null) {//null means there is no data for that rowid in gun currently
                out[rowid] = convertValueToType(gb,"", type, rowid)
            }
        }
        console.log(csoul, out)
        gun.get(csoul).put(out)
        cb.call(this,undefined)
    }catch(e){
        console.log(e)
        cb.call(this,e)
    }
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
    makenewStaticTable,
    makenewInteractionTable,
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
}