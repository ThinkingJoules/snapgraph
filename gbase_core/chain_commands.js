
const{newBaseConfig,
    newTableConfig,
    newInteractionTableConfig,
    newInteractionColumnConfig,
    newColumnConfig,
    handleImportColCreation,
    handleTableImportPuts,
    newListItemsConfig,
    newListItemColumnConfig,
    checkConfig
} = require('./configs')
const{newQueryObj,
    query
} = require('./query')

const{getValue,
    configPathFromChainPath,
    findID,
    findRowID,
    tsvJSONgb,
    watchObj,
    convertValueToType,
    checkUniqueAlias,
    findNextID,
    nextSortval,
    getColumnType,
    hasColumnType,
    handleStaticDataEdit,
    handleInteractionDataEdit,
    handleLIDataEdit,
    addAssociation,
    removeAssociation,
    getRetrieve,
    checkAliasName,
    getAllColumns
} = require('./util')

//GBASE CHAIN COMMANDS
const makenewBase = gun => (alias, tname, pname, baseID) =>{
    try{
        baseID = baseID || 'B' + Gun.text.random(8)
        checkAliasName('t0',tname)
        checkAliasName('p0',pname)
        gun.get('GBase').put({[baseID]: true})
        gun.get(baseID + '/config').put(newBaseConfig({alias}))
        gun.get(baseID + '/t0/config').put(newTableConfig({alias: tname}))
        gun.get(baseID + '/t0/p0/config').put(newColumnConfig({alias: pname}))   
        gun.get(baseID + '/t0/p').put({p0: true})
        gun.get(baseID + '/t').put({t0: 'static'})
        return baseID
    }catch(e){
        console.log(e)
        return e
    }
}
const makenewStaticTable = (gun, gb) => (path) => (tname, pname, tableType)=>{
    try{
        let cpath = configPathFromChainPath(path)
        let nextT = findNextID(gb,path)
        checkAliasName(nextT,tname)
        checkAliasName('p0',pname)
        if(tableType && tableType !== 'static' && tableType !== 'asset'){
            throw new Error('Type must be either "static" or "asset".')
        }
        let tconfig = newTableConfig({alias: tname, sortval: nextSortval(gb,path), type:tableType})
        checkConfig(newTableConfig(), tconfig)
        checkUniqueAlias(gb, cpath, tconfig.alias)
        let pconfig = newColumnConfig({alias: pname})
        gun.get(path + '/' + nextT + '/config').put(tconfig)
        gun.get(path + '/' + nextT + '/p0/config').put(pconfig)
        gun.get(path + '/t').put({[nextT]: "static"})
        gun.get(path + '/' + nextT + '/p').put({p0: true})
        return nextT
    }catch(e){
        console.log(e)
        return e
    }
}
const makenewColumn = (gun, gb) => (path, config) => (pname, type)=>{
    try{
        let cpath = configPathFromChainPath(path)
        let nextP = findNextID(gb,path)
        checkAliasName(nextP, pname)
        let pconfig
        if(config){
            config = Object.assign({alias: pname, GBtype: type, sortval: nextSortval(gb,path)}, config)
            pconfig = newColumnConfig(config)
        }else{
            pconfig = newColumnConfig({alias: pname, GBtype: type, sortval: nextSortval(gb,path)})
        }
        checkConfig(newColumnConfig(), pconfig)
        checkUniqueAlias(gb,cpath,pconfig.alias)
        gun.get(path + '/' + nextP + '/config').put(pconfig)
        gun.get(path + '/p').put({[nextP]: true})
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
        let call = edit(fullpath,true,alias)
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
const makeconfig = (gb, handleConfigChange, handleInteractionConfigChange) => (path) => (configObj, backLinkCol,cb) =>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval] = path.split('/')

        let {type} = (tval) ? getValue([base,'props',tval],gb) : {type: "static"}
        if(type === 'static'){//static tables, or base config
            handleConfigChange(configObj, path, backLinkCol,cb)
        }else{//interaction tables or LI/LIcols configs
            handleInteractionConfigChange(configObj,path,cb)
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return false
    }
}
const makeedit = (gun,gb,cascade,timeLog,timeIndex,getCell) => (path,newRow,newAlias,fromCascade,_alias) => (editObj, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        newRow = (newRow) ? true : false
        let [base,tval,r,li,lir] = path.split('/')
        let eSoul
        let {type} = getValue([base,'props',tval], gb)
        if(type === 'static'){
            eSoul = [base,tval,'p0'].join('/')
        }else{
            eSoul = [base,tval].join('/')
        }
        const runEdit = (verifiedPath) =>{
            let [base,tval,r,li,lir] = verifiedPath.split('/')
            let tpath = configPathFromChainPath([base,tval].join('/'))
            let ppath = tpath.slice()
            ppath.push('props')
            let cols = getValue(ppath, gb)
            let putObj = {}
            //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
            for (const palias in editObj) {
                let pval = findID(cols, palias) 
                if (pval) {
                    putObj[pval] = editObj[palias]; 
                }else{
                    let err = ' Cannot find column with name: '+ palias +'. Edit aborted'
                    throw new Error(err)
                }
            }
            if(type === 'static'){
                handleStaticDataEdit(gun,gb,cascade,timeLog,timeIndex,verifiedPath,newRow,newAlias,fromCascade,putObj,cb)
            }else if (type === 'interaction' || (type === 'transaction' && li !== 'li') ){
                handleInteractionDataEdit(gun,gb,cascade,timeLog,timeIndex,getCell,verifiedPath,newRow,newAlias,fromCascade,putObj, cb)
            }else if (type === 'transaction' && li === 'li'){
                handleLIDataEdit(gun,gb,cascade,timeLog,verifiedPath,newRow,fromCascade,putObj, cb)
            }else{
                throw new Error('Cannot determine type of table instance you are editing.')
            }
    
        }
        const checkExistence = (soul)=>{
            gun.get(eSoul).get(soul).get(function(msg,eve){
                let value = msg.put
                eve.off()
                if(value === undefined){
                    throw new Error('RowID does not exist, must create a new one through ".newRow()" api.')
                }else if(value === false){//check existence
                    throw new Error('RowID is archived or deleted. Must create a new one through ".newRow()" api. Or ... "unarchiveRow()"??')
                }else{
                    runEdit(soul)
                }    
            })
            
        }
        if(_alias){
            gun.get(eSoul).get(function(msg,eve){
                let node = msg.put
                eve.off()
                let foundSoul
                for (const soul in node) {
                    if(soul === '_')continue
                    const value = node[soul];
                    if(String(r) === String(value)) {
                        if(!newRow){//check existence
                            checkExistence(soul)
                        }else if(newRow){
                            runEdit(soul)
                        }
                        foundSoul = true
                        break
                    }
                }
                if(!foundSoul){
                    throw new Error('Cannot find RowID for given path')
                }
            })
        }else if(!newRow){
            checkExistence(path)
        }else if(newRow || fromCascade){
            runEdit(path)
        }
        
    }catch(e){
        console.log(e)
        cb.call(this, e)
    }
}
const makesubscribe = (gb,gsubs, requestInitialData) => (path) => (callBack, colArr, onlyVisible, notArchived, udSubID) =>{//should only allow on rows
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
            gsubs[base][objKey] = cached //should fire off with user CB
        }
        return
    }catch(e){
        console.log(e)
        return e
    }
}
const makeretrieve = (gun, gb) => (path) => (colArr,callBack) =>{//should only allow on rows
    let [base,tval,r] = path.split('/')
    //retrieve row with certain columns

    let cols = getValue([base, 'props', tval, 'props'], gb)
    let columns = {}
    if(colArr){// check for pvals already, or attemept to convert col array to pvals
        for (let j = 0; j < colArr.length; j++) {
            const col = colArr[j];
            let pval = findID(cols, col)
            if(pval !== undefined && !cols[pval].archived && !cols[pval].deleted){
                columns[pval] = undefined
            }else{
                console.log('ERROR: Cannot find column with name: '+ col)
            }
        }
    }else{//full object columns
        for (const colp in cols) {
            if(!cols[colp].archived || !cols[colp].deleted){
                columns[colp] = undefined
            }
        }
    }
    console.log(path)
    for (const p in columns) {
        getRetrieve(gun, gb, path, columns, p, callBack)
    }
    return 
}




