
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
    try{
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
    makeimportData,
    makeimportNewNodeType,
    makeshowgb,
    makeshowcache,
    makeshowgsub,
    makeshowgunsub,
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