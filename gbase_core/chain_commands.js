
const{newBaseConfig,
    newNodeTypeConfig,
    newInteractionTableConfig,
    newInteractionColumnConfig,
    newColumnConfig,
    handleImportColCreation,
    handleTableImportPuts,
    newListItemsConfig,
    newListItemColumnConfig,
    checkConfig
} = require('./configs')

const{getValue,
    configPathFromChainPath,
    findID,
    findRowID,
    tsvJSONgb,
    watchObj,
    convertValueToType,
    checkUniques,
    findNextID,
    nextSortval,
    getColumnType,
    hasColumnType,
    handleDataEdit,
    addAssociation,
    removeAssociation,
    getRetrieve,
    checkAliasName,
    getAllColumns,
    buildPermObj,
    makeSoul,
    parseSoul,
    rand,
    putData,
    newID,
    setValue
} = require('./util')
/*
ID Length (using A-Za-z0-9)
Base: 10
nodeType: 6
relation: 6
nodeID: 10
column: 6
group: 5

Appx name space with 99.999% no collision:
Base: 10mil
nodeType: 1000
relation: 1000
nodeID: 10mil
column: 1000
group: 100

*/


//GBASE CHAIN COMMANDS
const makenewBase = gun => (alias, basePermissions, baseID) =>{
    try{
        let user = gun.user()
        let pub = user && user.is && user.is.pub || false
        let invalidID = /[^a-zA-Z0-9]/
        baseID = baseID || rand(10)
        if(!pub){
            throw new Error('Must be signed in to perform this action')
        }
        if(invalidID.test(baseID)){
            throw new Error('baseID must only contain letters and numbers')
        }
        gun.get(makeSoul({'!':baseID,'|':'super'})).put({[pub]:true})
        
        const putRest = () =>{
            let perms = buildPermObj('base',pub,basePermissions)
            let adminID = rand(5)
            let anyID = rand(5)
            gun.get(makeSoul({'!':baseID,'|':true})).put(perms)
            gun.get(makeSoul({'!':baseID,'^':true})).put({[adminID]: 'admin', [anyID]: 'ANY'})
            gun.get(makeSoul({'!':baseID,'^':anyID,'|':true})).put(buildPermObj('group',false,{add: 'ANY'}))
            gun.get(makeSoul({'!':baseID,'^':adminID,'|':true})).put(buildPermObj('group'))
            gun.get('GBase').put({[baseID]: true})
            gun.get(makeSoul({'!':baseID,'%':true})).put(newBaseConfig({alias}))
        }
        setTimeout(putRest,1000)
        return baseID
    }catch(e){
        console.log(e)
        return e
    }
}
const makenewNodeType = (gun, gb) => (path) => (configObj)=>{
    try{
        let cpath = configPathFromChainPath(path)
        let tconfig = newNodeTypeConfig(configObj)
        checkConfig(newNodeTypeConfig(), tconfig)
        checkUniques(gb, cpath, tconfig.alias)
        let tID = rand(6)
        let tList = '#' + tID //need to prepend # to show this ID is a nodeType not a relationType('-')
        gun.get(makeSoul({'!':path,'#':tID,'%':true})).put(tconfig)
        gun.get(makeSoul({'!':path})).put({[tList]: true})
        return nextT
    }catch(e){
        console.log(e)
        return e
    }
}
const makeaddProp = (gun, gb) => (path, config) => (pname, propType)=>{
    try{
        let {b,t,rt} = parseSoul(path)
        let cpath = configPathFromChainPath(path)
        let pID = rand(6)
        let pconfig
        if(config){
            config = Object.assign({alias: pname, GBtype: propType, sortval: nextSortval(gb,path)}, config)
            pconfig = newColumnConfig(config)
        }else{
            pconfig = newColumnConfig({alias: pname,propType, sortval: nextSortval(gb,path)})
        }
        checkConfig(newColumnConfig(), pconfig)
        checkUniques(gb,cpath,pconfig.alias)
        gun.get(makeSoul({b,t,rt,'.':pID,'%':true})).put(pconfig)
        gun.get(makeSoul({b,t,rt})).put({[pID]: true})
        return pID
    }catch(e){
        console.log(e)
        return false
    }
}
const makenewNode = (gun,gb,cascade,timeLog,timeIndex) => (path) => (data, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,rt} = parseSoul(path)
        let id = rand(10)
        let fullpath = makeSoul({b,t,rt,r:id})
        putData(gun,gb,cascade,timeLog,timeIndex,fullpath,true,false,data,cb)
    }catch(e){
        cb.call(this, e)
        console.log(e)
    }
}
const makepropIsChildNode = (gb, handleConfigChange) => path => (linkTableOrBackLinkCol, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,p} = parseSoul(path)
        let {externalID, parent} = getValue(configPathFromChainPath(makeSoul({b,t})), gb)
        if(p === externalID){throw new Error("Cannot use the external ID prop to link another table")}
        let {dataType,propType} = getValue(configPathFromChainPath(path), gb)
        let configObj = {}
        if(propType === 'child' || propType === 'parent'){
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
        if(lt === t){throw new Error('Cannot link a table to itself')}
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
const makeconfig = (handleConfigChange) => (path) => (configObj, backLinkCol,cb) =>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        
        handleConfigChange(configObj, path, backLinkCol,cb)
        
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return false
    }
}
const makeedit = (gun,gb,cascade,timeLog,timeIndex) => (path,fromCascade) => (editObj, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,rt,r} = parseSoul(path)
        let eSoul = makeSoul({b,t,rt,':':true})//look for a created time for this id, might be archived.
        gun.get(eSoul).get(path).get(function(msg,eve){
            let value = msg.put
            eve.off()
            if(value === undefined){
                throw new Error('RowID does not exist, must create a new one through ".newRow()" api.')
            }else if(value === false){//check existence
                throw new Error('RowID is archived or deleted. Must create a new one through ".newRow()" api. Or ... "unarchiveRow()"??')
            }else{
                putData(gun,gb,cascade,timeLog,timeIndex,path,false,fromCascade,editObj,cb)
            }    
        })
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
    try{//path = !# CAN ONLY QUERY TABLES
        let {props} = getValue(configPathFromChainPath(path),gb)
        let pvalArr = []
        colArr = colArr || getAllColumns(gb,path)
        queryArr = queryArr || []
        for (const palias of colArr) { 
            pvalArr.push(findID(props, palias))
        }
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
const makeimportNewTable = (gun,gb,timeLog,timeIndex,triggerConfigUpdate) => (path) => (tsv, alias,opts, cb)=>{
    //gbase.base(baseID).importNewTable(rawTSV, 'New Table Alias')
    try{
        let {b} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {variants,externalID,delimiter} = opts
        variants = !!variants
        externalID = externalID || ''
        delimiter = delimiter || ', '
        if(variants && !externalID)throw new Error('If you want to enable variants, you must specify the property name that would have unique values to use as external IDs')
        let cpath = configPathFromChainPath(path)
        let tAlias = alias || 'New NodeType' + rand(2)
        checkUniques(gb,cpath, tAlias)
        let dataArr = (Array.isArray(tsv)) ? tsv : tsvJSONgb(tsv) //can give it a pre-parse array.
        let t = newID(gb,makeSoul({b,t:true}))
        let tconfig = newNodeTypeConfig({alias,variants,externalID})
        let result = {}, IDs = {}, rid = 0, fid = 0
        let headers = dataArr[0]
        let {newPconfigs, aliasLookup} = handleImportColCreation(gb, b, t, headers, dataArr[1],variants, externalID, true)
        if(variants){
            let temp = {}
            let externalIDidx = headers.indexOf(externalID)
            let protoData = headers.indexOf('PROTOTYPE')
            if(externalIDidx === -1)throw new Error('Cannot find the external IDs specified')
            if(protoData === -1)throw new Error('Cannot find the PROTOTYPE meta data property in the dataset')
            let invalidData = {}

            for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
                const rowArr = dataArr[i];
                let eid = rowArr[externalIDidx]
                for (let j = 0; j < rowArr.length; j++) {
                    let value = rowArr[j];
                    if(!['',null,undefined].includes(value)){//ignore empty values
                        if(!temp[eid])temp[eid] = {}
                        if((protoData === j)){
                            temp[eid]['PROTOTYPE'] = value
                            assignIDs(eid,value)

                        }else{
                            const headerPval = aliasLookup[headers[j]]
                            let {dataType} = newPconfigs[headerPval]
                            try {
                                value = convertValueToType(value,dataType,eid,delimiter)
                            } catch (error) {
                                //need to fail back to a 'string' type on this pval and re-convert all data on final time through
                                //convert will not throw errors on 'string' everything else will.
                                invalidData[headerPval] = dataType
                            }
                            temp[eid][headerPval] = value
                        }
                        
                    }
                }
            }
            let typeChange = Object.keys(invalidData)
            for (const pval of typeChange) {
                newPconfigs[pval].dataType = 'string'
                newPconfigs[pval].propType = 'data' //probably already is, but could be 'date' and 'number'
            }
            for (const eid in temp) {
                const node = temp[eid];
                const {PROTOTYPE} = node
                let rowsoul
                if(String(PROTOTYPE) === String(eid)){
                    let r = IDs[eid]
                    rowsoul= makeSoul({b,t,r,f:true})
                }else{
                    let r = IDs[PROTOTYPE]
                    let f = IDs[eid]
                    rowsoul= makeSoul({b,t,r,f})
                }
                for (const p in node) {
                    if(p === 'PROTOTYPE')continue
                    let {dataType} = newPconfigs[p]
                    const v = convertValueToType(node[p],dataType,eid,delimiter)//shouldn't error
                    if(String(PROTOTYPE) === String(eid)){//add all values
                        setValue([rowsoul,p],v,result)
                    }else{//figure out if they are different
                        let prVal = getValue([PROTOTYPE,p], temp)
                        if(prVal === undefined || JSON.stringify(prVal) !== JSON.stringify(v)){
                            setValue([rowsoul,p],v,result)
                        }
                    }
                }
            }
        }else{
            assmembleData()
        }
        putData()
        //console.log(newPconfigs,result)
        triggerConfigUpdate()//fire callback for app code to get new config data.
        function assignIDs(alias,proto){
            if(alias === proto){
                IDs[alias] = rid
                rid++
            }else{
                IDs[alias] = fid
                fid++
            }
        }
        function assmembleData(){
            for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
                const rowArr = dataArr[i];
                let r = rid
                let rowsoul = makeSoul({b,t,r,f:''})
                rid++
                for (let j = 0; j < rowArr.length; j++) {
                    const value = rowArr[j];
                    if(!['',null,undefined].includes(value)){//ignore empty values
                        const headerPval = aliasLookup[headers[j]]
                        setValue([rowsoul,headerPval],value,result)
                    }
                }
            }
        }
        function putData(){
            for (const p in newPconfigs) {
                const cObj = newPconfigs[p];
                let {alias} = cObj
                if(externalID && externalID === alias)tconfig.externalID = p
                let configSoul = makeSoul({b,t,p,'%':true})
                let listSoul = makeSoul({b,t})
                gun.get(configSoul).put(cObj)
                gun.get(listSoul).put({[p]:true})
            }
    
    
            gun.get(makeSoul({b,t,'%':true})).put(tconfig)
            let tval = '#' + t
            let tpath = makeSoul({b,t})
            gun.get(makeSoul({b})).put({[tval]: true})//table on base index
            handleTableImportPuts(gun, result, cb)//put data on each node
            let now = new Date()
            for (const newSoul in result) {
                let put = result[newSoul]
                timeIndex(tpath,newSoul,now)//index new souls on the 'created' index
                timeLog(newSoul,put)//log the first edits for each node (basically double data at this point...)
            }
    
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
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
                out[rowid] = convertValueToType("", type, rowid)
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
            checkConfig(newNodeTypeConfig(), tconfig)
            checkUniques(gb, cpath, tconfig.alias)
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
            tconfig = newNodeTypeConfig({alias: tname, type: 'interaction', sortval: nextSortval(gb,path)})
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
            checkConfig(newNodeTypeConfig(), tconfig)
            checkUniques(gb, cpath, tconfig.alias)
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
        checkUniques(gb,cpath,pconfig.alias)
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
        checkUniques(gb,cpath,pconfig.alias)
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
        let call = edit(fullpath,true)
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


//PERMISSION APIs
const makesetAdmin = gun => path => (pubkey, value)=>{
    let [base] = path.split('/')
    let soul = base + '|group/admin'
    gun.get(soul).get(pubkey).put(value)
}
const makenewGroup = gun => path => (groupName,perms)=>{
    let permObj = buildPermObj('group',false,perms)
    let [base] = path.split('/')
    let soul1 = base + '|groups'
    let soul2 = base + '|group/' + groupName + '|permissions'
    gun.get(soul1).get(groupName).put(true)
    gun.get(soul2).put(permObj)
}
const makeaddUser = gun => path => (userPub,groupNames)=>{//signup for app, not signup for gun.user()
    let [base] = path.split('/')
    let soul1 = base + '|groups'
    if(groupNames && !Array.isArray(groupNames)){
        groupNames = [groupNames]
    }else{
        groupNames = []
    }
    groupNames.push('ANY')
    gun.get(soul1).get(function(msg,eve){
        eve.off()
        if(msg.put){
            let invalid = []
            for (const group of groupNames) {
                if(!msg.put[group]){
                    invalid.push(group)
                }
            }
            if(!invalid.length){//add user to groups
                for (const group of groupNames) {
                    let gSoul = base + '|group/' +group
                    gun.get(gSoul).get(userPub).put(true, function(ack){
                        if(ack.err){
                            console.log('You do not have permission to add user to group: '+ group)
                        }
                    })
                }
            }else{//abort?
                throw new Error('Invalid Group(s) specified: '+invalid.join(', '))
            }
        }else{
            throw new Error('Could not find "groups" for this database')
        }
    })
}
const makeuserAndGroup = gun => (path,group,val) => (userPubs)=>{//signup for app, not signup for gun.user()
    let [base] = path.split('/')
    let soul1 = base + '|groups'
    let gSoul = base + '|group/' +group
    if(userPubs && !Array.isArray(userPubs)){
        userPubs = [userPubs]
    }else{
        console.log('Must specify at least one user to add!')
        return
    }
    gun.get(soul1).get(group).get(function(msg,eve){
        eve.off()
        if(msg.put){
            let putObj = {}
            for (const pub of userPubs) {
                putObj[pub] = val
            }
            gun.get(gSoul).put(putObj, function(ack){
                if(ack.err){
                    console.log('ERROR: ' + ack.err)
                }
            })
        }else{
            throw new Error('Invalid Group specified: '+ group)
        }
    })
}
const makechp = gun => (path, group) => chpObj =>{
    let pathArr = path.split('/')
    if(group){
        let soul = pathArr[0]+'|group/'+group+'|permissions'
        let putObj = buildPermObj('group',false,chpObj,true)//should only remove invalid keys
        gun.get(soul).put(putObj,function(ack){
            if(ack.err){
                console.log('ERROR: ' + ack.err)
            }
        })
    }else{//base, table or row
        let is = ['base','table','row']
        let type = is[pathArr.length]
        let soul = path + '|permissions'
        let putObj = buildPermObj(type,false,chpObj,true)//should only remove invalid keys
        gun.get(soul).put(putObj,function(ack){
            if(ack.err){
                console.log('ERROR: ' + ack.err)
            }
        })
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
    makenewNodeType,
    makeaddProp,
    makenewNode,
    makelinkColumnTo: makepropIsChildNode,
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
    makeretrieveQuery,
    makesetAdmin,
    makenewGroup,
    makeaddUser,
    makeuserAndGroup,
    makechp
}