const makeretrieveQuery = (gb,setupQuery) => (path) => (cb, colArr, queryArr) =>{
    try{//path = base/tval CAN ONLY QUERY TABLES
        let [base,tval] = path.split('/')
        let {props} = getValue([base,'props',tval],gb)
        let pvalArr = []
        if(!colArr){
            colArr = getAllColumns(gb,path)
            colArr.sort((a,b)=>a.slice(1)-b.slice(1))
        }
        for (const palias of colArr) { 
            pvalArr.push(findID(props, palias))
        }
        setupQuery(path,pvalArr,queryArr,cb,false,false)
    }catch(e){
        console.warn(e)
        return e
    }
}
const makesubscribeQuery = (gb,setupQuery) => (path) => (cb, colArr, queryArr,subID) =>{
    try{//path = base/tval CAN ONLY QUERY TABLES
        let [base,tval] = path.split('/')
        let {props} = getValue([base,'props',tval],gb)
        let pvalArr = []
        if(!colArr){
            colArr = getAllColumns(gb,path)
            colArr.sort((a,b)=>a.slice(1)-b.slice(1))
        }
        for (const palias of colArr) { 
            pvalArr.push(findID(props, palias))
        }
        queryArr = queryArr || []
        setupQuery(path,pvalArr,queryArr,cb,true,subID)
    }catch(e){
        console.warn(e)
        return e
    }
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
const makeassociateTables = (gun, gb) => path => (table, cb)=>{//not sure how this works in all scenarios
    //path = baseID/tval
    //All tables can have one associated column that points to 1 other associated table/column
    //this will create a new column on each table that point at each other.
    //Multiple associations should use tags as a grouping mechanism or another meta table
    try{
        const newColumn = makenewColumn(gun,gb)
        const newInteractionColumn = makenewInteractionColumn(gun,gb)
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval] = path.split('/')
        let {type: tType} = getValue([base,'props',tval,'type'],gb)
        let [abase,atval] = table.split('/')
        if(atval === tval){throw new Error ('Cannot associate a table to itself')}
        let fromAssoc = hasColumnType(gb,path,'association')
        let timeIndex = hasColumnType(gb,path,'date')
        for (let i = 0; i < fromAssoc.length; i++) {
            const p = fromAssoc[i];
            let {associatedWith} = getValue(base,'props',tval,'props',p)
            let [testbase,testtval] = associatedWith.split('/')
            if(testtval === atval){
                throw new Error('These tables are already associated')
            }
        }
        //associate to config (static table)
        let linkpath = table.split('/')
        let linkCpath = configPathFromChainPath(table)
        let {alias, type} = getValue(linkCpath,gb)
        let pval = findNextID(gb,path)
        let ipath = [base, tval, pval].join('/')
        let call
        if(type === "static"){
            call = newColumn(table, {associatedWith: ipath, associatedIndex: timeIndex[0] || ""})
        }else{
            call = newInteractionColumn(table, {associatedWith: ipath})
        }
        let linkpval = call('Associated ' + tname, 'association')
        linkpath.push(linkpval)
        let col
        if(tType === "static"){
            col = newColumnConfig({alias: 'Associated ' + alias, GBtype: 'association', sortval: nextSortval(gb,path), associatedWith: linkpath.join('/'), associatedIndex: timeIndex[0] || ""})
        }else{
            col = newInteractionColumnConfig({alias: 'Associated ' + alias, GBtype: 'association', sortval: nextSortval(gb,path), associatedWith: linkpath.join('/'), associatedIndex: timeIndex[0] || ""})
        }
        

        gun.get(path + '/' + tval + '/'+ pval +'/config').put(col)
        gun.get(base + '/' + tval + '/p').put({[pval]: true})


        cb.call(this,false,pval)

    }catch(e){
        cb.call(this,e)
        return
    }
}
const makeimportData = (gun, gb) => (path) => (tsv, ovrwrt, append,cb)=>{//UNTESTED, NEEDS WORK
    //gbase[base].importNewTable(rawTSV, 'New Table Alias')

    //should run all of these through .edit(), to ensure it matches schema/types


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
const makeimportNewTable = (gun,gb,timeLog,timeIndex,triggerChainRebuild) => (path) => (tsv, tAlias,cb)=>{
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
        let result = {}, ti = {}, tl = {}
        let headers = dataArr[0]
        let headerPvals = handleImportColCreation(gun, gb, path, tval, headers, dataArr[1], true)
        for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
            const rowArr = dataArr[i];
            let rowsoul
            rowsoul =  path + '/' + tval + '/r' + Gun.text.random(6)
            ti[rowsoul] = true
            tl[rowsoul] = {}
            if(rowArr[0]){//skip if HID is blank
                for (let j = 0; j < rowArr.length; j++) {
                    const value = rowArr[j];
                    if(value !== ""){//ignore empty strings only
                        const header = headers[j]
                        const headerPval = headerPvals[header]
                        tl[rowsoul][headerPval] = value
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
        gun.get(path + '/t').put({[tval]: 'static'})
        let tpath = path + '/' + tval
        timeIndex([path,tval,'created'].join('/'),ti,new Date())
        handleTableImportPuts(gun, tpath, result, cb)
        for (const soul in tl) {
            const logObj = tl[soul];
            timeLog(soul,logObj)
        }
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
        let csoul = path
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
const makeassociateWith = (gun, gb, getCell) => (path) => (gbaseGetRow, cb) =>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        //gbaseGetRow = gbase[base][tval][rowID]
        let toPath
        if(typeof gbaseGetRow === 'object'){
            toPath = gbaseGetRow._path
        }else if(gbaseGetRow.split('/').length === 3){
            toPath = gbaseGetRow
        }else{
            throw new Error('Cannot detect what row you are trying to link to. For the second argument pass in the gbase chain for the link row: gbase[baseID][table][row]')
        }
        addAssociation(gun,gb,getCell,path,toPath,cb)
    }catch(e){
        cb.call(this, e)
    }
}
const makeunassociate = (gun,gb) => (path) => (gbaseGetRow,cb) =>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        //gbaseGetRow = gbase[base][tval][rowID]
        let toPath
        if(typeof gbaseGetRow === 'object'){
            toPath = gbaseGetRow._path
        }else if(gbaseGetRow.split('/').length === 3){
            toPath = gbaseGetRow
        }else{
            throw new Error('Cannot detect what row you are trying to link to. For the second argument pass in the gbase chain for the link row: gbase[baseID][table][row]')
        }
        removeAssociation(gun,gb,path,toPath,cb)
    }catch(e){
        cb.call(this, e)
    }
}
const makearchive = (gun,gb) => path => () =>{

}
const makedelete = (gun,gb) => path => () =>{

}



//INTERACTION APIs
const validInteraction = ['transaction', 'interaction']
const makenewInteractionTable = (gun, gb) => (path) => (tname, tableType, assocArr, contextRef, ref)=>{
    //path = baseID
    //assocArr = ['baseID/tval', 'baseID/tval2] //associations can be other interaction tables
    
    try{
        const newColumn = makenewColumn(gun,gb)
        const newInteractionColumn = makenewInteractionColumn(gun,gb)
        if(!validInteraction.includes(tableType)){
            throw new Error('Either no table type specified, or specified value is not one of: '+ validInteraction.join(', '))
        }
        let cpath = configPathFromChainPath(path)
        assocArr = assocArr || []
        let tconfig
        let liconfig
        let cols = {}
        let liCols = {}
        let nextT = findNextID(gb,path)
        let nextPval = 0
        checkAliasName(nextT,tname)
        if(tableType === 'transaction'){//this is a transactional interaction
            if(!contextRef){throw new Error('Must specify a static table to use as context for all of these transactions.')}
            let contextCpath = configPathFromChainPath(contextRef)
            let {alias} = getValue(contextCpath,gb)
            tconfig = newInteractionTableConfig({alias: tname, type: 'transaction', context: contextRef ,sortval: nextSortval(gb,path)})
            cols.p0 = newInteractionColumnConfig({alias: 'Transaction ID', required: true, sortval: 0})
            cols.p1 = newInteractionColumnConfig({alias: 'Date Index 1', GBtype: 'date', required: true, sortval: 10})
            let lip1Ref = '{' + [base,nextT,'li','p1'].join('/') + '}'
            let lip2Ref = '{' + [base,nextT,'li','p2'].join('/') + '}'
            let lip3Ref = '{' + [base,nextT,'li','p3'].join('/') + '}'
            let liRef = '{' + [base,nextT,'li'].join('/') + '.' + [base,nextT,'li','p3'].join('/') + '}'
            cols.p2 = newInteractionColumnConfig({alias: 'Completed', GBtype: 'function', fn: 'IF(AND('+liRef+'),TRUE(),FALSE())', sortval: 20 })
            liCols.p0 = newListItemColumnConfig({alias, sortval: 0, GBtype: 'context'})
            liCols.p1 = newListItemColumnConfig({alias: 'Quantity', sortval: 10, GBtype: 'number', defaultval: 1, usedIn:[lip3Ref] })
            liCols.p2 = newListItemColumnConfig({alias: 'Completed ' + alias, sortval: 20, GBtype: 'result', usedIn:[lip3Ref]})
            liCols.p3 = newListItemColumnConfig({alias: 'Completed', sortval: 30, GBtype: 'function', fn: 'IF('+lip1Ref+'='+lip2Ref+',TRUE(),FALSE())', usedIn:[[path, nextT, 'p2'].join('/')] })
            liconfig = newListItemsConfig({total: 'p2', completed: 'p3'})
            nextPval = 3
            if(ref){//this new transaction table is trying to be linked to another transaction/interaction
                let [rbase,rtval] = ref.split('/')//clean to make sure no pval specified
                let refTpath = [rbase,rtval].join('/')
                let refCpath = configPathFromChainPath(refTpath)
                let {type, context} = getValue(refCpath,gb)
                if(type === 'transaction'){//linking transaction to transaction
                    if(context !== contextRef && context !== 'COA'){throw new Error(context + '!=' + contextRef +' : Cannot reference a transaction with a different context')}
                    //bring in associations from ref
                    assocArr = assocArr.concat(hasColumnType(gb,refTpath,'association'))
                    tconfig.reference = refTpath
                }else{
                    throw new Error('A transaction can only reference another transaction? Can they reference an interaction? Cannot see why.')
                }
            }
            let cleanPaths = assocArr.map(function(path){
                let [base,tval] = path.split('/')
                let clean = [base,tval].join('/')
                return clean
            })
            let uniq = [ ...new Set(cleanPaths) ] //remove duplicate references
            if(!uniq.length){
                throw new Error('Must specify at least 1 association with a new transaction')
            }
            for (let i = 0; i < uniq.length; i++) {//create bi-directional associations
                const tpath = uniq[i];
                let linkpath = tpath.split('/')
                let linkCpath = configPathFromChainPath(tpath)
                let {alias, type} = getValue(linkCpath,gb)
                let pval = 'p' + nextPval
                let ipath = [path, nextT, pval].join('/')
                let call
                if(type === "static"){
                    call = newColumn(tpath, {associatedWith: ipath, associatedIndex: [path,nextT,'p1'].join('/')})
                }else{
                    call = newInteractionColumn(tpath, {associatedWith: ipath, associatedIndex: [path,nextT,'p1'].join('/')})
                }
                let linkpval = call('Associated ' + tname, 'association')
                linkpath.push(linkpval)
                cols[pval] = newInteractionColumnConfig({alias: 'Associated ' + alias, GBtype: 'association', sortval: pval * 10, associatedWith: linkpath.join('/')})
                nextPval ++
            }
            checkConfig(newTableConfig(), tconfig)
            checkUniqueAlias(gb, cpath, tconfig.alias)
            gun.get(path + '/' + nextT + '/config').put(tconfig)
            let ps = {}
            for (const pval in cols) {
                const colConfig = cols[pval];
                ps[pval] = true
                gun.get(path + '/' + nextT + '/'+ pval +'/config').put(colConfig)
            }
            gun.get(path + '/' + nextT + '/li/config').put(liconfig)
            let lips = {}
            for (const pval in liCols) {
                const colConfig = liCols[pval];
                lips[pval] = true
                gun.get(path + '/' + nextT + '/li/'+ pval +'/config').put(colConfig)
            }
            gun.get(path + '/' + nextT + '/p').put(ps)
            gun.get(path + '/' + nextT + '/li').put(lips)
            gun.get(path + '/t').put({[nextT]: tableType})
            return nextT
        }else if(tableType === 'interaction'){//simple interaction with a static table
            tconfig = newTableConfig({alias: tname, type: 'interaction', sortval: nextSortval(gb,path)})
            cols.p0 = newInteractionColumnConfig({alias: 'Interaction ID', required: true})
            cols.p1 = newInteractionColumnConfig({alias: 'Date Index 1', dateIndex: true, GBtype: 'date', required: true})
            let cleanPaths = assocArr.map(function(path){
                let [base,tval] = path.split('/')
                let clean = [base,tval].join('/')
                return clean
            })
            let uniq = [ ...new Set(cleanPaths) ]
            if(!uniq.length){
                throw new Error('Must specify at least 1 association with a new transaction')
            }
            for (let i = 0; i < uniq.length; i++) {//create bi-directional associations
                const tpath = uniq[i];
                let linkpath = tpath.split('/')
                let linkCpath = configPathFromChainPath(tpath)
                let {alias, type} = getValue(linkCpath,gb)
                let pval = 'p' + nextPval
                let ipath = [path, nextT, pval].join('/')
                let call
                if(type === "static"){
                    call = newColumn(tpath, {associatedWith: ipath})
                }else{
                    call = newInteractionColumn(tpath, {associatedWith: ipath, associatedIndex: [path,nextT,'p1'].join('/')})
                }
                let linkpval = call('Associated ' + tname, 'association')
                linkpath.push(linkpval)
                cols[pval] = newInteractionColumnConfig({alias: 'Associated ' + alias, GBtype: 'association', sortval: pval * 10, associatedWith: linkpath.join('/'), associatedIndex: [path,nextT,'p1'].join('/')})
                nextPval ++
            }
            checkConfig(newTableConfig(), tconfig)
            checkUniqueAlias(gb, cpath, tconfig.alias)
            gun.get(path + '/' + nextT + '/config').put(tconfig)
            let ps = {}
            for (const pval in cols) {
                const colConfig = cols[pval];
                ps[pval] = true
                gun.get(path + '/' + nextT + '/'+ pval +'/config').put(colConfig)
            }
            gun.get(path + '/' + nextT + '/p').put(ps)
            gun.get(path + '/t').put({[nextT]: tableType})
            return nextT
        }
    }catch(e){
        console.log(e)
        return e
    }
}
const makenewInteractionColumn = (gun, gb) => (path,config) => (pname, type)=>{
    try{
        
        let cpath = configPathFromChainPath(path)
        let nextP = findNextID(gb,path)
        checkAliasName(nextP,pname)
        let pconfig
        if(config){
            config = Object.assign({alias: pname, GBtype: type, sortval: nextSortval(gb,path)}, config)
            pconfig = newInteractionColumnConfig(config)
        }else{
            pconfig = newInteractionColumnConfig({alias: pname, GBtype: type, sortval: nextSortval(gb,path)})
        }
        checkConfig(newInteractionColumnConfig(), pconfig)
        checkUniqueAlias(gb,cpath,pconfig.alias)
        gun.get(path + '/' + nextP + '/config').put(pconfig)
        gun.get(path + '/p').put({[nextP]: true})
        return nextP
    }catch(e){
        console.log(e)
        return false
    }
}
const makenewLIcolumn = (gun, gb) => (path, config) => (colName, type)=>{
    //path = baseID/tval
    try{
        let cpath = configPathFromChainPath(path)
        let nextP = findNextID(gb,path)
        checkAliasName(nextP,colName)
        let pconfig
        if(config){
            config = Object.assign({alias: colName, GBtype: type, sortval: nextSortval(gb,path)}, config)
            pconfig = newListItemColumnConfig(config)
        }else{
            pconfig = newListItemColumnConfig({alias: colName, GBtype: type, sortval: nextSortval(gb,path)})
        }
        checkConfig(newListItemColumnConfig(), pconfig)
        checkUniqueAlias(gb,cpath,pconfig.alias)
        gun.get(path + '/' + nextP + '/config').put(pconfig)
        gun.get(path + '/p').put({[nextP]: true})
        return nextP
    }catch(e){
        console.log(e)
        return e
    }
}
const makeaddContextLinkColumn = (gun, gb) => path => (pname, pval) =>{
    let newLICol = makenewLIcolumn(gun,gb)
    let cLink = pval
    if(cLink[0] !== 'p' || isNaN(cLink.slice(1) * 1)){
        throw new Error('must provide: "p" + Number(). Must be a "prev" column with a "next" as {linkMultiple: false} relation')
    }
    let [base,tval,li,lipval] = path.split('/')
    let {context} = getValue([base,'props',tval], gb)
    let [cbase,ctval] = context.split('/')
    let {GBtype, linksTo} = getValue([cbase,'props',ctval,'props',cLink],gb)
    if(GBtype !== 'prev'){
        throw new Error('contextLink can only be to a "prev" link')
    }
    let [lbase,lt,lp] = linksTo.split('/')
    let {linkMultiple} = getValue([lbase,'props',lt,'props',lp],gb)
    if(linkMultiple){
        throw new Error('Can only use a contextLink that connects to a table with "next" as {linkMultiple: false}')
    }
    let call = newLICol(path,{fn: pval})
    let newP = call(pname,contextLink)
    return newP
}
const makenewInteraction = (gb, edit) => path => (rowObj, liArr, cb) =>{//like newRow, but for int/tr tables
    //object with pvals for the 'interaction header'
    //arr of obj to pass into `addListItems`
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let tpath = path
        let[base,tval] = path.split('/')
        let{type} = getValue([base,'props',tval],gb)
        let id = 'r' + Gun.text.random(6)
        let fullpath = tpath + '/' + id
        let call = edit(fullpath,true,alias)
        call(rowObj, cb)
        if(type === 'transaction' && Array.isArray(liArr) && liArr.length){
            const addListItems = makeaddListItems(edit)
            const callLI = addListItems(fullpath)
            callLI(liArr,cb)
        }
    }catch(e){
        cb.call(this, e)
        console.log(e)
    }
}

const makeaddListItems = (edit) => path => (arr,cb) =>{//add subtable data for tr
    //array of objects, so you can add many LI at once
    for (let i = 0; i < arr.length; i++) {
        const lirowObj = arr[i];
        let lirow = path + '/li/r'+ Gun.text.random(3)
        let licall = edit(lirow,true)
        licall(lirowObj,cb)
    }
}
const makeremoveListItems = (gun,timeLog) => path => (arr) =>{//remove one or more subtable data for tr
    //array of LI row paths > "base/tval/rval/li/lirval"
    let [base,tval,r] = path.split('/')
    let liSoul = [base,tval,r,'li'].join('/')
    for (let i = 0; i < arr.length; i++) {
        const lirSoul = arr[i];
        gun.get(liSoul).get(lirSoul).put(false)
        timeLog(path,{[lirSoul]: false})
    }
}


//DEBUG APIs
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
    makenewInteraction,
    makeaddListItems,
    makeremoveListItems,
    makeunassociate,
    makesubscribeQuery,
    makeretrieveQuery
}