
const{newBaseConfig,
    newNodeTypeConfig,
    newInteractionTableConfig,
    newInteractionColumnConfig,
    newNodePropConfig,
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
    setValue,
    NODE_SOUL_PATTERN,
    hash64,
    PROTO_NODE_SOUL
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
            pconfig = newNodePropConfig(config)
        }else{
            pconfig = newNodePropConfig({alias: pname,propType, sortval: nextSortval(gb,path)})
        }
        checkConfig(newNodePropConfig(), pconfig)
        checkUniques(gb,cpath,pconfig.alias)
        gun.get(makeSoul({b,t,rt,'.':pID,'%':true})).put(pconfig)
        gun.get(makeSoul({b,t,rt})).put({[pID]: true})
        return pID
    }catch(e){
        console.log(e)
        return false
    }
}
const makenewNode = (gun,gb,cascade,timeLog,timeIndex) => (path,ctx) => (data, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,rt,p} = parseSoul(path)
        //API can be called from:
        /*
        gbase.base(b).nodeType(t).newNode() << where t is a root table, as-is api
        gbase.node(nodeID).prop(childPropType).newNode() <<gbase can handle everything, this is the preferred method.
        */
        let id = rand(10)
        let fullpath = makeSoul({b,t,rt,r:id})
        putData(gun,gb,cascade,timeLog,timeIndex,fullpath,true,false,data,cb)
    }catch(e){
        cb.call(this, e)
        console.log(e)
    }
}
const makenewFrom = (gun,gb,cascade,timeLog,timeIndex) => (path,ctx) => (data, cb)=>{//TODO
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,rt,p} = parseSoul(path)
        //API can be called from:
        /*
        gbase.base(b).nodeType(t).node(ID).newFrom() << where t is a root table, as-is api
        gbase.base(b).nodeType(t).node(ID).newFrom() << there t is child. If child we need to check if user has provided a valid 'Parent' ID
        gbase.node(ID).newFrom() <<gbase can handle everything, this is the preferred method.
        */
        let id = rand(10)
        let fullpath = makeSoul({b,t,rt,r:id})
        //putData(gun,gb,cascade,timeLog,timeIndex,fullpath,true,false,data,cb)
    }catch(e){
        cb.call(this, e)
        console.log(e)
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
        let {b,t,rt} = parseSoul(path)
        let eSoul = makeSoul({b,t,rt,':':true})//look for a created time for this id, might be archived.
        gun.get(eSoul).get(path).get(function(msg,eve){
            let value = msg.put
            eve.off()
            let e
            if(value === undefined){
                e = new Error('Node does not exist, must create a new one through ".newRow()" api.')
            }else if(value === false){//check existence
                e = new Error('Node is archived or deleted. Must create a new one through ".newRow()" api. Or ... "unarchiveRow()"??')
            }else if(value === null){//check existence
                e = new Error('Node is deleted. Must create a new one through ".newNode()"')
            }else if(!e){
                putData(gun,gb,cascade,timeLog,timeIndex,path,false,fromCascade,editObj,cb)
            }
            console.log(e)
            cb.call(cb,e) 
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






const makelinkRowTo = (gun, gb, getCell) => (path) => function linkrowto(property, gbaseGetRow, cb){
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
const makeunlinkRow = (gun, gb) => (path) => function unlinkrow(property, gbaseGetRow, cb){
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


const makeimportData = (gun, gb) => (path) => (tsv, ovrwrt, append,cb)=>{//not updated, NEEDS WORK
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
// vvvvv these are to build parent child relations (lookup will function much the same as parent child but can have many to many relationships)
//TODO: ALL OF THESE NEED TO STORE THE UNIQUE DATA ON THE PROPER SOUL
const makeimportNewNodeType = (gun,gb,timeLog,timeIndex,triggerConfigUpdate) => (path) => (tsv, alias,opts, cb)=>{//updated
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
        alias = alias || 'New NodeType' + rand(2)
        let dataArr = (Array.isArray(tsv)) ? tsv : tsvJSONgb(tsv) //can give it a pre-parse array.
        let t = newID(gb,makeSoul({b,t:true}))
        let tconfig = newNodeTypeConfig({alias,variants,externalID})
        checkUniques(gb,cpath, tconfig)
        let result = {}, fIDPut = {}, IDs = {}, rid = 0, fid = 0
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
                    let protoList = makeSoul({b,t,r})
                    addToPut(protoList,{[f]:{'#':rowsoul}})
                    
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
            for (const fList in fIDPut) {
                const pObj = fIDPut[fList];
                gun.get(fList).put(pObj)  
            }
            
        }
        function addToPut(soul,putObj){
            if(!fIDPut[soul]){
                fIDPut[soul] = putObj
            }else{
                Object.assign(fIDPut[soul],putObj)
            }
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return e
    }
    
}
const makeimportChildData = (gun,gb,getCell,timeLog,timeIndex,triggerConfigUpdate) => (path) => (tsv, alias,opts, cb)=>{//updated
    //gbase.base(baseID).nodeType(type).prop(prop).importChildData(rawTSV, 'New Table Alias')
    try{
        let {b,t: fromt,p} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {externalID,delimiter,parentProp} = opts
        let {propType, dataType, alias:propName} = getValue(configPathFromChainPath(makeSoul({b,t: fromt,p})),gb)
        let {variants} = getValue(configPathFromChainPath(makeSoul({b,t: fromt})),gb)
        parentProp = parentProp || false
        externalID = externalID || ''
        delimiter = delimiter || ', '
        if(!externalID)throw new Error('You must specify the property name that has unique values to use as external IDs in order to link this data: {externalID: "some Prop Name"} ')
        if(propType !== 'data' || (dataType !== 'string' && dataType !== 'array'))throw new Error('This property must be of type "data" and a dataType of "string" or "array".')
        alias = alias || propName
        let dataArr = (Array.isArray(tsv)) ? tsv : tsvJSONgb(tsv) //can give it a pre-parse array.
        let t = newID(gb,makeSoul({b,t:true}))
        let tconfig = newNodeTypeConfig({alias,parent:makeSoul({b,t:fromt,p}),externalID})
        checkUniques(gb,configPathFromChainPath(makeSoul({b})), tconfig)
        let newNodes = {},updatedNodes = {}, firstParse = {}, existingData = {}, configChanges = {},err
        let headers = dataArr[0]
        headers = headers.map(function(e){return String(e)})
        if(parentProp && headers.indexOf(parentProp) === -1)throw new Error('Parent prop in new data cannot be found. Should be {parentProp: "header prop name"}')
        let {newPconfigs, aliasLookup} = handleImportColCreation(gb, b, t, headers, dataArr[1],variants, externalID, true, !parentProp)
        let parentPval = (parentProp) ? findID(newPconfigs, parentProp) : findID(newPconfigs, 'Parent Node')
        newPconfigs[parentPval].dataType = 'string'
        newPconfigs[parentPval].propType = 'parent'
        newPconfigs[parentPval].linksTo = makeSoul({b,t:fromt,p})
        parseInput()
        function parseInput(){
            console.log(externalID,headers)
            let externalIDidx = headers.indexOf(externalID)
            if(externalIDidx === -1)throw new Error('Cannot find the external IDs specified')
            let invalidData = {}

            for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
                const rowArr = dataArr[i];
                let eid = rowArr[externalIDidx]
                for (let j = 0; j < rowArr.length; j++) {
                    let value = rowArr[j];
                    if(!['',null,undefined].includes(value)){//ignore empty values
                        if(!firstParse[eid])firstParse[eid] = {}
                        const headerPval = aliasLookup[headers[j]]
                        let {dataType} = newPconfigs[headerPval]
                        try {
                            value = convertValueToType(value,dataType,eid,delimiter)
                        } catch (error) {
                            //need to fail back to a 'string' type on this pval and re-convert all data on final time through
                            //convert will not throw errors on 'string' everything else will.
                            invalidData[headerPval] = dataType
                        }
                        firstParse[eid][headerPval] = value
                        
                    }
                }
            }
            let typeChange = Object.keys(invalidData)
            for (const pval of typeChange) {
                newPconfigs[pval].dataType = 'string'
                newPconfigs[pval].propType = 'data' //probably already is, but could be 'date' and 'number'
            }
            getExisting()
        }
        function getExisting(){
            //whatPath must be !#. It should be base,nodeType/relationType,prop
            //Check to make sure soul is correct
            let createdSoul = makeSoul({b,t: fromt,':':true})
            let soulList = []
            gun.get(createdSoul).once(function(data){
                if(data === undefined){let e = new Error('Cannot find Parent Prop Data!'); throwError(e); return}//for loop would error if not stopped
                for (const soul in data) {
                    if(!NODE_SOUL_PATTERN.test(soul))continue
                    if(data[soul]){//truthy
                        //(if something is archived we won't be operating on that data... good? bad? not sure)
                        //in unarchive, we can run through .edit api and it will attempt to convert values to current types
                        soulList.push(soul)
                    }
                }
                let toGet = soulList.length
                console.log(soulList)
                for (const soul of soulList) {
                    getCell(soul,p,function(val,from){
                        toGet--
                        if(from === soul){// if different, then already inherited, skip it
                            if(dataType !== 'array')val = convertValueToType(val,'array',soul,delimiter)//is string based on earlier checks
                            existingData[soul] = val//should be a JSON array
                        }
                        if(toGet <= 0){
                            makeLinks()
                        }

                    },true)
                }
            })
        }
        function makeLinks(){
            try {
                let nextLinks = {}, IDs = {}, lists = {}, allowMultiple = false
                for (const soul in existingData) {//build/check links and make IDs
                    let skip = false, isVar = false, pList
                    let list = JSON.parse(existingData[soul]).sort();
                    if(variants){//parent type has 'variants' enabled
                        let {b,t,r,f} = parseSoul(soul)
                        let pSoul = makeSoul({b,t,r,f:true})
                        if(soul !== pSoul){//is a variant of a prototype
                            isVar = true
                            pList = JSON.parse(existingData[pSoul]).sort()
                            if(JSON.stringify(pList) === JSON.stringify(list)){//should be comparing JSON string arrays
                                //list is the same, null to have it inherit from prototype
                                //we can skip inputting this list in since it is the same as it's prototype
                                addToPut(soul,{[p]:null},updatedNodes)
                                skip = true
                            }
                        }
                    }
                    if(skip)continue
                    let {r,f} = parseSoul(soul)
                    let linkList = []
                    for (let i = 0; i < list.length; i++) {
                        const eid = list[i];
                        let found = firstParse[eid]
                        if(!found){list.splice(i,1);continue}
                        //if we find a many to many link pattern...
                        //two object will reference same child. User will have to manually remove the dependency if they don't want that behavior
                        //they just need to 'remove' the link in the set and make a new child node to replace it to break the dependency.
                        if(IDs[eid])console.warn('Many to many relationship found. A change to this '+eid+' will show up on all parents')
                        if(!IDs[eid]){//use new new t with parent r,f. always 1-1 and we are importing so this is fine.
                            IDs[eid] = makeSoul({b,t,r,f})
                            firstParse[eid][parentPval] = soul //'Parent Node' prop in new data
                        }
                        if(!isVar || (isVar && eid != pList[i])){//this is a variant, and this eid differs from it's prototype
                            //is a proto or this is a variant, and this eid differs from it's prototype
                            //we need to add a 'UP' link on the prototype to this (prototype || variant) soul, so functions will cascade to it.
                            addToPut(makeSoul({b,t,r,f:''}),{[soul]:true},nextLinks)//just merging locally not acutally for put.
                        }
                        linkList.push(IDs[eid])
                    }
                    lists[soul] = linkList
                    if(!allowMultiple && linkList.length > 1)allowMultiple = true
                }
                let dataType = (allowMultiple) ? 'unorderedSet' : 'string'
                let propType = 'child'
                addToPut(makeSoul({b,t:fromt,p,'%':true}),{allowMultiple,propType,dataType,linksTo:makeSoul({b,t,p:parentPval})},configChanges)
                for (const nodeID in lists) {//add all child links to be put
                    let {r,f} = parseSoul(nodeID)
                    const linkArr = lists[nodeID];
                    const linkSoul = makeSoul({b,t:fromt,r,f,p})
                    let val = convertValueToType(linkArr,dataType)//either be a string or object
                    let nodePropVal = (allowMultiple) ? {'#': linkSoul} : val
                    addToPut(nodeID,{[p]:nodePropVal},updatedNodes)
                    if(allowMultiple){// add link node
                        addToPut(linkSoul,val,updatedNodes)
                    }
                }
                for (const eid in firstParse) {//add new nodes to be put
                    const node = firstParse[eid];
                    let soul = IDs[eid]
                    if(!soul)continue //skip import nodes if they were not used from parent
                    for (const p in node) {
                        let {dataType} = newPconfigs[p]
                        const val = convertValueToType(node[p],dataType)//second convert in case any failed the first time.
                        addToPut(soul,{[p]:val},newNodes)
                    }
                }
                for (const trgtNodeID in nextLinks) {//add new nodes to be put
                    let set = nextLinks[trgtNodeID]
                    let {b,t,r,f} = parseSoul(trgtNodeID)
                    let putSoul = makeSoul({b,t,r,f,p:'UP'})//special propID, basically a hidden property that is only used for 'nexts'
                    addToPut(putSoul,convertValueToType(set,'unorderedSet'),newNodes)
                }
                console.log(newNodes,updatedNodes,configChanges)
                if(!err){
                    putData()
                }
            } catch (error) {
                throwError(error)
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
            let now = new Date()
            for (const newSoul in newNodes) {
                let put = newNodes[newSoul]
                gun.get(newSoul).put(put)
                timeIndex(tpath,newSoul,now)//index new souls on the 'created' index
                timeLog(newSoul,put)//log the first edits for each node (basically double data at this point...)
            }
            for (const soul in configChanges) {
                const pObj = configChanges[soul];
                gun.get(soul).put(pObj)  
            }
            for (const soul in updatedNodes) {
                const pObj = updatedNodes[soul];
                gun.get(soul).put(pObj)  
            }
            triggerConfigUpdate()//fire callback for app code to get new config data.
        }
        function addToPut(soul,putObj,toObj){
            if(!toObj[soul]){
                toObj[soul] = putObj
            }else{
                Object.assign(toObj[soul],putObj)
            }
        }
        function throwError(errmsg){
            let e = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
            err = e
            cb.call(cb,err)
            console.log(e)
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return e
    }
    
}
const makeaddChildProp = (gun,gb,triggerConfigUpdate) => (path) => (propNameArr, alias, opts, cb)=>{//updated
    //gbase.base(baseID).nodeType(type).prop(prop).importChildData(rawTSV, 'New Table Alias')
    try{
        let {b,t} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {allowMultiple} = opts
        allowMultiple = !!allowMultiple
        let {externalID,alias:fromAlias} = getValue(configPathFromChainPath(makeSoul({b,t})),gb)
        if(!externalID)throw new Error('The existing nodeType must have an External ID')
        alias = alias || 'New NodeType' + rand(2)
        let configChanges = {}
        let p = newID(gb,makeSoul({b,t,p:true}))
        
        let headers = propNameArr || []
        let backLink = fromAlias
        headers.unshift(backLink)
        headers = headers.map(function(e){return String(e)})
        let tnew = newID(gb,makeSoul({b,t:true}))
        let {newPconfigs, aliasLookup} = handleImportColCreation(gb, b, tnew, headers, [],false, backLink, true, false)
        let parentPval = aliasLookup[backLink]
        let sortval = nextSortval(gb,path)
        let pconfig = newNodePropConfig({alias,sortval,propType: 'child',linksTo:makeSoul({b,t,p:parentPval}),allowMultiple})
        checkUniques(gb,makeSoul({b,t}), pconfig)
        addToPut(makeSoul({b,t,p,'%':true}),pconfig,configChanges)//update config
        addToPut(makeSoul({b,t}),{[p]:true},configChanges)
        newPconfigs[parentPval].dataType = 'string'
        newPconfigs[parentPval].propType = 'parent'
        newPconfigs[parentPval].linksTo = makeSoul({b,t,p})

        let tconfig = newNodeTypeConfig({alias,parent:makeSoul({b,t,p}),externalID:parentPval})//using parent as both an ID and the parent prop...
        checkUniques(gb,makeSoul({b}),tconfig)
        addToPut(makeSoul({b,t:tnew,'%':true}),tconfig,configChanges)//new config
        let tl = '#' + tnew
        addToPut(makeSoul({b}),{[tl]:true},configChanges)//startup list
        //console.log(configChanges,newPconfigs)
        putData()
        
        function putData(){
            for (const p in newPconfigs) {
                const cObj = newPconfigs[p];
                let configSoul = makeSoul({b,t:tnew,p,'%':true})
                let listSoul = makeSoul({b,t:tnew})
                gun.get(configSoul).put(cObj)
                gun.get(listSoul).put({[p]:true})
            }
            for (const soul in configChanges) {
                const pObj = configChanges[soul];
                gun.get(soul).put(pObj)  
            }
            triggerConfigUpdate()//fire callback for app code to get new config data.
        }
        function addToPut(soul,putObj,toObj){
            if(!toObj[soul]){
                toObj[soul] = putObj
            }else{
                Object.assign(toObj[soul],putObj)
            }
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return e
    }
    
}
const makepropIsLookup = (gun,gb,getCell,triggerConfigUpdate) => (path) => (nodeTypePath,opts, cb)=>{//untested
    //gbase.base(baseID).nodeType(type).prop(prop).importChildData(rawTSV, 'New Table Alias')
    try{
        let {b,t: fromt,p: fromp} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {delimiter} = opts
        nodeTypePath = (typeof nodeTypePath === 'object') ? parseSoul(nodeTypePath._path) : parseSoul(nodeTypePath)
        let {t} = nodeTypePath
        let {externalID: p} = getValue(configPathFromChainPath(makeSoul({b,t})),gb)
        if(!p)throw new Error('Target nodeType must have an external identifier')
        let {propType, dataType, alias:propName} = getValue(configPathFromChainPath(makeSoul({b,t:fromt,p: fromp})),gb)
        if(propType !== 'data' || (dataType !== 'string' && dataType !== 'array'))throw new Error('This property must be of type "data" and a dataType of "string" or "array".')
        delimiter = delimiter || ', '
        let newNodes = {},updatedNodes = {}, trgtEIDs = {}, existingData = {}, configChanges = {},err
        getTarget()
        function getTarget(){
            let createdSoul = makeSoul({b,t,':':true})
            let soulList = []
            gun.get(createdSoul).once(function(data){
                if(data === undefined){let e = new Error('Cannot find Parent Prop Data!'); throwError(e); return}//for loop would error if not stopped
                for (const soul in data) {
                    if(!NODE_SOUL_PATTERN.test(soul))continue
                    if(data[soul]){//truthy
                        //(if something is archived we won't be operating on that data... good? bad? not sure)
                        //in unarchive, we can run through .edit api and it will attempt to convert values to current types
                        soulList.push(soul)
                    }
                }
                let toGet = soulList.length
                for (const soul of soulList) {
                    getCell(soul,fromp,function(val,from){
                        toGet--
                        if(from === soul){// if different, then already inherited, skip it
                            trgtEIDs[val] = soul
                        }
                        if(toGet <= 0){
                            getExisting()
                        }
                    },true)
                }
            })
        }
        function getExisting(){
            //whatPath must be !#. It should be base,nodeType/relationType,prop
            //Check to make sure soul is correct
            let createdSoul = makeSoul({b,t: fromt,':':true})
            let soulList = []
            gun.get(createdSoul).once(function(data){
                if(data === undefined){let e = new Error('Cannot find Parent Prop Data!'); throwError(e); return}//for loop would error if not stopped
                for (const soul in data) {
                    if(!NODE_SOUL_PATTERN.test(soul))continue
                    if(data[soul]){//truthy
                        //(if something is archived we won't be operating on that data... good? bad? not sure)
                        //in unarchive, we can run through .edit api and it will attempt to convert values to current types
                        soulList.push(soul)
                    }
                }
                let toGet = soulList.length
                for (const soul of soulList) {
                    getCell(soul,fromp,function(val,from){
                        toGet--
                        if(from === soul){// if different, then already inherited, skip it
                            if(dataType !== 'array')val = convertValueToType(val,'array',soul,delimiter)//is string based on earlier checks
                            existingData[soul] = val//should be a JSON array
                        }
                        if(toGet <= 0){
                            makeLinks()
                        }

                    },true)
                }
            })
        }
        function makeLinks(){
            try {
                let nextLinks = {}, lists = {}, allowMultiple = false
                for (const soul in existingData) {//build/check links and make IDs
                    let list = JSON.parse(existingData[soul]);
                    let linkList = []
                    for (let i = 0; i < list.length; i++) {
                        const eid = list[i];
                        let found = trgtEIDs[eid]
                        if(!found){list.splice(i,1);continue}
                        linkList.push(found)//add soul to new array
                        addToPut(found,{[soul]:true},nextLinks)//just merging locally not acutally for put.
                    }
                    lists[soul] = linkList
                    if(linkList.length > 1)allowMultiple = true
                }
                let dataType = (allowMultiple) ? 'unorderedSet' : 'string'
                let propType = 'child'
                addToPut(makeSoul({b,t:fromt,p: fromp,'%':true}),{allowMultiple,propType,dataType},configChanges)
                for (const nodeID in lists) {//add all child links to be put
                    let {b,t,r,f} = parseSoul(nodeID)
                    const linkArr = lists[nodeID];
                    const linkSoul = makeSoul({b,t,r,f,p:fromp})
                    let val = convertValueToType(linkArr,dataType)//either be a string or object
                    let nodePropVal = (allowMultiple) ? {'#': linkSoul} : val
                    addToPut(nodeID,{[fromp]:nodePropVal},updatedNodes)
                    if(allowMultiple){// add link node
                        addToPut(linkSoul,val,updatedNodes)
                    }
                }
                for (const trgtNodeID in nextLinks) {//add new nodes to be put
                    let set = nextLinks[trgtNodeID]
                    let {b,t,r,rt,f} = parseSoul(trgtNodeID)//adding rt since you could 'lookup' on a relationship??
                    let putSoul = makeSoul({b,t,r,rt,f,p:'UP'})//special propID, basically a hidden property that is only used for 'nexts'
                    addToPut(putSoul,convertValueToType(set,'unorderedSet'),newNodes)
                }
                console.log(newNodes,updatedNodes,configChanges)
                if(!err){
                    putData()
                }
            } catch (error) {
                throwError(error)
            }
        }
        function putData(){
            
            for (const newSoul in newNodes) {
                let put = newNodes[newSoul]
                gun.get(newSoul).put(put)
            }
            for (const soul in configChanges) {
                const pObj = configChanges[soul];
                gun.get(soul).put(pObj)  
            }
            for (const soul in updatedNodes) {
                const pObj = updatedNodes[soul];
                gun.get(soul).put(pObj)  
            }
            triggerConfigUpdate()//fire callback for app code to get new config data.
        }
        function addToPut(soul,putObj,toObj){
            if(!toObj[soul]){
                toObj[soul] = putObj
            }else{
                Object.assign(toObj[soul],putObj)
            }
        }
        function throwError(errmsg){
            let e = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
            err = e
            cb.call(cb,err)
            console.log(e)
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return e
    }
    
}
const makechildFromProp = (gun,gb,getCell,timeLog,timeIndex,triggerConfigUpdate) => (path) => (alias,opts, cb)=>{//untested
    //gbase.base(baseID).nodeType(type).prop(prop).importChildData(rawTSV, 'New Table Alias')
    try{
        let {b,t:fromt,p} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {delimiter} = opts
        let {propType, dataType, alias:propName} = getValue(configPathFromChainPath(makeSoul({b,t: fromt,p})),gb)
        let {variants, externalID} = getValue(configPathFromChainPath(makeSoul({b,t: fromt})),gb)
        delimiter = delimiter || ', '
        if(!externalID)throw new Error('The parent nodeType should have an external identifier specified')
        if(propType !== 'data' || (dataType !== 'string' && dataType !== 'array'))throw new Error('This property must be of type "data" and a dataType of "string" or "array".')
        alias = alias || propName
        let t = newID(gb,makeSoul({b,t:true}))
        //need to get all the arrays of objects before the rest can be done
        let newPconfigs,aliasLookup,tconfig,parentPval,allowMultiple

        let newNodes = {},updatedNodes = {}, existingData = {}, configChanges = {}, err
        let childNodes = {}, forVarDeDup = {}, hashes = {}
        
        getExisting()
        function getExisting(){
            //whatPath must be !#. It should be base,nodeType/relationType,prop
            //Check to make sure soul is correct
            let createdSoul = makeSoul({b,t: fromt,':':true})
            let soulList = []
            gun.get(createdSoul).once(function(data){
                if(data === undefined){let e = new Error('Cannot find Parent Prop Data!'); throwError(e); return}//for loop would error if not stopped
                for (const soul in data) {
                    if(!NODE_SOUL_PATTERN.test(soul))continue
                    if(data[soul]){//truthy
                        //(if something is archived we won't be operating on that data... good? bad? not sure)
                        //in unarchive, we can run through .edit api and it will attempt to convert values to current types
                        soulList.push(soul)
                    }
                }
                let toGet = soulList.length
                for (const soul of soulList) {
                    getCell(soul,p,function(val,from){
                        toGet--
                        if(from === soul){// if different, then already inherited, skip it
                            if(dataType !== 'array')val = convertValueToType(val,'array',soul,delimiter)//is string based on earlier checks
                            existingData[soul] = val//should be a JSON array
                        }
                        if(toGet <= 0){
                            makeObjects()
                        }

                    },true)
                }
            })
        }
        function makeObjects(){
            try {
                let propAndType = {}
                let id = 0
                for (const soul in existingData) {
                    let {f} = parseSoul(soul)
                    const arr = JSON.parse(existingData[soul]);
                    let links = []
                    for (const obj of arr) {
                        if(typeof obj !== 'object')throwError(new Error('Must be an array of objects in order to create nodes.'))
                        let newSoul = makeSoul({b,t,r:id,f})
                        childNodes[newSoul] = {}
                        id++
                        for (const palias in obj) {
                            const val = obj[palias];
                            childNodes[newSoul][palias] = val

                            if(!propAndType[palias])propAndType[palias] = null
                            let type = typeof val
                            if(propAndType[palias] === null) propAndType[palias] = type
                            if(propAndType[palias] !== null && propAndType[palias] !== 'string' && propAndType[palias] !== type) propAndType[palias] = 'string'
                            //goal is to set it as things that aren't sting's and if a second one is different, then default to 'string'
                        }
                        if(variants){
                            let h = hash64(JSON.stringify(obj))
                            hashes[h] = newSoul
                            links.push(h) 
                        }else{
                            links.push(newSoul)
                        }
                    }
                    if(variants){
                        forVarDeDup[soul] = links
                    }
                    existingData[soul] = links
                    if(!allowMultiple && links.length > 1)allowMultiple = true
                }
    
                let headers = Object.keys(propAndType)
                headers.unshift(propName)
                headers = headers.map(function(e){return String(e)})
                
                let res = handleImportColCreation(gb, b, t, headers, [],false, propName, true, false)
                newPconfigs = res.newPconfigs//so we can get outside of fn scope
                aliasLookup = res.aliasLookup
                parentPval = aliasLookup[propName]
                newPconfigs[parentPval].dataType = 'string'
                newPconfigs[parentPval].propType = 'parent'
                newPconfigs[parentPval].linksTo = makeSoul({b,t:fromt,p})
                for (const palias in propAndType) {
                    const dataType = propAndType[palias];
                    let p = aliasLookup[palias]
                    newPconfigs[p].dataType = dataType
                }
    
                tconfig = newNodeTypeConfig({alias,parent:makeSoul({b,t:fromt,p}),externalID:parentPval})
                checkUniques(gb,configPathFromChainPath(makeSoul({b})), tconfig)
                if(variants){
                    dedup()
                }else{
                    makeLinks()
                }
            } catch (error) {
                throwError(error)
            }

        }
        function dedup(){
            //only here if variants
            //find all protos first and get them with JSON objs in an array
            //go through again and check each obj on variants, splice out dupes
            for (const soul in existingData) {//round 2, looking at variants only
                if(PROTO_NODE_SOUL.test(soul))continue
                let tempUP = {}
                let {b,t,r} = parseSoul(soul)
                let protoSoul = makeSoul({b,t,r,f:''})
                let arrOfHashes = existingData[soul]
                let list = []
                for (const hash of arrOfHashes) {
                    let childSoul = hashes[hash]
                    if(forVarDeDup[protoSoul].includes(hash)){
                        //we need to add an UP to this
                        let childSoul = hashes[hash]
                        tempUP[childSoul] = {[soul]:true}
                    }else{
                        list.push(childSoul)
                    }
                }
                if(list.length){
                    Object.assign(nextLinks,tempUP)
                    existingData[soul] = list//should be mutated now, replacing on soul. Should only have 'own' objects
                }else{//ignore tempUP, since it all looks to the proto
                    addToPut(soul,{[p]:null},updatedNodes)//will now inherit from proto
                    delete existingData[soul]
                }
            }
            makeLinks()
        }
        function makeLinks(){
            try {
                let lists = {}
                for (const soul in existingData) {//build/check links and make IDs
                    let list = existingData[soul]
                    for (const newSoul of list) {
                        id++
                        let obj = childNodes[newSoul]
                        for (const palias in obj) {
                            let p = aliasLookup[palias]
                            let {dataType} = newPconfigs[p]
                            const val = convertValueToType(obj[palias],dataType)
                            addToPut(newSoul,{[p]:val},newNodes)//need to replace alias with ids on p, final type convert
                        }
                        
                        addToPut(newSoul,{[parentPval]:soul},newNodes)//add data to object, 'parent' property
                        //is a proto or this is a variant, and is only in this for loop if it had differs from it's prototype
                        //we need to add a 'UP' link on it regardless so functions will cascade to it.
                        addToPut(newSoul,{[soul]:true},nextLinks)//just merging locally not acutally for put.
                    }
                    
                    lists[soul] = list
                    if(!allowMultiple && list.length > 1)allowMultiple = true
                }
                let dataType = (allowMultiple) ? 'unorderedSet' : 'string'
                let propType = 'child'
                addToPut(makeSoul({b,t:fromt,p,'%':true}),{allowMultiple,propType,dataType,linksTo:makeSoul({b,t,p:parentPval})},configChanges)
                for (const nodeID in lists) {//add all child links to be put
                    let {r,f} = parseSoul(nodeID)
                    const linkArr = lists[nodeID];
                    const linkSoul = makeSoul({b,t:fromt,r,f,p})
                    let val = convertValueToType(linkArr,dataType)//either be a string or object
                    let nodePropVal = (allowMultiple) ? {'#': linkSoul} : val
                    addToPut(nodeID,{[p]:nodePropVal},updatedNodes)
                    if(allowMultiple){// add link node
                        addToPut(linkSoul,val,updatedNodes)
                    }
                }
                for (const trgtNodeID in nextLinks) {//add new nodes to be put
                    let set = nextLinks[trgtNodeID]//should be array of souls
                    let {b,t,r,f} = parseSoul(trgtNodeID)
                    let putSoul = makeSoul({b,t,r,f,p:'UP'})//special propID, basically a hidden property that is only used for 'nexts'
                    addToPut(putSoul,convertValueToType(set,'unorderedSet'),newNodes)
                }
                console.log(newNodes,updatedNodes,configChanges)
                if(!err){
                    putData()
                }
            } catch (error) {
                throwError(error)
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
            let now = new Date()
            let {log} = tconfig
            for (const newSoul in newNodes) {
                let put = newNodes[newSoul]
                gun.get(newSoul).put(put)
                timeIndex(tpath,newSoul,now)//index new souls on the 'created' index
                if(log){
                    timeLog(newSoul,put)//log the first edits for each node (basically double data at this point...)
                }
            }
            for (const soul in configChanges) {
                const pObj = configChanges[soul];
                gun.get(soul).put(pObj)  
            }
            for (const soul in updatedNodes) {
                const pObj = updatedNodes[soul];
                gun.get(soul).put(pObj)  
            }
            triggerConfigUpdate()//fire callback for app code to get new config data.
        }
        function addToPut(soul,putObj,toObj){
            if(!toObj[soul]){
                toObj[soul] = putObj
            }else{
                Object.assign(toObj[soul],putObj)
            }
        }
        function throwError(errmsg){
            let e = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
            err = e
            cb.call(cb,err)
            console.log(e)
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return e
    }
    
}


const makearchive = (gun,gb) => path => () =>{//TODO

}
const makeunarchive = (gun,gb) => path => () =>{//TODO

}
const makedelete = (gun,gb) => path => () =>{//TODO

}
const makenullValue = (gun) => path => () =>{//TODO

}

//relationship
const makerelatesTo = (gun,gb,getCell) => path => (trgt,rt,rtProps) =>{//TODO
    let path = this._path
    let {b} = parseSoul(path)
    rtProps = rtProps || false
    let {relations} = getValue(configPathFromChainPath(makeSoul({b})),gb)
    rt = findID(relations,rt)//rt will be '-'id
    
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
    makenewFrom,
    makeconfig,
    makeedit,
    makesubscribe,
    makeretrieve,
    makelinkRowTo,
    makeimportData,
    makeimportNewNodeType,
    makeshowgb,
    makeshowcache,
    makeshowgsub,
    makeshowgunsub,
    makeunlinkRow,
    makesubscribeQuery,
    makeretrieveQuery,
    makesetAdmin,
    makenewGroup,
    makeaddUser,
    makeuserAndGroup,
    makechp,
    makeimportChildData,
    makeaddChildProp,
    makepropIsLookup,
    makearchive,
    makeunarchive,
    makedelete,
    makenullValue,
    makerelatesTo
}