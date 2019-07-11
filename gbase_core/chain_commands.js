
const{newBaseConfig,
    newNodeTypeConfig,
    newNodePropConfig,
    newRelationshipConfig,
    newRelationshipPropConfig,
    handleImportColCreation,
    handleTableImportPuts,
    makehandleConfigChange
} = require('./configs')

const{getValue,
    configPathFromChainPath,
    findID,
    findRowID,
    tsvJSONgb,
    convertValueToType,
    checkUniques,
    hasPropType,
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
    IS_CONFIG_SOUL,
    makeEnq
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
const makenewBase = (gun,timeLog) => (alias, basePermissions, baseID) =>{
    try{
        let user = gun.user()
        let pub = user && user.is && user.is.pub || false
        let invalidID = /[^a-zA-Z0-9]/
        let b = baseID || rand(10)
        if(!pub){
            throw new Error('Must be signed in to perform this action')
        }
        if(invalidID.test(baseID)){
            throw new Error('baseID must only contain letters and numbers')
        }
        gun.get(makeSoul({b,'|':'super'})).put({[pub]:true})
        
        const putRest = () =>{
            let perms = buildPermObj('base',pub,basePermissions)
            let adminID = rand(5)
            let anyID = rand(5)
            gun.get(makeSoul({b,'|':true})).put(perms)
            gun.get(makeSoul({b,'^':true})).put({[adminID]: 'admin', [anyID]: 'ANY'})
            gun.get(makeSoul({b,'^':anyID,'|':true})).put(buildPermObj('group',false,{add: 'ANY'}))
            gun.get(makeSoul({b,'^':adminID,'|':true})).put(buildPermObj('group'))
            gun.get('GBase').put({[b]: true})
            let baseC = newBaseConfig({alias})
            gun.get(makeSoul({b,'%':true})).put(baseC)

            let newgb = Object.assign({},{[b]:baseC},{[b]:{props:{},relations:{},groups:{}}})
            const newNodeType = makenewNodeType(gun,newgb,timeLog)
            const newType = newNodeType(makeSoul({b}),'t')
            newType({alias: 'Users',humanID:'ALIAS'},false,[{alias:'Public Key',id:'PUBKEY'},{alias:'Alias',id:'ALIAS'}])
        }
        setTimeout(putRest,1000)
        return baseID
    }catch(e){
        console.log(e)
        return e
    }
}
const makenewNodeType = (gun, gb, timeLog) => (path,relationOrNode) => (configObj,cb,propConfigArr)=>{
    //relationOrNode = 't' || 'r'
    let {b} = parseSoul(path)
    let isNode = (relationOrNode === 't')
    let {id:tid} = configObj
    let toPut = {}
    let newGB = Object.assign({},gb)
    let err
    propConfigArr = propConfigArr || []
    propConfigArr.push({alias: 'STATE', propType:'state'})
    if(isNode)propConfigArr.push({alias:'LABELS',propType:'labels'})
    if(!isNode){
        propConfigArr.push({alias: 'SRC',propType: 'source'})
        propConfigArr.push({alias:'TRGT',propType: 'target'})
    }

    if(!tid){
        tid = newID(newGB,makeSoul({b,[relationOrNode]:true}))
    }else if(tid && /[^a-z0-9]/i.test(tid)){
        throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
    }else{
        //using user supplied id
        delete configObj.id
    }
    let tconfig = (isNode) ? newNodeTypeConfig(configObj) : newRelationshipConfig(configObj)
    let newPath = makeSoul({b,[relationOrNode]:tid})
    let tCsoul = configSoulFromChainPath(newPath)
    console.log(newPath,tCsoul)
    const config = makehandleConfigChange(gun,newGB)
    config(tconfig,newPath,{isNew:true, internalCB:function(obj){
        let {configPuts} = obj
        Object.assign(toPut,configPuts)
        let forGB = Object.assign({},configPuts[tCsoul],{props:{}})
        setValue(configPathFromChainPath(newPath),forGB,newGB)
        makeProp()
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
            id = newID(newGB,makeSoul({b,[relationOrNode]:tid,p:true}))
        }else if(id && /[^a-z0-9]/i.test(id)){
            throw new Error('Invalid ID supplied. Must be [a-zA-z0-9]')
        }else{
            //using user supplied id
            delete nextPconfig.id
        }
        let pconfig = newNodePropConfig(nextPconfig)
        let newPpath = makeSoul({b,[relationOrNode]:tid,p:id})
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
    let isNode = !r
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
const makenewNode = (gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex) => (path) => (data, cb)=>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t} = parseSoul(path)
        //if p then this is a childNode of the this path
        //API can be called from:
        /*
        gbase.base(b).nodeType(t).newNode() << where t is a root table, as-is api
        */
       let rid = newDataNodeID()
       data = data || {}
       let opts = {isNew:true}
       let newID = makeSoul({b,t,i:rid})
       putData(gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex,newID,data,opts,cb)
    }catch(e){
        cb.call(this, e)
        console.log(e)
    }
}
const makenewFrom = (gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex) => (path) => (data,cb,opt)=>{//TODO
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
        let pathObj = parseSoul(path)
        let {b,t,r,p} = pathObj
        let {own} = opt || {}
        let type = makeSoul({b,t,r})
        let [stateP] = hasPropType(gb,type,'state')
        if(p){
            let {dataType} = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb)
            delete pathObj.p
            delete pathObj['.']
            if((typeof editObj !== 'object' || (typeof editObj === 'object' && Array.isArray(editObj))) && dataType === 'unorderedSet')throw new Error('Must provide an object to edit an unorderedSet')
            else if(Array.isArray(editObj) && dataType !== 'array')throw new Error('Must provide a full array to edit an array value')
            else if(typeof editObj === 'object' && ['unorderedSet','array'].includes(dataType))throw new Error('Value must not be an object')

            editObj = {[p]:editObj}
            path = makeSoul(pathObj)
        }
        const checkForState = (value) =>{
            let e
            if(value === null){
                e = new Error('Node does not exist, must create a new one through ".newNode()" api.')
            }else if(value === 'deleted'){//check existence
                e = new Error('Node is deleted. Must create a new one through ".newNode()"')
            }else if(['active','archived'].includes(value)){
                putData(gun,gb,getCell,cascade,timeLog,timeIndex,relationIndex,path,editObj,{own},cb)
            }
            console.log(e)
            cb.call(cb,e) 
        }
        getCell(path,stateP,checkForState,true)
    }catch(e){
        console.log(e)
        cb.call(this, e)
    }
}

