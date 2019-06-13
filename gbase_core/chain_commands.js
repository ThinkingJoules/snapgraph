
const{newBaseConfig,
    newNodeTypeConfig,
    newNodePropConfig,
    newRelationshipConfig,
    newRelationshipPropConfig,
    handleImportColCreation,
    handleTableImportPuts,
    checkConfig,
    makehandleConfigChange
} = require('./configs')

const{getValue,
    configPathFromChainPath,
    findID,
    findRowID,
    tsvJSONgb,
    watchObj,
    convertValueToType,
    checkUniques,
    nextSortval,
    getColumnType,
    hasPropType,
    handleDataEdit,
    addAssociation,
    removeAssociation,
    getRetrieve,
    checkAliasName,
    getAllActiveProps,
    buildPermObj,
    makeSoul,
    parseSoul,
    rand,
    putData,
    newID,
    setValue,
    NODE_SOUL_PATTERN,
    hash64,
    PROTO_NODE_SOUL,
    DATA_INSTANCE_NODE,
    newDataNodeID,
    configSoulFromChainPath,
    IS_CONFIG_SOUL
} = require('./util')

const {relationIndex} = require('../chronicle/chronicle')
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
const makenewNodeType = (gun, gb, timeLog) => (path) => (configObj,cb,propConfigArr)=>{
    let {b} = parseSoul(path)
    let {id:tid} = configObj
    let toPut = {}
    let newGB = Object.assign({},gb)
    let err

    if(!tid){
        tid = newID(newGB,makeSoul({b,t:true}))
    }else if(tid && /[^a-z0-9]/i.test(tid)){
        throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
    }else{
        //using user supplied id
        delete configObj.id
    }
    let tconfig = newNodeTypeConfig(configObj)
    let newPath = makeSoul({b,t:tid})
    let tCsoul = configSoulFromChainPath(newPath)
    console.log(newPath,tCsoul)
    const config = makehandleConfigChange(gun,newGB)
    config(tconfig,newPath,{isNew:true, internalCB:function(obj){
        let {configPuts} = obj
        Object.assign(toPut,configPuts)
        if(propConfigArr && propConfigArr.length){
            let forGB = Object.assign({},configPuts[tCsoul],{props:{}})
            setValue(configPathFromChainPath(newPath),forGB,newGB)
            makeProp()
        }else{
            done()
        }
    }},throwError)
    function handlePropCreation(o){
        propConfigArr.shift()
        let {path,configPuts} = o
        console.log(path,configPuts)
        let cSoul = configSoulFromChainPath(path)
        for (const soul in configPuts) {
            addToPut(soul,configPuts[soul])
        }
        if(propConfigArr.length){
            console.log(configPathFromChainPath(path),configPuts[cSoul],newGB)
            setValue(configPathFromChainPath(path),configPuts[cSoul],newGB)
            makeProp()
        }else{
            done()
        }

    }
    
    function makeProp(){
        let nextPconfig = propConfigArr[0]
        let {id} = nextPconfig
        if(!id){
            id = newID(newGB,makeSoul({b,t:tid,p:true}))
        }else if(id && /[^a-z0-9]/i.test(id)){
            throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
        }else{
            //using user supplied id
            delete nextPconfig.id
        }
        let pconfig = newNodePropConfig(nextPconfig)
        let newPpath = makeSoul({b,t:tid,p:id})
        config(pconfig,newPpath,{isNew:true,internalCB:handlePropCreation},throwError)

    }
    function done(){
        if(err)return
        for (const csoul in toPut) {//put all configs in
            const cObj = toPut[csoul];
            if(IS_CONFIG_SOUL.test(csoul))timeLog(csoul,cObj)
            gun.get(csoul).put(cObj)
        }
    }
    function throwError(errmsg){
        let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = error
        console.log(error)
        cb.call(cb,error)
    }
    function addToPut(soul,putObj){
        if(!toPut[soul])toPut[soul] = putObj
        else Object.assign(toPut[soul],putObj)
    }
}
const makeaddProp = (gun, gb, timeLog) => (path) => (configObj)=>{
    let {b,t,r} = parseSoul(path)
    let propConfigArr = (Array.isArray(configObj)) ? configObj : [configObj]
    let isNode = t || false
    let toPut = {}
    let newGB = Object.assign({},gb)
    let err
    const config = makehandleConfigChange(gun,newGB)
    makeProp()
    function handlePropCreation(o){
        propConfigArr.shift()
        let {path,configPuts} = o
        let cSoul = configSoulFromChainPath(path)
        for (const soul in configPuts) {
            addToPut(soul,configPuts[soul])
        }
        if(propConfigArr.length){
            setValue(configPathFromChainPath(path),configPuts[cSoul],newGB)
            makeProp()
        }else{
            done()
        }

    }
    function makeProp(){
        let nextPconfig = propConfigArr[0]
        let {id} = nextPconfig
        if(!id){
            id = newID(newGB,makeSoul({b,t,r,p:true}))
        }else if(id && /[^a-z0-9]/i.test(id)){
            throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
        }else{
            //using user supplied id
            delete nextPconfig.id
        }
        let pconfig = (isNode) ? newNodePropConfig(nextPconfig) : newRelationshipPropConfig(nextPconfig)
        let newPpath = makeSoul({b,t,r,p:id})
        config(pconfig,newPpath,{isNew:true,internalCB:handlePropCreation},throwError)

    }
    function done(){
        if(err)return
        for (const csoul in toPut) {//put all configs in
            const cObj = toPut[csoul];
            if(IS_CONFIG_SOUL.test(csoul))timeLog(csoul,cObj)
            gun.get(csoul).put(cObj)
        }
    }
    function throwError(errmsg){
        let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = error
        console.log(error)
        cb.call(cb,error)
    }
    function addToPut(soul,putObj){
        if(!toPut[soul])toPut[soul] = putObj
        else Object.assign(toPut[soul],putObj)
    }
}
const makenewNode = (gun,gb,getCell,cascade,timeLog,timeIndex) => (path) => (data, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,p} = parseSoul(path)
        //if p then this is a childNode of the this path
        //API can be called from:
        /*
        gbase.base(b).nodeType(t).newNode() << where t is a root table, as-is api
        gbase.node(nodeID).prop(childPropType).newNode() || gbase.node(!#.$).newNode() <<gbase can handle everything, this is the preferred method.
        */
       let rid = newDataNodeID()
       let ctx
       data = data || {}
       if(p){//if this is a new childNode
            let {linksTo} = getValue(configPathFromChainPath(makeSoul({b,t,p})),gb)
            ctx = path
            let pObj = parseSoul(linksTo)
            b=pObj.b
            t=pObj.t
            if(!b || !t)throw new Error('Cannot find the linking nodeType you are trying to create. {linksTo: undefined}')
       }
       let opts = {isNew:true,ctx}
       let newID = makeSoul({b,t,i:rid})//b,t should be either path, or linksTo values
       putData(gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex,newID,data,opts,cb)
    }catch(e){
        cb.call(this, e)
        console.log(e)
    }
}
const makenewFrom = (gun,gb,getCell,cascade,timeLog,timeIndex) => (path) => (data,cb,opt)=>{//TODO
    try{
        //API can be called from:
        /*
        gbase.base(b).nodeType(t).node(ID).newFrom() << where t is a root table, as-is api
        gbase.node(ID).newFrom() <<gbase can handle everything, this is the preferred method.
        */
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,i} = parseSoul(path)
        let {own,mirror} = opt || {}
        //own is basically 'copy', will create an independent node based on the values of referenced node
        //mirror is copying the SAME refs to the new node (new node looks directly to the from nodes inherited values)
        //(default is create refs to the from node)
        let rid = newDataNodeID()       
        let opts = {isNew:true,ctx:path,own,mirror}
        let newID = makeSoul({b,t,i:rid})
        putData(gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex,newID,data,opts,cb)
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
const makeedit = (gun,gb,getCell,cascade,timeLog,timeIndex) => (path) => (editObj, cb, opt)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,r} = parseSoul(path)
        let eSoul = makeSoul({b,t,r,':':true})//look for a created time for this id, might be archived.
        let {own} = opt || {}
        //own in this context will put the value on this node, even if the inherited value is the same
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
                putData(gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex,path,editObj,{own},cb)
            }
            console.log(e)
            cb.call(cb,e) 
        })
    }catch(e){
        console.log(e)
        cb.call(this, e)
    }
}

const makeretrieveQuery = (gb,setupQuery) => (path) => (cb, colArr, queryArr) =>{
    try{//path = base/tval CAN ONLY QUERY TABLES
        let [base,tval] = path.split('/')
        let {props} = getValue([base,'props',tval],gb)
        let pvalArr = []
        if(!colArr){
            colArr = getAllActiveProps(gb,path)
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
        colArr = colArr || getAllActiveProps(gb,path)
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
                    let i = IDs[eid]
                    rowsoul= makeSoul({b,t,i,f:true})
                }else{
                    let i = IDs[PROTOTYPE]
                    let f = IDs[eid]
                    rowsoul= makeSoul({b,t,i,f})
                    let protoList = makeSoul({b,t,i})
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
            for (let k = 1; k < dataArr.length; k++) {//start at 1, past header
                const rowArr = dataArr[k];
                let i = rid
                let rowsoul = makeSoul({b,t,i,f:''})
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
                        let {b,t,i,f} = parseSoul(soul)
                        let pSoul = makeSoul({b,t,i,f:true})
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
                    let {i,f} = parseSoul(soul)
                    let linkList = []
                    for (let k = 0; k < list.length; k++) {
                        const eid = list[k];
                        let found = firstParse[eid]
                        if(!found){list.splice(k,1);continue}
                        //if we find a many to many link pattern...
                        //two object will reference same child. User will have to manually remove the dependency if they don't want that behavior
                        //they just need to 'remove' the link in the set and make a new child node to replace it to break the dependency.
                        if(IDs[eid])console.warn('Many to many relationship found. A change to this '+eid+' will show up on all parents')
                        if(!IDs[eid]){//use new new t with parent i,f. always 1-1 and we are importing so this is fine.
                            IDs[eid] = makeSoul({b,t,i,f})
                            firstParse[eid][parentPval] = soul //'Parent Node' prop in new data
                        }
                        if(!isVar || (isVar && eid != pList[i])){//this is a variant, and this eid differs from it's prototype
                            //is a proto or this is a variant, and this eid differs from it's prototype
                            //we need to add a 'UP' link on the prototype to this (prototype || variant) soul, so functions will cascade to it.
                            addToPut(makeSoul({b,t,i,f:''}),{[soul]:true},nextLinks)//just merging locally not acutally for put.
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
                    let {i,f} = parseSoul(nodeID)
                    const linkArr = lists[nodeID];
                    const linkSoul = makeSoul({b,t:fromt,i,f,p})
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
                    let {b,t,i,f} = parseSoul(trgtNodeID)
                    let putSoul = makeSoul({b,t,i,f,p:'UP'})//special propID, basically a hidden property that is only used for 'nexts'
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
const makeaddChildProp = (gun,gb,timeLog,triggerConfigUpdate) => (path) => (configObj,propConfigArr, allowMultiple, cb)=>{//updated
    //gbase.base(baseID).nodeType(type).prop(prop).importChildData(rawTSV, 'New Table Alias')
    let {b,t} = parseSoul(path)
    let {alias:fromAlias} = getValue(configPathFromChainPath(makeSoul({b,t})),gb)
    let {id:tid} = configObj
    propConfigArr = propConfigArr || []
    allowMultiple = (allowMultiple === undefined) ? true : allowMultiple
    let toPut = {}
    let newGB = Object.assign({},gb)
    let err
    let pid = newID(gb,makeSoul({b,t,p:true}))
    const config = makehandleConfigChange(gun,newGB)
    let tconfig = newNodeTypeConfig(configObj)
    let pconfig = newNodePropConfig({alias:tconfig.alias,propType:'child',allowMultiple})
    let newPath = makeSoul({b,t,p:pid})
    let pCsoul = configSoulFromChainPath(newPath)
    config(pconfig,newPath,{isNew:true, internalCB:function(obj){
        let {path,configPuts} = obj
        Object.assign(toPut,configPuts)
        setValue(configPathFromChainPath(newPath),configPuts[pCsoul],newGB)
        if(!tid){
            tid = newID(newGB,makeSoul({b,t:true}))
        }else if(tid && /[^a-z0-9]/i.test(tid)){
            throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
        }else{
            //using user supplied id
            delete configObj.id
        }
        
        let newTypePath = makeSoul({b,t:tid})
        let tCsoul = configSoulFromChainPath(newTypePath)
        tconfig.parent = path
        config(tconfig,newTypePath,{isNew:true, internalCB:function(obj){
            let {configPuts} = obj
            Object.assign(toPut,configPuts)
            propConfigArr.unshift({alias:fromAlias,linksTo:path,propType:'parent'})
            if(propConfigArr && propConfigArr.length){
                let forGB = Object.assign({},configPuts[tCsoul],{props:{}})
                setValue(configPathFromChainPath(newTypePath),forGB,newGB)
                makeProp()
            }else{
                done()
            }
        }},throwError)
    }},throwError)
    
    function handlePropCreation(o){
        propConfigArr.shift()
        let {path,configPuts} = o
        let cSoul = configSoulFromChainPath(path)
        for (const soul in configPuts) {
            if(configPuts[soul].linksTo && configPuts[soul].linksTo !== ''){
                //nab the parent prop we unshifted, and add it to the child prop linksTo
                let {b,t,p} = parseSoul(soul)
                addToPut(pCsoul,{linksTo:makeSoul({b,t,p})})
            }
            addToPut(soul,configPuts[soul])
        }
        if(propConfigArr.length){
            setValue(configPathFromChainPath(path),configPuts[cSoul],newGB)
            makeProp()
        }else{
            done()
        }

    }
    
    function makeProp(){
        let nextPconfig = propConfigArr[0]
        let {id} = nextPconfig
        if(!id){
            id = newID(newGB,makeSoul({b,t:tid,p:true}))
        }else if(id && /[^a-z0-9]/i.test(id)){
            throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
        }else{
            //using user supplied id
            delete nextPconfig.id
        }
        let pconfig = newNodePropConfig(nextPconfig)
        let newPpath = makeSoul({b,t:tid,p:id})
        config(pconfig,newPpath,{isNew:true,internalCB:handlePropCreation},throwError)

    }
    function done(){
        if(err)return
        for (const csoul in toPut) {//put all configs in
            const cObj = toPut[csoul];
            if(IS_CONFIG_SOUL.test(csoul))timeLog(csoul,cObj)
            gun.get(csoul).put(cObj)
        }
        triggerConfigUpdate()
    }
    function throwError(errmsg){
        let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = error
        console.log(error)
        cb.call(cb,error)
    }
    function addToPut(soul,putObj){
        if(!toPut[soul])toPut[soul] = putObj
        else Object.assign(toPut[soul],putObj)
    }



    // try{
    //     let {b,t} = parseSoul(path)
    //     cb = (cb instanceof Function && cb) || function(){}
    //     let {allowMultiple} = opts
    //     allowMultiple = !!allowMultiple
    //     let {alias:fromAlias} = getValue(configPathFromChainPath(makeSoul({b,t})),gb)
    //     alias = alias || 'New NodeType' + rand(2)
    //     let configChanges = {}
    //     let p = newID(gb,makeSoul({b,t,p:true}))
        
    //     let headers = propNameArr || []
    //     let backLink = fromAlias
    //     headers.unshift(backLink)
    //     headers = headers.map(function(e){return String(e)})
    //     let tnew = newID(gb,makeSoul({b,t:true}))
    //     let {newPconfigs, aliasLookup} = handleImportColCreation(gb, b, tnew, headers, [],false, backLink, true, false)
    //     let parentPval = aliasLookup[backLink]
    //     let pconfig = newNodePropConfig({alias,propType: 'child',linksTo:makeSoul({b,t:tnew,p:parentPval}),allowMultiple})
    //     checkUniques(gb,makeSoul({b,t}), pconfig)
    //     addToPut(makeSoul({b,t,p,'%':true}),pconfig,configChanges)//update config
    //     addToPut(makeSoul({b,t}),{[p]:{'#': makeSoul({b,t,p,'%':true})}},configChanges)
    //     newPconfigs[parentPval].dataType = 'string'
    //     newPconfigs[parentPval].propType = 'parent'
    //     newPconfigs[parentPval].linksTo = makeSoul({b,t,p})
    //     let tconfig = newNodeTypeConfig({alias,parent:makeSoul({b,t,p})})
    //     checkUniques(gb,makeSoul({b}),tconfig)
    //     addToPut(makeSoul({b,t:tnew,'%':true}),tconfig,configChanges)//new config
    //     let tl = '#' + tnew
    //     addToPut(makeSoul({b}),{[tl]:{'#': makeSoul({b,t:tnew,'%':true})}},configChanges)//startup list
    //     //console.log(configChanges,newPconfigs)
    //     putData()
        
    //     function putData(){
    //         for (const p in newPconfigs) {
    //             const cObj = newPconfigs[p];
    //             let configSoul = makeSoul({b,t:tnew,p,'%':true})
    //             let listSoul = makeSoul({b,t:tnew})
    //             gun.get(configSoul).put(cObj)
    //             gun.get(listSoul).put({[p]:true})
    //         }
    //         for (const soul in configChanges) {
    //             const pObj = configChanges[soul];
    //             gun.get(soul).put(pObj)  
    //         }
    //         triggerConfigUpdate()//fire callback for app code to get new config data.
    //     }
    //     function addToPut(soul,putObj,toObj){
    //         if(!toObj[soul]){
    //             toObj[soul] = putObj
    //         }else{
    //             Object.assign(toObj[soul],putObj)
    //         }
    //     }
    // }catch(e){
    //     console.log(e)
    //     cb.call(this,e)
    //     return e
    // }
    
}
const makepropIsLookup = (gun,gb,getCell,triggerConfigUpdate) => (path) => (nodeTypePath,opts, cb)=>{//needs rework... again
    //gbase.base(baseID).nodeType(type).prop(prop).importChildData(rawTSV, 'New Table Alias')
    try{
        let {b,t: fromt,p: fromp} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {delimiter} = opts
        nodeTypePath = (typeof nodeTypePath === 'object') ? parseSoul(nodeTypePath._path) : parseSoul(nodeTypePath)
        let {t} = nodeTypePath
        let {externalID: p,parent} = getValue(configPathFromChainPath(makeSoul({b,t})),gb)
        if(!p)throw new Error('Target nodeType must have an external identifier')
        if(parent !== '') throw new Error('Can only "lookup" to a root nodeType.')
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
                    let {b,t,i,f} = parseSoul(nodeID)
                    const linkArr = lists[nodeID];
                    const linkSoul = makeSoul({b,t,i,f,p:fromp})
                    let val = convertValueToType(linkArr,dataType)//either be a string or object
                    let nodePropVal = (allowMultiple) ? {'#': linkSoul} : val
                    addToPut(nodeID,{[fromp]:nodePropVal},updatedNodes)
                    if(allowMultiple){// add link node
                        addToPut(linkSoul,val,updatedNodes)
                    }
                }
                for (const trgtNodeID in nextLinks) {//add new nodes to be put
                    let set = nextLinks[trgtNodeID]
                    let {b,t,i,r,f} = parseSoul(trgtNodeID)//adding r since you could 'lookup' on a relationship??
                    let putSoul = makeSoul({b,t,i,r,f,p:'UP'})//special propID, basically a hidden property that is only used for 'nexts'
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
const makechildFromProp = (gun,gb,getCell,timeLog,timeIndex,triggerConfigUpdate) => (path) => (alias,opts, cb)=>{//needs rework... again
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
                        let newSoul = makeSoul({b,t,i:id,f})
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
                let {b,t,i} = parseSoul(soul)
                let protoSoul = makeSoul({b,t,i,f:''})
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
                    let {i,f} = parseSoul(nodeID)
                    const linkArr = lists[nodeID];
                    const linkSoul = makeSoul({b,t:fromt,i,f,p})
                    let val = convertValueToType(linkArr,dataType)//either be a string or object
                    let nodePropVal = (allowMultiple) ? {'#': linkSoul} : val
                    addToPut(nodeID,{[p]:nodePropVal},updatedNodes)
                    if(allowMultiple){// add link node
                        addToPut(linkSoul,val,updatedNodes)
                    }
                }
                for (const trgtNodeID in nextLinks) {//add new nodes to be put
                    let set = nextLinks[trgtNodeID]//should be array of souls
                    let {b,t,i,f} = parseSoul(trgtNodeID)
                    let putSoul = makeSoul({b,t,i,f,p:'UP'})//special propID, basically a hidden property that is only used for 'nexts'
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
const makerelatesTo = (gun,gb,getCell) => path => (trgt,r,rtProps) =>{//TODO
    try{
        cb = (cb instanceof Function && cb) || function(){}
        if(!DATA_INSTANCE_NODE.test(path) || !DATA_INSTANCE_NODE.test(trgt)){
            throw new Error('Must use a nodeID with a pattern of '+DATA_INSTANCE_NODE.toSting()+' for both `ID` node(ID).relatesTo(ID, relationship)')
        }
        let {b} = parseSoul(path)
        if(!rtProps)rtProps = {}
        Object.assign(rtProps,{source:path,target:trgt})
        let {relations} = getValue(configPathFromChainPath(makeSoul({b})),gb)
        r = findID(relations,r)//r will be '-'id, will throw error if not found
        let hashStr = path+trgt
        let i = hash64(hashStr)//should never have two relation nodes (of same r id) with same src+trgt
        let newID = makeSoul({b,r,i})
        let opts = {isNew:true}
        let eSoul = makeSoul({b,r,':':true})//look for a created time for this id, might be archived.
        gun.get(eSoul).get(newID).get(function(msg,eve){
            let value = msg.put
            eve.off()
            if(value === undefined || value === false || value === null){
                putData(gun,gb,getCell,cascade,timeLog,timeIndex,newID,rtProps,opts,cb)
            }else{
                let e = new Error('Relationship already exists!')
                console.log(e)
                cb.call(cb,e) 
            }
            
        })
    }catch(e){
        cb.call(this, e)
        console.log(e)
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