const makeretrieveQuery = (setupQuery) => (path) => (cb, queryArr) =>{
    try{//path = base/tval CAN ONLY QUERY TABLES
        queryArr = queryArr || []
        setupQuery(path,queryArr,cb)
    }catch(e){
        console.warn(e)
        return e
    }
}
const makesubscribeQuery = (setupQuery) => (path) => (cb, queryArr,subID) =>{
    try{
        queryArr = queryArr || []
        setupQuery(path,queryArr,cb,true,subID)
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
        let {variants,externalID,delimiter,labels} = opts
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
        let result = {}, IDs = {}, rid = 0
        let headers = dataArr[0]
        let {newPconfigs, aliasLookup} = handleImportColCreation(gb, b, t, headers, dataArr[1],variants, externalID, true)
        let temp = {}
        let externalIDidx = headers.indexOf(externalID)
        if(externalIDidx === -1 && variants)throw new Error('Cannot find the external IDs specified')
        let invalidData = {}

        for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
            const rowArr = dataArr[i];
            let curID
            if(variants){
                curID = rowArr[externalIDidx]
                assignID(eid)
            }else{
                curID = assignID(eid)
            }
            for (let j = 0; j < rowArr.length; j++) {
                let value = rowArr[j];
                if(!['',null,undefined].includes(value)){//ignore empty values
                    if(!temp[curID])temp[curID] = {}
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
        let typeChange = Object.keys(invalidData)
        for (const pval of typeChange) {
            newPconfigs[pval].dataType = 'string'
            newPconfigs[pval].propType = 'data' //probably already is, but could be 'date' and 'number'
        }
        const isVariant = /\$\{(.+)\}/
        for (const curID in temp) {
            const node = temp[curID];
            let rowsoul = curID
            if(variants){
                let i = IDs[curID]
                rowsoul = makeSoul({b,t,i})
            }
            for (const p in node) {
                let {dataType} = newPconfigs[p]
                const v = convertValueToType(node[p],dataType,eid,delimiter)//shouldn't error
                let [m,eid] = (dataType === 'string' && v.match(isVariant)) || []
                if(variants && eid){//add all values
                    setValue([rowsoul,p],makeEnq(IDs[eid],p),result)
                }else{
                    setValue([rowsoul,p],v,result)
                }
            }
        }
        Object.assign(gb,{[b]:{[t]:newPconfigs}}) //merge config directly so putData api's 'gb' is accurate
        putData()
        //console.log(newPconfigs,result)
        triggerConfigUpdate()//fire callback for app code to get new config data.
        function assignID(alias){
            let id = newDataNodeID(rid)
            IDs[alias] = id
            rid++
            return id
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
                putData(gun, gb, getCell, cascade, timeLog, timeIndex, relationIndex, nodeID, putObj, opts, cb)
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
        rtProps = rtProps || {}
        
        let {relations} = getValue(configPathFromChainPath(makeSoul({b})),gb)
        r = findID(relations,r)//r will be '-'id, will throw error if not found
        let rType = makeSoul({b,r})
        let [srcP] = hasPropType(gb,rType,'source')
        let [trgtP] = hasPropType(gb,rType,'target')
        let [stateP] = hasPropType(gb,rType,'state')
        Object.assign(rtProps,{[srcP]:path,[trgtP]:trgt,[stateP]:'active'})
        let hashStr = path+trgt
        let i = hash64(hashStr)//should never have two relation nodes (of same r id) with same src+trgt
        let newID = makeSoul({b,r,i})
        let opts = {isNew:true}
        let eSoul = makeSoul({b,r,i:true})//state index
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
    makearchive,
    makeunarchive,
    makedelete,
    makenullValue,
    makerelatesTo
}