"use strict";
let isNode
if(typeof window !== "undefined"){
    var Gun = window.Gun;
    isNode = false
}else{
    var Gun = global.Gun;
    isNode = true
}
if (!Gun)
throw new Error("gundb-gbase: Gun was not found globally!");
let Radisk
let Radix
let radata
const esc = String.fromCharCode(27)
if(typeof window === "undefined"){//if this is running on a server
    Radisk = (Gun.window && Gun.window.Radisk) || require('gun/lib/radisk');
    Radix = Radisk.Radix;
    const RFS = require('gun/lib/rfs')({file: 'radata'})
    radata = Radisk({store: RFS})
}
let gun
let gbase = {}
let gb = {}
let gsubs = {}
let pendingQueries = new Set()
let gunSubs = {}
let subBuffer = {}
let bufferState = false
let reactConfigCB
let gbChainState = true

//cache
const cache = {}
const upDeps = {}
const downDeps = {}


const {
    cachePathFromChainPath,
    configPathFromSoul,
    configPathFromChainPath,
    gbForUI,
    gbByAlias,
    setValue,
    setMergeValue,
    getValue,
    getPropType,
    getDataType,
    findLinkingCol,
    getRowPropFromCache,
    cachePathFromRowID,
    setRowPropCacheValue,
    findID,
    bufferPathFromSoul,
    getAllActiveProps,
    formatQueryResults,
    hasPropType,
    makeSoul,
    parseSoul,
    rand,
    NULL_HASH,
    ISO_DATE_PATTERN,
    ALL_INSTANCE_NODES,
    DATA_INSTANCE_NODE,
    RELATION_INSTANCE_NODE,
    DATA_PROP_SOUL,
    RELATION_PROP_SOUL,
    PROPERTY_PATTERN,
    ENQ,
    INSTANCE_OR_ADDRESS,
    isEnq,
    makeEnq,
    toAddress,
    lookupID,
    getAllActiveNodeTypes,
    getAllActiveRelations,
    collectPropIDs,
    intersect
} = require('./util.js')


const {makehandleConfigChange,
    basicFNvalidity
}= require('./configs')
let handleConfigChange

const {makenewBase,
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
    makerelatesTo,
    maketypeGet,
    makenodeGet,
    makeaddressGet
} = require('./chain_commands')
let newBase,newNodeType,addProp,newNode,config,edit,nullValue,relatesTo
let importData,importNewNodeType,archive,unarchive,deleteNode,newFrom
let subscribeQuery,retrieveQuery,setAdmin,newGroup,addUser,userAndGroup,chp
let typeGet, nodeGet, addressGet
const showgb = makeshowgb(gb)
const showcache = makeshowcache(cache)
const showgsub = makeshowgsub(gsubs)
const showgunsub = makeshowgunsub(gunSubs)

const {makesolve,
    findTruth,
    parseTruthStr,
    findFNArgs,
    regexVar,
    evaluateAllFN
} = require('../function_lib/function_utils');
const solve = makesolve(gb, getCell)


const {timeIndex,
    queryIndex,
    timeLog,
    getRelationNodes,
    getLabeledNodes
} = require('../chronicle/chronicle')
let qIndex,tIndex,tLog



const gunToGbase = (gunInstance,baseID) =>{
    gun = gunInstance
    startGunConfigSubs(baseID)
    //DI after gunInstance is received from outside
    tLog = timeLog(gun)
    tIndex = timeIndex(gun)
    qIndex = queryIndex(gun)




    newBase = makenewBase(gun,tLog)
    newNodeType = makenewNodeType(gun,gb,tLog)
    importNewNodeType = makeimportNewNodeType(gun,gb,tLog,tIndex,triggerConfigUpdate)
    addProp = makeaddProp(gun,gb,tLog)
    
    
    newNode = makenewNode(gun,gb,getCell,cascade,tLog,tIndex)   
    newFrom = makenewFrom(gun,gb,getCell,cascade,tLog,tIndex) 
    edit = makeedit(gun,gb,getCell,cascade,tLog,tIndex)
    relatesTo = makerelatesTo(gun,gb,getCell,tLog,tIndex)  
    archive = makearchive(gun,gb,getCell,tLog,tIndex)
    unarchive = makeunarchive(gun,gb,getCell,tLog,tIndex)
    deleteNode = makedelete(gun,gb,getCell,tLog,tIndex)
    nullValue = makenullValue(gun)


  

    importData = makeimportData(gun, gb)
    handleConfigChange = makehandleConfigChange(gun,gb,getCell,cascade,solve,tLog,tIndex)
    config = makeconfig(handleConfigChange)
    subscribeQuery = makesubscribeQuery(setupQuery)
    retrieveQuery = makeretrieveQuery(setupQuery)
    typeGet = maketypeGet(gb,setupQuery)
    nodeGet = makenodeGet(gb,setupQuery)
    addressGet = makeaddressGet(setupQuery)



    setAdmin = makesetAdmin(gun)
    newGroup = makenewGroup(gun)
    addUser = makeaddUser(gun)
    userAndGroup = makeuserAndGroup(gun)
    chp = makechp(gun)


    gbase.newBase = newBase
    gbase.node = node
    gbase.ti = tIndex
    gbase.tl = tLog
    gbase.qi = qIndex
    

    gbase = Object.assign(gbase,gbaseChainOpt())
    //random test command to fire after start
    // const testPut = ()=>{
    //     gunInstance.get('test').put({data:true})
        
    // }
    // let msg = {
    //     put: {
    //         test: {_:
    //                 {'#':'test','>':{data:Date.now()}},
    //               data: true
    //         }
    //     },
    //     '#':Gun.text.random(9)
    // }
    // let to = {}
    // to.next = (messg) => {
    //     gun._.on('in',messg)
    // }
    // addHeader(gun._,msg,to)

    // const testGet = () =>{
    //     gun.get('test').get(function(data,eve){
    //         eve.off()
    //         console.log('gun.get("test")`: ',data.put)
    //     })
    // }
    // if(typeof window === "undefined"){
    //     addHeader(gun._,msg,to)
    // }
    //testPut()
    //setTimeout(testGet,50000)


}
//GBASE INITIALIZATION
/*
---GUN SOULS---
see ./util soulSchema
*/
function startGunConfigSubs(baseID){
    if(gun){
        gun.get('GBase').on(function(gundata, id){
            let data = Gun.obj.copy(gundata)
            delete data['_']
            for (const key in data) {
                if (key === baseID) {
                    let baseconfig = makeSoul({b:key,'%':true})
                    gun.get(baseconfig).on(function(gundata, id){
                        gunSubs[baseconfig] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        data.props = {}
                        data.groups = {}
                        data.relations = {}
                        data.labels = {}
                        let configpath = configPathFromSoul(id)
                        setMergeValue(configpath,data,gb)
                        setupTypesSubs(baseID)
                        //setupPropSubs(key)
                        triggerConfigUpdate(id)
                    })

                    let baseGrps = makeSoul({b:key,g:true})
                    gun.get(baseGrps).on(function(gundata, id){
                        gunSubs[baseGrps] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let configpath = configPathFromSoul(id)
                        let flip = {}
                        console.log(configpath,data,flip)

                        for (const id in data) {
                            const alias = data[id];
                            flip[alias] = id
                        }
                        setMergeValue(configpath,flip,gb)
                    })
                    let baseLabels = makeSoul({b:key,l:true})
                    gun.get(baseLabels).on(function(gundata, id){
                        gunSubs[baseLabels] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        let configpath = configPathFromSoul(id)
                        let flip = {}
                        for (const id in data) {
                            const alias = data[id];
                            flip[alias] = id
                        }
                        setMergeValue(configpath,flip,gb)
                    })
                }
            }
        })    }
    else{
        setTimeout(startGunConfigSubs, 3000);
    }
}
function setupTypesSubs(baseID){
    let tlist = makeSoul({b:baseID})
    gun.get(tlist).on(function(gundata, id){//should have both relations and nodeTypes on this soul
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const tval in data) {//tval '#' + id
            const value = data[tval];
            if(value){
                let {t,r} = parseSoul(tval)
                handleGunSubConfig(makeSoul({b:baseID,t,r,'%':true}))//will sub if not already subed and merge in gb
                setupPropSubs(makeSoul({b:baseID,t,r}))
            }
        }
    })


}
function setupPropSubs(tpath){
    //tpath should be either !# or !-   
    let {b,t,r} = parseSoul(tpath) 
    gun.get(tpath).on(function(gundata, id){
        let data = Gun.obj.copy(gundata)
        delete data['_']
        for (const pval in data) { // pval = id
            const value = data[pval];
            if (value) {
                handleGunSubConfig(makeSoul({b,t,r,p:pval,'%':true}))//will sub if not already subed
            }
        }
    })
}
function handleGunSubConfig(subSoul){
    //will be type config or prop config 
    let configpath = configPathFromSoul(subSoul)
    let configLoaded = getValue(configpath,gb)
    if(!configLoaded || configLoaded.alias === undefined){//create subscription
        gun.get(subSoul, function(msg,eve){//check for existence only
            eve.off()
            if(msg.put === undefined){
                setMergeValue(configpath,{},gb)
            }
        })
        gun.get(subSoul).on(function(gundata, id){
            gunSubs[subSoul] = true
            let data = Gun.obj.copy(gundata)
            delete data['_']
            if(data.usedIn)data.usedIn = JSON.parse(data.usedIn)
            if(data.pickOptions)data.pickOptions = JSON.parse(data.pickOptions)
            setMergeValue(configpath,data,gb)
            triggerConfigUpdate(id)
        })
        
        
    }else{//do nothing, gun is already subscribed and cache is updating

    }
}

function triggerConfigUpdate(path){
    if(gbChainState){
        gbChainState = false
        setTimeout(updateConfig, 25)
    }
}
function updateConfig(){
    if(reactConfigCB){
        let configObj = {}
        configObj.byAlias = gbByAlias(gb)
        configObj.forUI = gbForUI(gb)
        configObj.byGB = gb
        reactConfigCB.call(this,configObj)
        gbChainState = true
        //console.log(configObj.forUI, configObj.byGB)
    }
}

//CHAIN CONSTRUCTORS
function base(base){
    //check base for name in gb to find ID, or base is already ID
    //return baseChainOpt
    let path = '!'
    if(gb[base] !== undefined){
        path += base
    }else{
        for (const baseID in gb) {
            const {alias} = gb[baseID];
            if(base === alias){
                path += baseID
                break
            }
        }
    }
    if(!path){
        throw new Error('Cannot find corresponding baseID for alias supplied')
    }
    let out = baseChainOpt(path)
    return out
}
function nodeType(label){
    //check base for name in gb to find ID, or base is already ID
    //return depending on table type, return correct tableChainOpt
    let {b} = parseSoul(this._path)
    let id,isRoot
    let tvals = gb[b].props
    let check = getValue([b,'props',label],gb)
    if(check !== undefined){
        id = label
    }else{
        for (const tval in tvals) {
            const {alias,parent} = tvals[tval];
            if(label === alias){
                id = tval
                isRoot = (parent === '') ? true : false
                break
            }
        }
    }
    if(!id){
        throw new Error('Cannot find corresponding ID for nodeType alias supplied')
    }
    let out
    let newPath = makeSoul({b,t:id})
    out = nodeTypeChainOpt(newPath, isRoot)
    return out
}
function relation(label){
    let base = this._path
    let id
    let rtvals = gb[base].props
    let check = getValue([base,'relations',label],gb)
    if(check !== undefined){
        id = label
    }else{
        for (const tval in rtvals) {
            const {alias} = rtvals[tval];
            if(label === alias){
                id = tval
                break
            }
        }
    }
    if(!id){
        throw new Error('Cannot find corresponding ID for relation alias supplied')
    }
    let out
    let newPath = [base,'-',id].join('')
    out = relationChainOpt(newPath)
    return out
}
function group(group){
    let base = this._path
    let check = getValue([base,'groups'],gb)
    if(check === undefined || !(check && check[group])){
        throw new Error('Cannot find group specified')
    }
    let out = groupChainOpt(base,group)
    return out
}
function prop(prop){
    //check base for name in gb to find ID, or base is already ID
    //return depending on table type, return correct columnChainOpt
    let path = this._path
    let pathO = parseSoul(path)
    let {b,t,r,i} = pathO
    let id
    let {props:pvals} = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb)
    let isNode = !r
    let ptype,dtype
    for (const pval in pvals) {
        const {alias, propType, dataType} = pvals[pval];
        if(prop === alias || prop === pval){
            ptype = propType
            dtype = dataType
            id = pval
            break
        }
    }
    if(!id){
        throw new Error('Cannot find corresponding ID for prop alias supplied')
    }
    let out
    let newPath = makeSoul(Object.assign(pathO,{p:id}))
    if(isNode && !i){
        out = propChainOpt(newPath, ptype, dtype)
    }else if(!i){
        out = relationPropChainOpt(newPath, ptype, dtype)
    }else{//called prop from gbase.node(ID).prop(name)
        out = nodeValueOpt(newPath)
    }
    return out
}
function node(nodeID){
    //can be with just id of or could be whole string (!#$ or !-$)
    //can someone edit !-$ directly? I don't think so, should use the correct relationship API since data is in 3 places (each node, and relationship node)
    let path = this._path
    let testPath = nodeID
    if(path){//only if coming from base.nodeType.node
        if(!INSTANCE_OR_ADDRESS.test(nodeID)){
            testPath = parseSoul(path)
            Object.assign(testPath,{i:testPath})
            testPath = makeSoul(testPath)
        } 
    }
    let {b,t,p} = parseSoul(testPath)

    if(DATA_INSTANCE_NODE.test(testPath)){
        return nodeChainOpt(testPath,true)
    }else if(RELATION_INSTANCE_NODE.test(testPath)){
        return nodeChainOpt(testPath,false)
    }else if(DATA_PROP_SOUL.test(testPath)){//is a nodeProp
        return nodeValueOpt(testPath)
    }else if(RELATION_PROP_SOUL.test(testPath)){//is a relationProp
        return nodeValueOpt(testPath)
    }else{
        throw new Error('Cannot decipher rowID given')
    }
}






//STATIC CHAIN OPTS
function gbaseChainOpt(){
    return {newBase, showgb, showcache, showgsub, showgunsub, solve, base, item: node}
}
function baseChainOpt(_path){
    return {_path, config: config(_path), subscribe: subscribeQuery(_path), retrieve: retrieveQuery(_path), newNodeType: newNodeType(_path,'t'), newRelationType: newNodeType(_path,'r'), importNewNodeType: importNewNodeType(_path), relation,nodeType,group,newGroup: newGroup(_path),setAdmin: setAdmin(_path),addUser: addUser(_path)}
}
function groupChainOpt(base, group){
    return {_path:base, add: userAndGroup(base,group,true), remove:userAndGroup(base,group,false), chp:chp(base,group)}
}
function nodeTypeChainOpt(_path){
    let out = {_path, config: config(_path), newNode: newNode(_path), addProp: addProp(_path), importData: importData(_path), subscribe:typeGet(_path,true),retrieve:typeGet(_path,false), prop,node}
    return out
}
function relationChainOpt(_path){
    return {_path, config: config(_path), addProp: addProp(_path), importData: importData(_path),subscribe:typeGet(_path,true),retrieve:typeGet(_path,false),prop}
}

function propChainOpt(_path, propType, dataType){
    let out = {_path, config: config(_path)}
    // if(['string','number'].includes(dataType) && propType === 'data'){
    //     out = Object.assign(out,{importChildData: importChildData(_path),propIsLookup:propIsLookup(_path)})
    // }
    return out
}
function relationPropChainOpt(_path){
    let out = {_path, config: config(_path)}
    return out
}
function nodeChainOpt(_path, isData){
    let out = {_path, edit: edit(_path,false,false), retrieve: nodeGet(_path,false), subscribe: nodeGet(_path,true),archive: archive(_path),unarchive:unarchive(_path),delete:deleteNode(_path)}
    if(isData){
        Object.assign(out,{relatesTo:relatesTo(_path),newFrom:newFrom(_path)})
    }
    return out
}
function nodeValueOpt(_path){
    let out = {_path, edit: edit(_path,false,false),subscribe: addressGet(_path,true),retrieve:addressGet(_path,false), clearValue:nullValue(_path)}
    return out
}


//CACHE
function formatData(format, pType,dType,val){
    //returns the formatted value
    if(format){
        if(pType === 'date'){
            //date formatting
            //format should be an object
        }else{
            //solve()? need a subsitute
            //might make a formatter solve so it is faster
        }
    }
    return val
}
function handleCacheDep(nodeID, p, val){
    const address = toAddress(nodeID,p)
    let inheritsNodeID = isEnq(val)
    if(!inheritsNodeID){//could have changed from Enq to val
        removeDep()
        return false
    }
    const looksAtAddress = inheritsNodeID
    
    if(!downDeps[address]){//add
        addDep()
        return true
    }
    if(downDeps[address] && downDeps[address] !== inheritsNodeID){//change if different
        removeDep()
        addDep()
        return true
    }
    return false
    function addDep(){
        downDeps[address] = looksAtAddress
        if(!upDeps[looksAtAddress])upDeps[looksAtAddress] = new Set()
        upDeps[looksAtAddress].add(address)
    }
    function removeDep(){
        let oldDep = downDeps[address]
        if(oldDep && upDeps[oldDep]) upDeps[oldDep].delete(address)
        if(oldDep) delete downDeps[address]
    }
}
function setupSub(soul, p){
    let sname = soul+'+'+p
    if(gunSubs[sname])return
    let {b,t,r} = parseSoul(soul)
    let {dataType} = getValue(configPathFromChainPath(makeSoul({b,t,r,p})),gb)

    gun.get(soul).get(p).on(function(value){
        let toCache = value
        if(dataType === 'unorderedSet'){//this will be a full object
            let data = JSON.parse(JSON.stringify(value))
            let links = []
            for (const key in data) {
                if(key === '_')continue
                const boolean = data[key];
                if (boolean) {//if current link
                    links.push(key) 
                }
            }
            toCache = links
        }else if(dataType = 'array'){
            try {
                toCache = JSON.parse(value)
                for (let i = 0; i < toCache.length; i++) {
                    const el = toCache[i];
                    if(ISO_DATE_PATTERN.test(el)){//JSON takes a date object to ISO string on conversion
                        toCache[i] = new Date(el)
                    }
                }
            } catch (error) {
                // leave as is...?
            }
        }
        if(toCache === undefined)toCache = null
        sendToCache(soul,p,toCache)//needs to handle object assigning/creation and prop deleting
    }) 
    gunSubs[sname] = true
}
function sendToCache(nodeID, p, value){
    let newEnq = handleCacheDep(nodeID,p,value)//will get deps correct so we can return proper data to buffer
    let address = toAddress(nodeID,p)
    let v = cache[address]//if it is inherited we want the value to go out to buffer
    let from = address
    while (isEnq(v)) {
        let lookup = isEnq(v)
        v = cache[lookup]  
        from = lookup
    }
    if(newEnq || (from === address && value !== v)){//this is some sort of new/changed value
        cache[address] = value//should fire the watch cb
        handlePropDataChange()
        return
    }
    function handlePropDataChange(){
        let {p} = parseSoul(address)
        let startAddress = (address === from) ? from : address
        let nodeID = removeP(startAddress)
        handleNewPropData(nodeID,p,v)
        checkDeps(startAddress)
        function checkDeps(changedAddress){
            let deps = upDeps[changedAddress]
            if(deps){
                for (const depAddr of deps) {
                    let nodeID = removeP(depAddr)
                    handleNewPropData(nodeID,p,v)
                    checkDeps(depAddr)//recur... until it can't
                }
            }
        }
        function removeP(address){
            let idObj = parseSoul(address)
            delete idObj.p
            delete idObj['.']
            return makeSoul(idObj)
        }
    }
}
function getCell(nodeID,p,cb,raw){
    //will return the inheritted value if not found on own node
    raw = !!raw //if it is true, we skip the formatting
    cb = (cb instanceof Function && cb) || function(){}
    let {b,t,r} = parseSoul(nodeID)
    let propPath = makeSoul({b,t,r,p})
    let {propType, dataType, format} = getValue(configPathFromChainPath(propPath),gb)
    let address = toAddress(nodeID,p)
    let cVal = cache[address]
    let from = address
    while (isEnq(cVal)) {
        let lookup = isEnq(cVal)
        cVal = cache[lookup]  
        from = lookup
    }
    if(cVal !== undefined){
        if(!raw)cVal = formatData(format,propType,dataType,cVal)
        cb.call(this,cVal, from)
        return
    }
    getData(nodeID,p)
    function getData(soul,pval){
        let {b,t,r} = parseSoul(soul)
        let {propType,dataType} = getValue(configPathFromChainPath(makeSoul({b,t,r,p:pval})),gb)
        gun.get(soul).get(pval, function(msg,eve){//check for existence only
            eve.off()
            let val = msg.put
            setupSub(soul,pval)
            if([null,undefined].includes(val)){
                //sendToCache(soul,pval,null)
                cb.call(this,null,soul)
                return
            }else if(isEnq(val)){//will keep getting inherited props until we get to data.
                let fromSoul = parseSoul(val.slice(1))
                let fromP = fromSoul.p
                delete fromSoul.p
                delete fromSoul['.']
                //sendToCache(soul,pval,val)//put the lookup in cache
                getData(fromSoul,fromP)
                return
            }
            //so we have data on this soul and this should be returned to the cb
            if(dataType === 'unorderedSet'){//this will be a full object
                let data = JSON.parse(JSON.stringify(val))
                let setVals = []
                for (const key in data) {
                    if(key === '_')continue
                    const boolean = data[key];
                    if (boolean) {//if currently part of the set
                        setVals.push(key) 
                    }
                }
                if(propType === 'labels')setVals.unshift(t)
                val = setVals
            }else if(dataType = 'array'){
                try {
                    val = JSON.parse(val)
                    for (let i = 0; i < val.length; i++) {
                        const el = val[i];
                        if(ISO_DATE_PATTERN.test(el)){//JSON takes a date object to ISO string on conversion
                            val[i] = new Date(el)
                        }
                    }
                } catch (error) {
                    // leave as is..
                }
            }
            //sendToCache(soul,pval,val)
            if(!raw)val = formatData(format,propType,dataType,val)
            cb.call(this,val, soul)
        })
    }
}


//CASCADE
//redo cascade and function to use similar method as query does to gather data and then fire call back for next thing

function cascade(rowID, pval, inc){//will only cascade if pval has a 'usedIn'
    try{
        inc = inc || 0
        console.log('cascading:', rowID, pval, inc)
        let [base,tval,i,li] = rowID.split('/')
        let maxTries = 5
        let colconfig = getValue([base,'props',tval,'props',pval], gb)
        if(li){
            colconfig = getValue([base,'props',tval,'li',pval], gb)
        }
        let usedIn = colconfig.usedIn
        let colType = colconfig.GBtype
        if(colconfig === undefined || ['prev','next','lookup'].includes(colType) || usedIn.length === 0){return false}
        if(inc === maxTries){
            let err = 'Could not load all dependencies for: '+ rowID
            throw new Error(err)
        }
        let linkCol
        let linkColInfo
        let usedInFN = {}
        let missingData = false
        let checkData = {}
        let toLi = false
        //get links
        for (let i = 0; i < usedIn.length; i++) {
            const path = usedIn[i];
            let [b,t,liOrP] = path.split('/')
            if(li && liOrP === 'p'){
                toLi = true
            }
            [linkCol,linkColInfo] = findLinkingCol(gb,rowID,path)
            if(linkCol === undefined){throw new Error('Cannot resolve "usedIn" reference')}
            if(linkColInfo.GBtype === 'function'){
                checkData[path] = getLinks(rowID,linkColInfo.fn)
                usedInFN[path] = {rows: [rowID], fn: linkColInfo.fn}
            }else{
                //getCell has changed!
                let links = getCell(rowID, linkCol)
                checkData[path] = links
                usedInFN[path] = {rows: links, fn: linkColInfo.fn}
            }
            if(checkData[path] === undefined){
                missingData = true
            }
        }
        if(missingData){//need getCell to resolve before moving on
            //console.log('first',inc,usedInFN)
            inc ++
            setTimeout(cascade,500,rowID,pval,inc)
            return
        }
        for (const upath in usedInFN) {
            const {rows, fn} = usedInFN[upath];
            for (let i = 0; i < rows.length; i++) {
                const rowid = rows[i];
                let check = getLinks(rowid,fn)
                if(check === undefined){
                    missingData = true
                }
            }
        }
        if(missingData){
            //console.log('second',inc,usedInFN)
            inc ++
            setTimeout(cascade,500,rowID,pval,inc)
            return
        }
        //if this far, all data is in cache for solve to work on first try
        for (const upath in usedInFN) {
            const {rows, fn} = usedInFN[upath];
            let [ubase,utval,upval] = upath.split('/')
            for (let i = 0; i < rows.length; i++) {
                const rowid = rows[i];
                let fnresult = solve(rowid,fn)
                console.log(rowID, ' >>> result for >>> ' + rowid +': ', fnresult)
                //use a stripped down version of the putData util
                //have cascade call itself, so once called it will... cascade until it can't
                
                //let call = edit(rowid,false,false,true)
                //call({[upval]: fnresult})//edit will call cascade if needed
            }
        }
    }catch(e){
        console.log(e)
    }
}



//EVENT HANDLING AND BUFFER
let attempts = 0
function flushSubBuffer(){
    if(pendingQueries.size && attempts<200){
        console.log('waiting to flush buffer, pending queries:', pendingQueries.size)
        setTimeout(flushSubBuffer,50)
        attempts ++
        return
    }
    attempts = 0
    let buffer = Object.assign({},subBuffer)
    subBuffer = {}
    bufferState = false
    console.log('flushing buffer', buffer)
    for (const base in gsubs) {
        let baseSubs = gsubs[base]
        for (const subID in baseSubs) {
            const {qParams,cb} = baseSubs[subID];
            query(base,qParams,cb,{isSub:true,sVal:subID,checkNodes:buffer})
        }
    }
}
function handleNewPropData(nodeID,pval){
    //parse gun soul and keys in data
    if(!subBuffer[nodeID])subBuffer[nodeID] = new Set()
    subBuffer[nodeID].add(pval)
    if(!bufferState){
        bufferState = true
        setTimeout(flushSubBuffer, 50)
    }
}



//QUERY
function setupQuery(path,queryArr,cb,isSub,sVal){
    if(!(cb instanceof Function))throw new Error('Must provide a callback!')
    if(!Array.isArray(queryArr) || !queryArr.length)throw new Error('Must provide arguments in the query Array')
    if(!queryArr.filter(x => x.CYPHER)[0])throw new Error('Must specify a single CYPHER pattern to complete the query!')
    if(!queryArr.filter(x => x.RETURN)[0] && !queryArr.filter(x => x.EXPAND)[0])throw new Error('Must specify a single RETURN or EXPAND statement in your query!')
    if(isSub && !sVal)throw new Error('Must give this subscriptions an ID so you can reference it again to cancel it')
    let qParameters = new QueryParse(path,queryArr)
    if(isSub){
        let {b} = parseSoul(path)
        let bpath = makeSoul({b})
        let {qParams} = getValue([bpath,sVal],gsubs) || {}
        if(qParams && qParams.originalQueryArr && qParams.originalQueryArr === JSON.stringify(queryArr)){
            qParameters = qParams
        }
    }
    query(path,qParameters,cb,{sVal,isSub})
}
function QueryParse(path,qArr){
    let {b} = parseSoul(path)
    this.elements= {}
    this.sortBy = false // || ['userVar',{alias,dir}, {alias,dir},...]
    this.limit = Infinity
    this.skip = 0
    this.idOnly = false
    this.aliasToID = {} //{!#:{[alias]:pval}}
    this.returning = []
    this.pathStrings = new Set()
    this.expand = false
    this.allNodes = {} //{nodeID: Set{pathString}} this is a reverse lookup for nodes that are passing, pathStrings are they contained in.
    this.originalQueryArr = JSON.stringify(qArr)
    Object.defineProperty(this.aliasToID,'aliasTypes',{
        value: function(alias,isNode){
            let a = Object.entries(this)
            let has = (isNode) ? '#' : '-'
            let b = a.filter(ar => ar[0].includes(has) && (ar[1][alias] !== undefined || Object.values(ar[1]).includes(alias))).map(arr => parseSoul(arr[0])[has])
            return b
        }
    })
    Object.defineProperty(this.aliasToID,'types',{
        value: function(aliasArr,isNode){
            let a = Object.entries(this)
            let sym = (isNode) ? '#' : '-'
            let valid = a.filter(ar => ar[0].includes(sym))
            let allTypes = new Set(valid.map(x => parseSoul(x[0])[sym]))
            for (const alias of aliasArr) {
                let has = new Set(this.aliasTypes(alias,isNode))
                allTypes = intersect(allTypes,has)
            }
            return [...allTypes]
            
        }
    })
    Object.defineProperty(this.aliasToID,'id',{
        value: function(node,alias){
            let {b,t,r} = parseSoul(node)
            let thingType = makeSoul({b,t,r})
            let id = getValue([thingType,alias],this) || Object.values(this[thingType]).includes(alias) && alias || undefined
            return id
            
        }
    })
    
    Object.defineProperty(this,'elementRank',{
        get(){
            let e = Object.entries(this.elements)
            return e.sort((a,b)=> b[1].score-a[1].score).map(el => el[0])
        },
        enumerable:true
    })
    Object.defineProperty(this,'leftMostThing',{
        get(){
            let userVar = Object.keys(this.elements)[0]//just take first one
            let leftMost = userVar
            let hasLeft = this.elements[userVar].leftThing
            while (hasLeft !== null) {
                hasLeft = this.elements[leftMost].leftThing
                if(hasLeft !== null)leftMost = hasLeft.userVar
            }
            return leftMost
        },
    })
    Object.defineProperty(this,'leftToRightReturnOrder',{
        get(){
            let order = []
            let curThingVar = this.leftMostThing
            let hasRight
            while (hasRight !== null) {
                let {toReturn} = this.elements[curThingVar]//just take first one
                if(toReturn)order.push(this.elements[curThingVar].userVar)
                hasRight = this.elements[curThingVar].rightThing
                curThingVar = hasRight && hasRight.userVar || false
            }
            return order
        },
        enumerable:true
    })
    Object.defineProperty(this,'orderIdxMap',{//so we know the order of elements in the path array
        get(){
            let order = []
            let curThingVar = this.leftMostThing
            let hasRight
            while (hasRight !== null) {
                order.push(this.elements[curThingVar].userVar)
                hasRight = this.elements[curThingVar].rightThing
                curThingVar = hasRight && hasRight.userVar || false
            }
            return order
        },
        enumerable:true
    })
    this.cleanMatch = ''//String of user MATCH with it cleaned, and id's swapped out (must maintain original userVar assignment (no randIDs))
    this.cleanQuery = [] //[{CYPHER:[cleanMatch]},...EXPAND?Clean?...FILTER,SEARCH,ID,RANGE,RETURN(all as-is)]
    

    let self = this
    let elements = this.elements
    
    parseCypher()
    parseReturn()
    parseExpand()
    parseFilters()
    findIDsAndTypes()
    makeCleanQ()
    scoreAll()
    function parseCypher(){
        let obj = qArr.filter(x => x.CYPHER)[0]
        if(!obj)throw new Error('Must specify a single Cypher pattern to complete the query!')
        let args = obj.CYPHER
        let {b} = parseSoul(path)
        const evaluate = {
            MATCH: function(str){
                //assign id's to each () [] or use user var
                //then parse thing by thing
                str = str.replace(/{[\s\S]*}/g,'')//remove any {prop: 'value'} filters
                console.log(str)
                str = str.replace(/(\(|\[)([a-zA-Z]+)?(:)?([a-zA-Z0-9:\`|\s]+)?/g, function(match, $1, $2, $3, $4) {//find gbID's for aliases of types,relations,labels
                    if(!$3)return match
                    let isNode = ($1 === '(')
                    let splitChar = (isNode) ? ':' : '|'
                    let aliases = [...$4.split(splitChar)]
                    let ids = []
                    let i = 0
                    let types = {t:{'#':true},r:{'-':true},l:{'&':true}}
                    for (let alias of aliases) {
                        alias = rmvBT(alias)//get rid of back ticks
                        let type
                        if(isNode && i === 0)type = types.t
                        else if(isNode)type = types.l
                        else type = types.r
                        let id = lookupID(gb,alias,makeSoul(Object.assign({},{b},type)))
                        if(id === undefined)throw new Error('Cannot parse alias for '+$4+' Alias: '+alias)
                        ids.push(id)
                        i++
                    }
                    let start = ($2) ? $1+$2+$3 : $1+$3
                    return start+ids.join(splitChar)
                });
                self.cleanMatch = 'MATCH '+str //what user passed in, but with no {} and ID's instead of alias'
                str = str.replace(/(<-|-)(\[[^\[\]]+\])?(->|-)/g,function(match,$1,$2,$3){// if ()--() make ()-[]-()
                    if(!$2)return $1+'[]'+$3
                    return match
                  })
                str = str.replace(/(?:\(|\[)([a-zA-Z]+)?/g, function(match, $1) {//assign id's to those that user didn't already do
                    if (!$1)return match+rand(8,'abcdefghijklmnopqrstuvwxyz')
                    return match
                });
                console.log(str)

                let m = [...str.matchAll(/(?:(\(|\[)([a-zA-Z]+)(?::)?([a-zA-Z0-9:\`|\s]+)?([*.0-9]+)?(\)|\])|(<-|->|-))/g)]
                //m[i] = ['(allParts)' || (-|->|<-), '('||'['|| undefined, id||undefined, labels||undefined, undefined||undefined||*length')'||']'|| undefined, undefined||(-|->|<-)]
                for (let i = 0; i < m.length; i+=2) {//every other element, create collector nodes first, then evaluate string
                    const leftID = m[i-2] && m[i-2][2] || null
                    const rightID = m[i-2] && m[i+2][2] || null
                    let [match,left,id,types] = m[i];
                    let isNode = (left === '(')
                    let idx = i/2

                    if(isNode){//(id:Type:Label)
                        let typesArr = [],labelArr = [],notLabels = []
                        if(types){
                            //could be labels only..
                            //or multiple types
                            let a = types.split(':')
                            for (const name of a) {
                                let type = findID(gb,name,makeSoul({b,'#':true}))
                                let label = findID(gb,name,makeSoul({b,'&':true}))
                                if(type !== undefined)typesArr.push(type)
                                else if(label !== undefined){
                                    if(label[0] === '!')notLabels.push(label.slice(1))
                                    else labelArr.push(label)
                                }
                            }
                        }
                        if(!typesArr.length)typesArr = getAllActiveNodeTypes(gb,path)//if none specified, can be any
                        elements[id] = new MatchNode(id,typesArr,labelArr,notLabels, leftID, rightID,idx)
                        
                    }else{//relation [id:Type|Type]
                        let typesArr
                        if(types){
                            let a = types.split('|')
                            typesArr = [a]
                        }else{//could be any 'type' node
                            typesArr = [getAllActiveRelations(gb,path)]//double array on purpose
                        }
                        elements[id] = new MatchRelation(id,typesArr, leftID, rightID,idx)
                    }
                }
                //if m.length === 1 simple nodeType query
                //if m.length > 1 then we need to parse more info
                let hasVarDepth
                if(m.length > 1){
                    for (let i = 2; i < m.length; i+=4) {//2,6,10,etc.. should be relations
                        let [match,left,id,types,length] = m[i];
                        let [lSign] = m[i-1]
                        let [rSign] = m[i+1]
                        let directed = (lSign !== rSign) // both '-'?
                        let thisRel = elements[id]
                        let leftNode = thisRel.leftThing
                        let rightNode = thisRel.rightThing
                        if(length){
                            if(i!==2)throw Error('Currently only supports variable length as the first relation: ()-[*n...n]-()-[]..etc. ')
                            let l = length.match(/\*([0-9]+)?(\.+)?([0-9]+)?/)
                            let [match,min,dots,max] = l
                            if(match && hasVarDepth)throw new Error('Cannot have multiple variable length paths in one query')
                            if(match)hasVarDepth = true
                            if((!min && !dots && !max) || (dots && !max))thisRel.pathLengthRange = Infinity
                            if(min && min !== 1)thisRel.pathLength = min
                            if(dots && max)thisRel.pathLengthRange = max - thisRel.pathLength
                        }
                        
                        if(!directed){
                            Object.defineProperties(thisRel,{
                                srcTypes:{
                                    get(){
                                        let allTypes = [...leftNode.types,...rightNode.types]
                                        return [...new Set(allTypes)]//remove duplicates
                                    },
                                    enumerable:true
                                },
                                trgtTypes:{
                                    get(){
                                        return thisRel.srcTypes
                                    },
                                    enumerable:true
                                },
                                leftIs:{
                                    value:'source',
                                    enumerable:true
                                },
                                rightIs:{
                                    value:'target',
                                    enumerable:true
                                }
                            })
                            
                            Object.defineProperties(leftNode,{
                                rightSigns:{
                                    value:['>','<'],
                                    enumerable:true
                                },
                                rightTypes:{
                                    get(){
                                        thisRel.types
                                    },
                                    enumerable:true
                                }
                            })
                            Object.defineProperties(rightNode,{
                                leftSigns:{
                                    value:['>','<'],
                                    enumerable:true
                                },
                                leftTypes:{
                                    get(){
                                        thisRel.types
                                    },
                                    enumerable:true
                                }
                            })                          

                        }else{
                            let src = (rSign.includes('>')) ? leftNode : rightNode //assume the other has it
                            let trgt = (rSign.includes('>')) ? rightNode : leftNode
                            Object.defineProperties(leftNode,{
                                rightSigns:{
                                    value:(rSign.includes('>')) ? ['>'] : ['<'],
                                    enumerable:true
                                },
                                rightTypes:{
                                    get(){
                                        thisRel.types
                                    },
                                    enumerable:true
                                }
                            })
                            Object.defineProperties(rightNode,{
                                leftSigns:{
                                    value:(rSign.includes('>')) ? ['<'] : ['>'],
                                    enumerable:true
                                },
                                leftTypes:{
                                    get(){
                                        thisRel.types
                                    },
                                    enumerable:true
                                }
                            })       
    
                            Object.defineProperties(thisRel,{
                                srcTypes:{
                                    get(){
                                        return src.types
                                    },
                                    enumerable:true
                                },
                                trgtTypes:{
                                    get(){
                                        return trgt.types
                                    },
                                    enumerable:true
                                },
                                leftIs:{
                                    value:(rSign.includes('>')) ? 'source' : 'target',
                                    enumerable:true
                                },
                                rightIs:{
                                    value:(rSign.includes('>')) ? 'target' : 'source',
                                    enumerable:true
                                }
                            })
                        }
                        
                    }
                }
                
    
                //on parse...
                //we need to get each 'thing' put in to it's object
                //if this is more than a simple (), then all 3 (or more..) things will effect each other.
                //need to figure out direction, *pathLength
                function mergeDefineProp(obj,prop){//for defining getter on the node
                    //a node can have two relations ()-[]->(here)<-[]-()
                    //getter needs to be accurate for `here` target. Could potentially be two different relations
                    //outgoing or incoming is [[],[]] inner arrays are OR outer array is AND
                    const define = {
                        configurable: true,
                        enumerable: true,
                        get(){
                            return thisRel.types
                        }
                    }
                    const altDefine = function(otherO){
                        return {
                            configurable: true,
                            enumerable: true,
                            get(){
                                return [...otherO.types,...thisRel.types]
                            }
                        }
                    }
                    let definition = define
                    if(obj.hasOwnProperty(prop)){
                        let leftO = obj.leftThing
                        definition = altDefine(leftO)
                    }
                    Object.defineProperty(obj,prop,definition)
                }
                function rmvBT(s){
                    return s.replace(/`([^`]*)`/g, function(match,$1){
                        if($1)return $1
                        return match
                    })
                }
            }
        }
        const validCypher = ['MATCH']
        for (let arg of args) {
            arg = arg.replace(/([^`]+)|(`[^`]+`)/g, function(match, $1, $2) {//remove whitespace not in backticks
                if($1)return $1.replace(/\s/g, '');
                return $2; 
            });
            let t
            arg = arg.replace(/([A-Z]+)/, function(match, $1) {//find and remove command ie: MATCH
                if ($1) {t = match;return ''}
            });
            if(!validCypher.includes(t))throw new Erro('Invalid Cypher command. Valid include: '+validCypher.join(', '))
            evaluate[t](arg)
        }
        
    
    }
    function parseReturn(){
        let obj = qArr.filter(x => x.RETURN)[0]
        let expand = qArr.filter(x => x.EXPAND)[0]
        let args = obj.RETURN
        if(!obj || (args.length < 2 && !expand))throw new Error('Must specify at least one element from "MATCH" to return')
        /* 
            args = //[{whole return Config},{userVar1:{configs}},...{userVarN:{configs}}]
            [
            {   //these are the options for the whole return
                sortBy: ['a',['pval1','DESC','pval2','ASC']],
                limit: 50,
                skip: 0,
                idOnly: boolean
            },
            {a:{//<<userVar, Options for returning this particular nodeThing
                returnAsArray: false,
                props: [],//can be [alias1, alias2] or options [{alias1:{as:'Different Name',raw:true}}]
                propsByID:false,//only for returnAs {}, false={'Prop Alias': propValue}, true={pval: propValue} >> also applies for include
                noID: false,//on returnAs object> object.ID = NodeID
                noAdress: false,//object.address = {}||[] if returnAs = {} then>propsByID=false={'Prop Alias': address}||true={pval: address}
                raw: false,//override setting, set for all props (helpful if props not specified(allActive) but want them as raw)
                rawLinks:false//for linked columns, it will attempt to replace with the HumanID
                idOnly: false //for list building.
                }
            }]
        */
        //parse first arg, that should be easy
        let [mainArgs,...thingsArgs] = args
        

        for (const tArg of thingsArgs) {
            let userVar = Object.keys(tArg)[0]
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            self.returning.push(userVar)
            elements[userVar].toReturn = true
            let args = tArg[userVar]
            for (const arg in args) {
                if(!['returnAsArray','props','propsByID','noID','noAddress','raw'].includes(arg))continue
                const value = args[arg];
                if(arg === 'props'){
                    if(!Array.isArray(value))throw new Error('"props" must be an array of values')
                    parseProps(userVar,value)
                }else elements[userVar][arg] = !!value
            }
        }
        for (const key in mainArgs) {
            const arg = mainArgs[key];
            if(key === 'sortBy')parseSort(arg)
            else if(key === 'groupBy')parseGroup(arg)
            else if(key === 'limit')parseLimit(arg)
            else if(key === 'skip')parseSkip(arg)
            else if(key === 'idOnly')self.idOnly = !!arg
        }
        //parse each thing arg.
        //  convert props to objects. If thing already has a types.length === 1 then we can get propID as well. store as !#. ,since could have multiple types
        


        //can we allow multiple node types? yes, otherwise MATCH isn't useful
        //how do we describe the format, array of objects would be required if multitype
        function parseLimit(userArg){//done
            if(isNaN(userArg))throw new Error('Limit argument must be a number. {limit: Number()}')
            self.limit = userArg*1
        }
        function parseSkip(userArg){//done
            if(isNaN(userArg))throw new Error('Limit argument must be a number. {LIMIT:[Number()]}')
            self.skip = userArg*1
        }
        function parseSort(userArg){//done
            //obj = {SORT: [pval, asc || dsc]}
            let [userVar, ...args] = userArg
            //can't replace pval unless we know the userVar.types.length===1
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            if(!elements[userVar].toReturn)throw new Error('Variable referenced must be part of the return')
            self.sortBy = []
            self.sortBy.push(userVar)
            for (let i = 0; i < args.length; i+=2) {
                const alias = args[i];
                if(alias === undefined)throw new Error('Must specify a property to sortBy')
                let dir = args[i+1]
                if(!dir)dir = 'DESC'
                if(!['ASC','DESC'].includes(dir))throw new Error('Direction must be either "ASC" or "DESC".')
                self.sortBy.push({alias,dir})
            }
            //store as self.sortBy = [userVar,{alias: userArg, ids:[],dir:ASC},{alias: userArg, ids:[], dir:DESC}]
            
        }
        function parseGroup(userArg){//done
            //userArg should be [userVar, pval]
            let [userVar,...args] = userArg
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            self.groupBy = []
            self.groupBy.push(userVar)
            for (const alias of args) {
                if(alias === undefined)throw new Error('Must specify a single property to groupBy')
                self.groupBy.push({alias})
            }
        }
        function parseProps(userVar,userArg){
            //can be [alias1, alias2] or options [{alias1:{as:'Different Name',raw:true}}]
            for (const arg of userArg) {
                if(typeof arg === 'string'){
                    elements[userVar].props.push({alias:arg})
                }else if(typeof arg === 'object'){
                    let {alias,as,raw} = arg
                    elements[userVar].props.push({alias,as,raw})
                }
            }
        }
        
    }
    function parseExpand(){
        //[{EXPAND:[userVarFromMatch, {returnAs}, {expand configs}]}]
        //returnAs {"nodes","relationships","paths" : true} 
        //userVarFromMatch = isNode
        //configs{minLevel,maxLevel,uniqueness,limit,beginSequenceAtStart,labelFilter,relationshipFilter,sequence,whiteListNodes,blackListNodes,endNodes,terminationNodes}
        let obj = qArr.filter(x => x.EXPAND)[0]
        let retur = qArr.filter(x => x.RETURN)[0]
        if(!obj && !retur)throw new Error('Must specify a single RETURN/EXPAND statement in your query!')
        if(!obj)return
        if(obj && retur)throw new Error('Can only specify a single RETURN/EXPAND statement in your query!')
        let args = obj.EXPAND
        if(args.length < 2)throw new Error('Must specify at least one element from "MATCH", and what to return from EXPAND (1 or more: "nodes","relationships","paths"')
        let [userVar,{nodes,relationships,paths},configs] = args
        if(!elements[userVar] || (elements[userVar] && !elements[userVar].isNode))throw new Error('Variable referenced was not declared in the MATCH statement or is not a node')
        if(!nodes && !relationships && !paths)throw new Error('Must specify at least one or more things to return from the expand statement')

        let validArgs = ['minLevel','maxLevel','uniqueness','limit','beginSequenceAtStart',
            'filterStartNode','whitelistNodes','blacklistNodes','endNodes','terminatorNodes','labelFilter','relationshipFilter','sequence']
        let validSkip = ['labelFilter','relationshipFilter','sequence']
        for (const arg in configs) {
            if(!validArgs.includes(arg) || validSkip.includes(arg))continue
            const value = configs[arg];
            if(['whitelistNodes','blacklistNodes','endNodes','terminatorNodes'].includes(arg)){
                if(!Array.isArray(value))throw new Error('If specifiying a list of Nodes, it must be an array.')
                for (const id of value) {
                    if(!DATA_INSTANCE_NODE.test(id))throw new Error('Invalid ID specified in list')
                }
            }else if(['minLevel','maxLevel','limit'].includes(arg)){
                if(isNaN(value))throw new Error('Argument must be a number for: minLevel, maxLevel, limit')
            }else if(arg === 'uniqueness'){
                const valid = ['NODE_GLOBAL','RELATIONSHIP_GLOBAL','NONE']
                if(!valid.includes(value))throw new Error('Only valid uniqueness checks are: '+valid.join(', '))
            }else{//rest are boolean
                value = !!value
            }
            elements[userVar][arg] = value
        }

        let {labelFilter,relationshipFilter,sequence} = configs
        if(sequence){
            if(!Array.isArray(sequence) || !sequence.length)throw new Error('Sequence must be an array with one or more filter arguments')
            let convert = []
            if(!beginSequenceAtStart)elements[userVar].firstRelations = parseRelationFilter(sequence[0])
            sequence = sequence.slice(1)
            for (let i = 0; i < sequence.length; i++) {
                const seqArg = sequence[i];
                if(i%2){//odds
                    convert.push(parseRelationFilter(seqArg))                    
                }else{
                    convert.push(parseLabelFilter(seqArg))
                } 
            }
            elements[userVar].sequence = convert
        }else if(labelFilter){
            if(!Array.isArray(labelFilter) || !labelFilter.length)throw new Error('labelFilter must be an array with one or more filter arguments')
            //labelFilter must be an array ['someLabel|andOtherLabel','sequenceLabel']
            if(labelFilter.length > 1){
                sequence = []
                for (const seqArg of labelFilter) {
                    sequence.push(parseLabelFilter(seqArg))
                    sequence.push(parseRelationFilter('*'))// * means any/all relations/dirs
                }
                elements[userVar].sequence = sequence
            }else{
                elements[userVar].labelFilter = parseLabelFilter(labelFilter[0])
            }  
        }else if(relationshipFilter){
            if(!Array.isArray(relationshipFilter) || !relationshipFilter.length)throw new Error('relationshipFilter must be an array with one or more filter arguments')
            if(relationshipFilter.length > 1){
                if(!beginSequenceAtStart){
                    firstRelations = parseRelationFilter(relationshipFilter[0])
                    relationshipFilter = relationshipFilter.slice(1)
                }
                sequence = ['*']
                //parse/add to sequence
                for (const seqArg of relationshipFilter) {
                    sequence.push(parseRelationFilter(seqArg))
                    sequence.push('*')// * means any/all nodes
                }
            }else{
                relationshipFilter = parseRelationFilter(relationshipFilter[0])
            }
        }
        self.expand = true

        function parseLabelFilter(arg){
            let orLabels = arg.split('|')
            let labels = [],not = [],term = [],end = []
            for (const label of orLabels) {
                //any can be compound label1:label2
                //any of the elements can have one of +-/> leading
                let [firstChar,andLabels] = splitAndType(label)
                andLabels = andLabels.map(x => lookupID(gb,x,path))
                if(firstChar === '>')end.push(andLabels)
                else if(firstChar === '/')term.push(andLabels)
                else if(firstChar === '-')not.push(andLabels)
                else labels.push(andLabels)
            }
            return {labels,not,term,end}
            function splitAndType(orLabel){
                let f = orLabel[0]
                if('+/>-'.includes(f))orLabel = orLabel.slice(1)
                let ands = orLabel.split(':')
                return [f,ands]
            }

        }
        function parseRelationFilter(arg){
            let bsoul = makeSoul({b})
            let orLabels = arg.split('|')
            let args = dirAndType(orLabels)
            return args
            function dirAndType(orLabels){
                let out = {}
                for (const orLabel of orLabels) {
                    let f = orLabel[0]
                    let l = orLabel[orLabel.length-1]
                    let dirs = []
                    if(f === '<'){orLabel = orLabel.slice(1);dirs.push(f)}
                    else if(l === '>'){orLabel = orLabel.slice(0,-1);dirs.push(l)}
                    else dirs = ['<','>']
                    if(orLabel && orLabel !== '*'){
                        out[lookupID(gb,orLabel,bsoul)] = dirs
                    }else{
                        let allTypes = getAllActiveRelations(gb,path)
                        let toRet = []
                        for (const rType of allTypes) {
                            let strType
                            if(dirs.length === 1){
                                if(dirs[0] === '<')strType = '<'+rType
                                else strType = rType+'>'
                            }else{
                                strType = rType
                            }
                            toRet.push(strType)
                        }
                        Object.assign(out, dirAndType(toRet))
                    }
                }
                
                return out
            }
        }
    
    }
    function parseFilters(){
        let parse = ['FILTER','RANGE']
        for (const qArgObj of qArr) {
            let key = Object.keys(qArgObj)[0]
            if(!parse.includes(key))continue
            if(!Array.isArray(qArgObj[key]))throw new Error('Query arguments must be in an array: [{ARG:[parameters]}]')
            if(key==='FILTER')parseFilter(qArgObj)
            else if(key==='RANGE')parseRange(qArgObj)
        }

        function parseFilter(obj){//
            //obj = {FILTER: [userVar,'FN string']}
            //fnString = 'ID(!#$)' || '{prop} > 3' || 'AND({prop1} > 3,{prop2} < 5) if prop has spaces or symbols, must be in `prop with space!!@#$`
            let validFilterFN = ['ABS','SQRT','MOD','CEILING','FLOOR','ROUND','INT','COUNT','NOT','T','AND', 'OR','TRUE','FALSE','TEST']
            let [userVar,fnString] = obj.FILTER
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            let fnSearch = /([A-Z]+)\(/g //get fn names
            let IDpattern = /ID\((.*)\)/
            let noBT = fnString.replace(/`.*`/g,0)//backticks might match pattern accidentally
            let fn
            let idMatch = noBT.match(IDpattern) || []
            if(idMatch.length){
                console.log(idMatch[1])
                console.log(idMatch[1].matchAll(/![a-z0-9]+(?:#|-)[a-z0-9]+\$[a-z0-9_]+/gi))
                elements[userVar].ID = [...idMatch[1].matchAll(/![a-z0-9]+(?:#|-)[a-z0-9]+\$[a-z0-9_]+/gi)].map(x => x[0])
                return
            }
            let i = 0
            while (fn = fnSearch.exec(noBT)) {
                let [m,a] = fn
                if(i === 0 && a === 'AND')elements[userVar].filterArgs = findFNArgs(noBT).length
                else if(!elements[userVar].filterArgs)elements[userVar].filterArgs = 1
                if(!validFilterFN.includes(a))throw new Error('Invalid FN used inside of "FILTER". Valid FNs :' + validFilterFN.join(', '))
            }
            basicFNvalidity(fnString)//  ??
            elements[userVar].filter = fnString
        }
        function parseRange(obj){
            //obj = {RANGE: [userVar,{index,from,to,items,relativeTime,timePointToDate,lastTimeUnit,firstDayOfWeek}]}
            //Needs to end up with a from, to
            //from and to must be date obj or unix time
            if(!obj.RANGE)return false
            let [userVar,ranges] = obj.RANGE
            //ranges is an object with keys of index's (props || _CREATED) and value of object with params
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            for (const index in ranges) {
                const params = ranges[index];
                elements[userVar].ranges[index] = calcToFrom(params)
            }
            function calcToFrom(args){
                let {from,to,relativeTime,timePointToDate,lastTimeUnit,firstDayOfWeek} = args
                let out = {}
                if((from || to) && (timePointToDate || lastTimeUnit || relativeTime))throw new Error('Too many arguments in RANGE. use "from" & "to" OR "toDate" OR "last" OR "relavtiveTime"')
                if(firstDayOfWeek){
                    if(isNaN(firstDayOfWeek)){
                        throw new Error('Invalid first day of week. Must be a number between 0-6. Sunday = 0')
                    }
                }else{
                    firstDayOfWeek = 0
                }
                if(timePointToDate && !lastTimeUnit){
                    let valid = ['year','month','week','day']
                    if(!valid.includes(timePointToDate.toLowerCase()))throw new Error('toDate preset only accepts: '+ valid.join(', '))
                    let now = new Date()
                    let year = now.getFullYear()
                    let month = now.getMonth()
                    let dayOfMonth = now.getDate()
                    let dayOfWeek = now.getDay()
                    switch (timePointToDate.toLowerCase()) {
                        case 'year':
                            from = new Date(year,0)
                            break;
                        case 'month':
                            from = new Date(year,month)
                            break;
                        case 'week':  
                            let nd = dayOfWeek
                            let fd = firstDayOfWeek
                            let diff = 0
                            if(nd-fd > 0){
                                diff = nd-fd
                            }else if(nd-fd < 0){
                                diff = nd-fd + 7
                            }                
                            dayOfMonth += diff*-1
                            from = new Date(year,month,dayOfMonth)
                            break;
                        case 'day':
                            from = new Date(year,month,dayOfMonth)
                            break;
                        default:
                            break;
                    }
                }else if(!timePointToDate && lastTimeUnit){
                    let valid = ['year','quarter','month','week','day','hour']
                    if(!valid.includes(lastTimeUnit.toLowerCase()))throw new Error('"last" preset only accepts: '+ valid.join(', '))
                    let now = new Date()
                    let year = now.getFullYear()
                    let month = now.getMonth()
                    let dayOfMonth = now.getDate()
                    let dayOfWeek = now.getDay()
                    let hour = now.getHours()
    
                    switch (lastTimeUnit.toLowerCase()) {
                        case 'year':
                            from = new Date(year-1,0)
                            to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                            break;
                        case 'quarter':
                            let current = (month + 1)/3
                            if(current <=1){//q1
                                from = new Date(year-1,9)
                                to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                            }else if(current <= 2){
                                from = new Date(year,0)//jan 1
                                to = new Date(year,3,1,0,0,0,-1)//last ms in march
                            }else if(current <=3){
                                from = new Date(year,3)//april 1
                                to = new Date(year,5,1,0,0,0,-1)//last ms in june
                            }else{
                                from = new Date(year,3)//July 1
                                to = new Date(year,9,1,0,0,0,-1)//last ms in sept
                            }
                            break;
                        case 'month':
                            from = new Date(year,month-1)
                            to = new Date(year,month,1,0,0,0,-1)//last ms in last month
                            break;
                        case 'week':  
                            let nd = dayOfWeek
                            let fd = firstDayOfWeek
                            let diff = 0
                            if(nd-fd > 0){
                                diff = nd-fd
                            }else if(nd-fd < 0){
                                diff = nd-fd + 7
                            }                
                            dayOfMonth += diff*-1
                            from = new Date(year,month,dayOfMonth-7)
                            to = new Date(year,month,dayOfMonth,0,0,0,-1)//last ms in yesterday
                            break;
                        case 'day':
                            from = new Date(year,month,dayOfMonth-1)
                            to = new Date(year,month,dayOfMonth,0,0,0,-1)//last ms in yesterday
                            break;
                        case 'hour':
                            from = new Date(year,month,dayOfMonth,hour-1)
                            to = new Date(year,month,dayOfMonth,hour,0,0,-1)//last ms in last hour
                            break;
                        default:
                            break;
                    }
                }
                if(relativeTime){
                    //Number() + ...
                    //y = year (relative date, from: -365days to: Infinity)
                    //w = week (-Number() * 7days)
                    //d = day (-Number() of days)
                    //h = hours (-Number() of hours)
                    //m = minutes
                    let valid = 'ywdhm'
                    let num = relativeTime.slice(0,relativeTime.length-1)*1
                    let unit = relativeTime[relativeTime.length-1]
                    if(isNaN(num))throw new Error('If you are specifiying a relative time it should be some number with a single letter specifying units')
                    if(!valid.includes(unit.toLowerCase()))throw new Error('Invalid unit. Must be one of: y, m, w, d, h. (year, month, week, day, hour)')
                    let now = new Date()
                    let year = now.getFullYear()
                    let dayOfMonth = now.getDate()
                    let curHour = now.getHours()
                    let minute = now.getMinutes()
                    let fromDate = new Date()
                    to = Infinity
                    switch (unit) {
                        case 'y':
                            from = fromDate.setFullYear(year-num)
                            break;
                        case 'w':
                            from = fromDate.setDate(dayOfMonth-(7*num))
                            break;
                        case 'd':
                            from = fromDate.setDate(dayOfMonth-num)
                            break;
                        case 'h':
                            from = fromDate.setHours(curHour-num)
                            break;
                        case 'm':
                            from = fromDate.setMinutes(minute-num)
                            break;
                        default:
                            break;
                    }
            
                }
                if(from && from instanceof Date){
                    out.from = from.getTime()
                }else if(from && !(from instanceof Date)){
                    let d = new Date(from) //if it is unix or anything valid, attempt to make a date
                    if(d.toString() !== 'Invalid Date'){
                        out.from = d.getTime()
                    }else{
                        throw new Error('Cannot parse "from" argument in RANGE')
                    }
                }else{
                    out.from = -Infinity
                }
                if(to && to instanceof Date){
                    out.to = to.getTime()
                }else if(to && !(to instanceof Date)){
                    let d = new Date(to) //if it is unix or anything valid, attempt to make a date
                    if(d.toString() !== 'Invalid Date'){
                        out.to = d.getTime()
                    }else{
                        throw new Error('Cannot parse "from" argument in RANGE')
                    }
                }else{
                    out.to = Infinity
                }
                if(out.from === -Infinity && out.to === Infinity)throw new Error('Must specifiy at least one limit in a time range')
    
                return out
            }
        }
        
    }
    function findIDsAndTypes(){
        //collect all pvals reffed for the this particular thing
        //  sort,group,filter,ranges
        //for each alias, go find all potential types that have that.
        //  index results on self.aliasToID = {!#:{[alias]:pval}}
        //if all potential list is longer than user-specified, ignore the potential list
        //  else if the potential is shorter, update the things.types array with the potentials

        for (const userVar in elements) {
            const {isNode,filter,ranges,props} = elements[userVar];
            let propRef = /\{(?:`([^`]+)`|([a-z0-9]+))\}/gi
            let allNames = {}
            if(filter){
                let names = [...filter.matchAll(propRef)]
                for (const [m,a,b] of names) {
                    let name = (a !== undefined) ? a : b
                    allNames[name] = true
                    elements[userVar].filterProps.push(name)

                    let v = collectPropIDs(gb,path,name,isNode)
                    for (const key in v) {
                        const vals = v[key];
                        if(!self.aliasToID[key])self.aliasToID[key] = vals
                        else Object.assign(self.aliasToID[key],vals)
                    }
                }
            }
            for (const name in ranges) {
                if(name === '_CREATED')continue //??
                allNames[name] = true
                let v = collectPropIDs(gb,path,name,isNode)
                for (const key in v) {
                    const vals = v[key];
                    if(!self.aliasToID[key])self.aliasToID[key] = vals
                    else Object.assign(self.aliasToID[key],vals)
                }
            }
            for (const {alias:name} of props) {
                allNames[name] = true
                
                let v = collectPropIDs(gb,path,name,isNode)
                for (const key in v) {
                    const vals = v[key];
                    if(!self.aliasToID[key])self.aliasToID[key] = vals
                    else Object.assign(self.aliasToID[key],vals)
                }
                
            }
            if(self.sortBy && self.sortBy[0] === userVar){//has a sort output
                let arr = self.sortBy.slice(1)
                for (const {alias:name} of arr) {
                    allNames[name] = true
                    
                    let v = collectPropIDs(gb,path,name,isNode)
                    for (const key in v) {
                        const vals = v[key];
                        if(!self.aliasToID[key])self.aliasToID[key] = vals
                        else Object.assign(self.aliasToID[key],vals)
                    }
                }
            }
            console.log(elements[userVar].types,self.aliasToID.types(Object.keys(allNames),isNode))
            elements[userVar].types = [...intersect(new Set(elements[userVar].types),new Set(self.aliasToID.types(Object.keys(allNames),isNode)))]
            //^^Intersect what is existing, with what is valid
        }




        //all rules below are for those nodes that don't already have a thing.types.length ===1

        //if it is being sorted,grouped or there are a subset or props being returned back, then all nodeTypes must have those alias's
        //if it has a filter/range then match all types that have those alias's
        //replace out all references.
    }
    function makeCleanQ(){
        let noCypher = qArr.filter(x => !x.CYPHER)
        let c = {CYPHER:[self.cleanMatch]}
        noCypher.push(c)
        self.cleanQuery = noCypher
    }
    function scoreAll(){
        //time ranges are worth ((1000*60*60*24)*100)/(to-from) <<<Basically 100 points for the range being only a single day.
        //^^^if to=Infinity => to = new Date(99999).getTime() if from=-Infinity => from = new Date(-99999).getTime()

        //ID is worth Infinity points (basically always start with that)

        //Labels are labels.length * 20

        //Type = 20/thing.types.length

        //filters = filterArgs*20 >> if the top fn is AND, then we multiply the args since it is more specific.

        //relation specific: 40/(leftThing.types.length + rightThing.types.length)

        //thing has a total score, then it must have an internal 'start' index > 'range','types','labels','id'


        //pick highest range score + filter score + ID + label + type

        for (const thing in elements) {
            const obj = elements[thing];
            obj.scoreCalc()
        }
    }
    
    
    
    function MatchNode(userVar,types,labelArr,notLabels,lid,rid,mIdx){
        this.userVar = userVar
        this.isNode = true
        this.types = types || []
        this.labels = labelArr || []
        this.not = notLabels || []
        this.score = 0
        this.bestIndex = ''
        this.toReturn = false
        this.localDone = false
        this.matchIndex = mIdx
        this.nodeUsedInPaths = {} //{nodeID: Set{JSON.stringify(fullPath)}}

        //expand
        this.minLevel = 1
        this.maxLevel = 1
        this.uniqueness = "NODE_GLOBAL"
        this.limit = Infinity
        this.beginSequenceAtStart = true
        this.filterStartNode = false
        this.labelFilter = false
        this.relationshipFilter = false
        this.sequence = false
        this.expand = false
        this.firstRelations = []
        this.whiteListNodes = []
        this.blackListNodes = []
        this.terminationNodes = []
        this.endNodes = []

        
        //traversal
        this.toCheck = new Set()
        this.traversed = new Set()
        this.passing = {}//things that passed locally (filters,ranges. Nothing todo with connected nodes)
        this.failing = {}
        this.activeExpandNodes = new Set()

        //filters
        this.filter = '' //fnString
        this.filterProps = [] //contains alias' from the filter fnString
        this.filterArgs = 0 //use for scoring
        this.ranges = [] //[{alias,to,from,score},..etc] //score ranges as they are entry points as well.
        this.ID = []


        //return config, only used if output = true
        this.returnAsArray = false // {} || []
        this.props = [] //[{alias,as:'Different Name',raw:true}]{alias}]//
        this.propsByID = false//only for returnAs {}, false={'Prop Alias': propValue}, true={pval: propValue} >> also applies for include
        this.noID = false//on returnAs object> object.ID = NodeID
        this.noAddress = false//object.address = {}||[] if returnAs = {} then>propsByID=false={'Prop Alias': address}||true={pval: address}
        this.raw = false//override setting, set for all props (helpful if props not specified(allActive) but want them as raw)
        this.rawLabels = false//for label prop, it will replace with the alias

        Object.defineProperties(this, {
            leftThing: {
                get(){
                    return self[lid] || null
                }
            },
            rightThing: {
                get(){
                    return self[rid] || null
                }
            },
            leftScore: {
                get(){
                    let l = this.leftThing
                    let score = 0
                    while (l !== null) {
                        score += l.score
                        l = l.leftThing
                    }
                    return score
                },
                enumerable:true
            },
            rightScore: {
                get(){
                    let r = this.rightThing
                    let score = 0
                    while (r !== null) {
                        score += r.score
                        r = r.rightThing
                    }
                    return score
                },
                enumerable:true
            },
            scoreCalc: {
                value: function(){
                    let id=0,filter,range=0,types,labels
                    if(this.ID.length)id=Infinity
                    filter = this.filterArgs*20
                    types = Math.round(20/this.types.length)
                    types = (types === Infinity) ? 0 : types
                    labels = this.labels.length*20
                    for (const idx of this.ranges) {
                        let {from,to} = idx;
                        if(from === -Infinity)from = new Date(-99999,0).getTime()
                        if(to === Infinity)to = new Date(99999,0).getTime()
                        let s = Math.round(((1000*60*60*24)*100)/(to-from))
                        idx.score = s
                        if(s>range)range = s
                    }
                    this.ranges.sort((a,b)=>b.score-a.score)
                    this.bestIndex = [[id,'id'],[range,'range'],[types,'types'],[labels,'labels']].sort((a,b)=>b[0]-a[0])[0][1]
                    let total = id+filter+range+types+labels
                    this.score = total
                    return total
                }
            },
            validRelations:{
                value: function(leftOrRight){
                    //returns [rIDarr,signsArr] || false
                    let signs,types//if it is either, then it doesn't matter
                    if(leftOrRight === 'left'){
                        if(this.leftTypes===undefined)return false
                        types = this.leftTypes
                        signs = this.leftSigns
                        
                    }else{
                        if(this.rightTypes===null)return false
                        types = this.rightTypes
                        signs = this.rightSigns
                    }
                    
                    return [types,signs]
                }
            }
        });

    }
    function MatchRelation(userVar,types,lid,rid,mIdx){
        this.userVar = userVar
        this.isNode = false
        this.types = types || []
        this.pathLength = 1 //lower limit on the range
        this.pathLengthRange = 0 //pathLength + this number for upper limit
        this.score = 0
        this.return = false
        this.localDone = false
        this.matchIndex = mIdx


        //traversal
        this.traversed = new Set()
        this.toCheck = new Set()
        this.linksToRight = {}
        this.relations = {} //{relationID:'src' OR 'trgt'}
        this.passing = {}//things that passed locally (filters,ranges. Nothing todo with connected nodes)
        this.failing = {}

        //filters
        this.filter = '' //fnString
        this.filterProps = [] //contains alias' from the filter fnString
        this.filterArgs = 0 //use for scoring
        this.ranges = [] //[{alias,to,from,score},..etc] //score ranges as they are entry points as well.
        this.ID = []

        //return config, only used if output = true
        this.returnAsArray = false // {} || []
        this.props = [] //[{alias,ids:[],as:'Different Name',raw:true}]{ids:[]}]//pvals should be !#. || !-.
        this.propsByID = false//only for returnAs {}, false={'Prop Alias': propValue}, true={pval: propValue} >> also applies for include
        this.noID = false//on returnAs object> object.ID = NodeID
        this.noAddress = false//object.address = {}||[] if returnAs = {} then>propsByID=false={'Prop Alias': address}||true={pval: address}
        this.raw = false//override setting, set for all props (helpful if props not specified(allActive) but want them as raw)

        Object.defineProperties(this, {
            leftThing: {
                get(){
                    return self[lid] || null
                },
            },
            rightThing: {
                get(){
                    return self[rid] || null
                },
            },
            leftScore: {
                get(){
                    let l = this.leftThing
                    let score = 0
                    while (l !== null) {
                        score += l.score
                        l = l.leftThing
                    }
                    return score || null
                },
                enumerable:true
            },
            rightScore: {
                get(){
                    let r = this.rightThing
                    let score = 0
                    while (r !== null) {
                        score += r.score
                        r = r.rightThing
                    }
                    return score || null
                },
                enumerable:true
            },
            scoreCalc: {
                value: function(){
                    let id=0,filter,range=0,types
                    if(this.ID)id=1000
                    filter = this.filterArgs*20
                    types = Math.round(60/(this.srcTypes.length + this.trgtTypes.length + this.types))
                    types = (types === Infinity) ? 0 : types
                    for (const idx of this.ranges) {
                        let {from,to} = idx
                        if(from === -Infinity)from = new Date(-99999,0).getTime()
                        if(to === Infinity)to = new Date(99999,0).getTime()
                        let s = Math.round(((1000*60*60*24)*100)/(to-from))
                        idx.score = s
                        if(s>range)range = s
                    }
                    this.ranges.sort((a,b)=>b.score-a.score)
                    this.bestIndex = [[id,'id'],[range,'range'],[types,'types']].sort((a,b)=>b[0]-a[0])[0][1]
                    let total = id+filter+range+types
                    if(this.varLen)total = 0 //we cannot start on a variable length relation pattern
                    this.score = total
                    
                    return total
                }
            },
            varLen: {
                value: !!this.pathLengthRange,
                enumerable:true
            },
            maxDepth: {
                value: this.pathLength + this.pathLengthRange,
                enumerable:true
            }


        });
    }
    
}
function query(path,qParams, cb, opts){
    let startTime = Date.now()
    let {b} = parseSoul(path)
    let {isSub,sVal,checkNodes} = opts
    if(isSub)pendingQueries.add(sVal)
    const pathStrings = qParams.pathStrings //Set
    const paths = []
    const nodesNeeded = {}
    let preReturn = [] //process paths with sort/group/limit/etc.
    let data = {}
    const result = []  //using preReturn, preserve order and get the props user requested. This is what is returned
    Object.defineProperty(result,'out',{value:{}})
    const metaOut = result.out
    metaOut.query = qParams.cleanQuery.slice() //what user can pass back in/save as a 'saved' query
    metaOut.parsed = JSON.parse(JSON.stringify(qParams)) //freeze object at creation
    let {expand} = qParams
    opts = opts || {}
    let bufferTrigger = false
    let requery = !!qParams.pathStrings.size
    console.log(qParams)
    if(checkNodes){//checkNodes can only come from the buffer
        bufferTrigger = true
        if(qParams.expand){
            //if a new relation comes in, then we need to get it's src & trgt to see if either of them are in the 'active' list
            //if nothing is touching the nodes that have passed, then stop. else, just start expand over from the top.
            let findSrcTrgt = []
            let reExpand = false
            let userVar = qParams.leftMostThing

            for (const nodeID in checkNodes) {
                let pvalSet = checkNodes[nodeID]
                //can be any type, could be relation
                let {b,r} = parseSoul(nodeID)
                //for expand, there is only one userVar
                let rType = makeSoul({b,r})
                if(qParams.elements[userVar].activeExpandNodes.has(nodeID) && r){
                    let [statePval] = hasPropType(gb,rType,'state')
                    if(pvalSet.has(statePval)){
                        reExpand = true
                        startQuery()
                        break
                    }
                }else if(!qParams.elements[userVar].activeExpandNodes.has(nodeID) && r){
                    findSrcTrgt.push(nodeID)//need to see if these are new relations added to any nodes already in the expand>could change result
                }
            }
            let find = findSrcTrgt.length * 2
            for (const lookup of findSrcTrgt) {
                if(reExpand)break
                let {b,r} = parseSoul(nodeID)
                //for expand, there is only one userVar
                let rType = makeSoul({b,r})
                let [src,trgt] = [hasPropType(gb,rType,'source')[0],hasPropType(gb,rType,'target')[0]]
                const checkForID = (id) =>{
                    find--
                    if(qParams.elements[userVar].activeExpandNodes.has(id)){
                        reExpand = true
                        startQuery()
                    }
                    if(!find)startQuery()
                }
                getCell(lookup,src,checkForID,true)
                getCell(lookup,trgt,checkForID,true)
            }



        }else{
            for (const nodeID in checkNodes) {
                let pvalSet = checkNodes[nodeID]
                //can be any type, could be relation
                let {t,r} = parseSoul(nodeID)
                //all ID's are unique across a base, so only need to see if any nodes have them
                for (const userVar of qParams.elementRank) {
                    const {types} = qParams.elements[userVar];
                    qParams.elements[userVar].toCheck.clear()
                    if(types.includes(t) || types.includes(r)){//add it to the highest scoring match.
                        //check to see if it is on passing/failing
                        let passSet = qParams.elements[userVar].passing[nodeID]
                        let failSet = qParams.elements[userVar].failing[nodeID]
                        if(passSet){//was passing on last query
                            if(intersect(passSet,pvalSet).size){//overlap between things being filtered and things that changed
                                qParams.elements[userVar].toCheck.add(nodeID)
                            }
                        }else if(failSet){//was failing on last query
                            if(intersect(failSet,pvalSet).size){//really only the last one is relevant, but hard to check exactly that
                                qParams.elements[userVar].toCheck.add(nodeID)
                            }
                        }else{//was not evaluated last time
                            qParams.elements[userVar].toCheck.add(nodeID)
                        }
                        break
                    }
                }
            }
            startQuery()
        }
    }else{
        startQuery()
    }

    function startQuery(){
        if(expand)expandNodes()//expand starts over regardless of if it has been run before
        else if(bufferTrigger){console.log('Beginning query by evaluating new data');evaluateNodes()}
        else if(requery){console.log('Requery, assmbling output from previous query results');assmebleOutput();}
        else getIndex()//firstCall not expand
    
    }
   
    function getIndex(){
        console.log('Beginning query by an index')
        let startVar = qParams.elementRank[0]
        let {types,labels,ranges,ID,isNode, bestIndex,srcTypes,trgtTypes} = qParams.elements[startVar]
        //bestIndex could be one of ['id','range','types','labels']
        switch (bestIndex) {
            case 'id':
                for (const id of ID) {
                    qParams.elements[startVar].toCheck.add(id)
                }
                evaluateNodes()
                break;
            case 'types':
                getTypes()
                break;
            case 'labels':
                getLabels()
                break;
            case 'range':
                getRange()
                break;
            default:
                break;
        }
        function getTypes(){
            let toGet = types.length
            for (const id of types) {
                // need existence soul for each type
                if(isNode){
                    let s = makeSoul({b,t:id,i:true})//created/existence soul
                    gun.get(s).once(function(node){
                        for (const nodeID in node) {
                            const isActive = node[nodeID];//true = 'active', false = 'archived', null = 'deleted
                            if (DATA_INSTANCE_NODE.test(nodeID) && isActive) {
                                qParams.elements[startVar].toCheck.add(nodeID)
                            }
                        }
                        toGet--
                        if(!toGet)evaluateNodes()
                    })
                }else{
                    let s = makeSoul({b,r:id})//type identifier
                    //if we have a "_CREATED" time range for these nodes, we can narrow further
                    let {from,to} = ranges.filter(x=>x.alias === '_CREATED')[0] || {}
                    getRelationNodes(gun,s,srcTypes,trgtTypes,function(relationIDarr){
                        for (const id of relationIDarr) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        toGet--
                        if(!toGet)evaluateNodes()
                    },{from,to})
                }
                
            }

        }
        function getLabels(){
            let toGet = types.length
            for (const id of types) {
                let s = makeSoul({b,t:id})
                getLabeledNodes(gun,gb,s,labels,function(nodes){
                    for (const id of nodes) {
                        qParams.elements[startVar].toCheck.add(id)
                    }
                    if(!toGet)evaluateNodes()
                })
                //each node type is independent from each other
                //but each nodeType added must have ALL labels
            }
        }
        function getRange(){
            let {from,to,alias} = ranges[0] //already reverse sorted
            let toGet = types.length
            for (const id of types) {
                let sym = (isNode) ? 't' : 'r'
                if(alias !== '_CREATED'){
                    let idx
                    let type = makeSoul({b,[sym]:id})
                    let p = qParams.aliasToID.id(type,alias)
                    idx = makeSoul({b,[sym]:id,p})
                    qIndex(idx,function(nodes){
                        toGet--
                        for (const id of nodes) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        if(!toGet)evaluateNodes()
                    },Infinity,from,to)
                }else if(!isNode){//only created for relations is on a different index
                    let s = makeSoul({b,r:id})//created/existence soul
                    //if we have a "_CREATED" time range for these nodes, we can narrow further
                    let {from,to} = ranges.filter(x=>x.alias === '_CREATED')[0] || {}
                    getRelationNodes(gun,s,srcTypes,trgtTypes,function(relationIDarr){
                        for (const id of relationIDarr) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        toGet--
                        if(!toGet)evaluateNodes()
                    },{from,to})
                }else{
                    getTypes()//if isNode and _CREATED, not indexed
                }
            }
        }
    }
    function expandNodes(){
        console.log('Beginning query by expansion')

        let varsToCheck = qParams.shortestToCheck
        if(!varsToCheck){
            queryDone(!bufferTrigger)
            return
        }//nothing matched the query, return the result
        metaOut.approach = []
        let nextExpand = new Set()
        let inProcess = 0
        let startVar = qParams.leftMostThing
        let thing = qParams.elements[startVar];
        let {toCheck,traversed,uniqueness,limit,beginSequenceAtStart,filterStartNode,
        whitelistNodes,blacklistNodes,terminatorNodes,endNodes,sequence,labelFilter,relationshipFilter} = thing
        let filterBy = (sequence && 'sequence') || (labelFilter && 'label') || (relationshipFilter && 'relationship')
        let hasEndNode = (filterBy === 'label' && labelFilter.filter(x=>x.end.length)[0]) || false
        qParams.activeExpandNodes.clear()

        metaOut.approach.push('Expanded '+startVar )
        for (const nodeID of toCheck) {
            nextExpand.add(new Path(thing,nodeID))
        }
        expandNext()

        function Path(thingObj,id,nextRel){
            
            if(thingObj instanceof Path){//copy a path for branching
                let newPath = thingObj.curPath.slice()
                if(nextRel)newPath.push(nextRel)
                this.curPath = newPath
                this.depth = (nextRel) ? thingObj.depth + 1 : thingObj.depth
                this.minLevel = thingObj.minLevel
                this.maxLevel = thingObj.maxLevel
                this.filterBy = thingObj.filterBy
                this.fullSeq = thingObj.fullSeq
                this.filter = JSON.parse(JSON.stringify(thingObj.filter))//if this is a sequence 
                this.firstRelations = thingObj.firstRelations
                this.curID = id
            }else{
                let {minLevel,maxLevel,sequence,labelFilter,relationshipFilter,firstRelations} = thingObj
                this.curPath = []
                this.depth = 0
                this.minLevel = minLevel
                this.maxLevel = maxLevel
                this.filterBy = filterBy
                this.fullSeq = JSON.parse(JSON.stringify(sequence || [])) //in case we are using a sequence, we need to 'copy' it to filter if filter is fully consumed.
                this.filter = sequence || labelFilter || relationshipFilter || []
                this.firstRelations = JSON.parse(JSON.stringify(firstRelations || []))
                this.curID = id
                
                this.filter = JSON.parse(JSON.stringify(this.filter))
            }
            
        }

        //this is only for doing expand operation
        function expandNode(pathParams){
            //This function will only ever be called with nodeIDs. We will do all relationship stuff infunction. So ()-[] then ()-[] || ()<<END NODE
            let {curPath,curID,depth,minLevel,maxLevel,filterBy,fullSeq,filter,firstRelations} = pathParams
            if(uniqueness === 'NODE_GLOBAL' && traversed.has(curID)){
                done(false)
                return
            }else if(uniqueness === 'NODE_GLOBAL'){
                traversed.add(curID)
            }
            
            let {b,t,i} = parseSoul(curID)
            let thingType = makeSoul({b,t,r})
            let endPath = false
            curPath.push(curID)
            if(blacklistNodes.includes(curID)){
                done(false)
            }else if(depth === 0 && !filterStartNode){
                getRelations()
            }else if(filterBy === 'relationship'){
                getRelations()
            }else{
                checkLabels()
            }
            function checkLabels(){
                if(filter[0] === '*'){
                    if(filterBy === 'sequence')filter.shift()
                    getRelations()
                    return
                }
                let {labels,not,term,end} = (filterBy === 'sequence') ? filter.shift() : filter[0]
                let [labelsPval] = hasPropType(gb,thingType,'labels')
                getCell(curID,labelsPval,function(curLabelsArr){
                    let allLabels = curLabelsArr.slice()
                    if(evalLabels(allLabels,not,true)){//failed
                        done(false)
                        return
                    }else if(filterBy === 'label' && evalLabels(allLabels,term,false)){//non-sequence, want to skip this block if it isn't term
                        done(true)
                        return
                    }else if(filterBy === 'sequence' && term.length){//for sequence, if this has any term args, this block MUST call done and return                        
                        done(evalLabels(allLabels,term,false))
                        return
                    }else if(filterBy === 'label' && evalLabels(allLabels,end,false)){//non-sequence endNode
                        endPath = true
                    }else if(filterBy === 'sequence' && end.length ){//must be an end node
                        if(!evalLabels(allLabels,end,false)){//if it is valid, we want to let things continue to getRelations
                            done(false)
                            return
                        }
                    }else if(!evalLabels(allLabels,labels,false)){//does not pass the label requirements
                        done(false)
                    }
                    getRelations()
                },true)
                function evalLabels(curLabels,against,andAll){
                    let hasOr = !!andAll
                    for (const orBlocks of against) {//ALL labels it cannot have
                        let hasAnd = true
                        for (const ands of orBlocks) {
                            if(!curLabels.includes(ands)){
                                hasAnd = false
                                break
                            }
                        }
                        if(!andAll && hasAnd){
                            hasOr = !hasOr
                            break
                        }else if(andAll && !hasAnd){
                            hasOr = !hasOr
                            break
                        }
                        
                    }
                    return hasOr
                }
            }
            function getRelations(){
                if(depth === maxLevel){
                    done(true)
                    return
                }
                let rTypes = (!beginSequenceAtStart && depth === 0 && firstRelations) || (filterBy === 'sequence') ? filter.shift() : filter[0]
                if(filterBy === 'sequence' && !filter.length){//start the sequence over, relation should always be the last in the sequence
                    pathParams.filter = JSON.parse(JSON.stringify(fullSeq))
                }
                
                let statesToCheck = []
                let nextToGet = []
                let toGet = Object.keys(rTypes).length

                if(!toGet){//weird state to be in, basically a parameter given has to be incorrect.
                    done(false)
                    return
                }
                for (const rid in rTypes) {
                    let signs = rTypes[rid]
                    let linkSoul = makeSoul({b,t,r:rid,i})
                    gun.get(linkSoul).once(function(linkNode){
                        toGet--
                        if(linkNode !== undefined){
                            for (const linkAndDir in linkNode) {
                                const boolean = linkNode[linkAndDir];
                                if(linkAndDir === '_' || !boolean)continue
                                let [sign,relationID] = linkAndDir.split(',')
                                if(uniqueness !== 'RELATIONSHIP_GLOBAL' || (uniqueness === 'RELATIONSHIP_GLOBAL' && !traversed.has(relationID))){
                                    if(uniqueness === 'RELATIONSHIP_GLOBAL')traversed.add(relationID)
                                    if(signs.includes(sign)){
                                        statesToCheck.push([relationID,sign])
                                    }
                                }
                               
                            }
                        }
                        if(!toGet)checkStates()
                    })

                }
        
                function checkStates(){
                    //see if node is current, mostly doing this to make sure we keep the query correct if a sub
                    let toGet = statesToCheck.length
                    for (const [id,sign] of statesToCheck) {
                        let {b,r} = parseSoul(id)
                        let rType = makeSoul({b,r})
                        let [statePval] = hasPropType(gb,rType,'state')
                        getCell(id,statePval,function(state){
                            toGet--
                            if(state ==='active'){
                                let need = (sign === '>') ? 'target' : 'source' //invert where we are to what we need
                                nextToGet.push([id,need])
                            }
                            if(!toGet)getNextNodeIDs()
                        },true)
                    }
                    
                }
                function getNextNodeIDs(){
                    let toGet = nextToGet.length
                    for (const [id,pType] of nextToGet) {
                        let {b,r} = parseSoul(id)
                        let rType = makeSoul({b,r})
                        let [srcOrTrgtPval] = hasPropType(gb,rType,pType)
                        getCell(id,srcOrTrgtPval,function(nextNode){
                            toGet--
                            nextExpand.add(new Path(pathParams,nextNode,id))
                            if(!toGet)done(true)//pass this current path, done will see if it should add this to result or not
                        },true)
                    }
                }
            }
            function done(passed){
                inProcess--
                if(passed && depth >= minLevel && depth <= maxLevel){//in range, should we add this path to result?
                    let addPath = false
                    if(terminatorNodes.length){
                        addPath = terminatorNodes.includes(curID)
                    }else if(endNodes.length){
                        addPath = endNodes.includes(curID)
                    }else if(filterBy === 'label' && ((hasEndNode && endPath) || !hasEndPath)){
                        addPath = true
                    }else if(filterBy !== 'label'){//evreything else can get through
                        addPath = true
                    }
                    if(addPath && whitelistNodes.length){
                        addPath = whitelistNodes.includes(curID)
                    }
                    if(addPath){
                        for (const id of curPath) {
                            qParams.activeExpandNodes.add(id)
                        }
                        if(result.length < limit){
                            result.push(curPath)
                        }else{
                            queryDone(true)
                        }
                    }
                    
                }
                if(!inProcess && nextExpand.size)expandNext()
                else if(!inProcess && !nextExpand.size)queryDone(true)
            }
            
        }
        function expandNext(){
            //apply limit here?
            let nexts = [...nextExpand]
            inProcess = nexts.length
            nextExpand.clear()
            for (const pathArg of nexts) {
                expandNode(pathArg)
            }
        }
    }
    function evaluateNodes(){

        //this is only for match pattern w/ normal return

        //could have some nodes to test in any of the userVar's if this is a requery
        //otherwise there will only be one userVar that has toCheck
        //either way, our runner needs to be able to start anywhere in the match statement
        //will need to make a little query object to pass around 
        let varsToCheck = qParams.elementRank
        console.log(varsToCheck)

        if(!varsToCheck){
            queryDone(!bufferTrigger)
            return
        }//nothing matched the query, return the result
        metaOut.approach = []
        let openPaths = 0
        for (const startVar of varsToCheck) {
            metaOut.approach.push('Started with '+startVar)
            let thing = qParams.elements[startVar];
            const {toCheck} = thing
            for (const nodeID of toCheck) {
                openPaths++
                checkAndTraverse(false,false,startVar,nodeID)
            }
        }
        function checkAndTraverse(curPath,pathParams,startVar,startID){
            curPath = curPath || []
            let dir,otherDir,branch

            if(pathParams){//this is a branched path
                branch = true
                dir = pathParams.curDir
                startVar = pathParams[dir].curVar
                startID = pathParams[dir].curID
            }else{
                const dirParams = (leftOrRight) =>{ return {done:!qParams.elements[startVar][leftOrRight+'Thing'],curVar:startVar,curID:startID}} //both are the same at the start
                dir = (qParams.elements[startVar].leftScore < qParams.elements[startVar].rightScore) ? 'right' : 'left'
                pathParams = {
                    startVar,
                    startID,
                    left:dirParams('left'),
                    right:dirParams('right'),
                    curDir: dir,
                    rTraversed: new Set()

                }
            }
            let thing = qParams.elements[startVar]
            let {b,t,r,i} = parseSoul(startID)
            let thingType = makeSoul({b,t,r})
            let {isNode} = thing//notDistinct is not yet implemented
            otherDir = (dir === 'right') ? 'left' : 'right'//might already be done, but his way we can check easily
            if(!isNode && pathParams.rTraversed.has(startID)){
                openPaths--
                return
            }
            let pvals = new Set()
            if(branch && startVar === pathParams.startVar){//for starting over in the middle of the match but evaluating in other dir
                traverse()
            }else{
                checkID()
            }
            function checkID(){
                if(isNode){//checking created date in ID
                    let hasCreated = thing.ranges.filter(x=>x.alias === '_CREATED')[0]
                    if(hasCreated){
                        let [id,createdUnix] = i.split('_')
                        let {from,to} = hasCreated
                        if(createdUnix<from || createdUnix>to){localDone(false); return}
                    } 
                }
                if(thing.ID.length){//in case we are requerying, a list of ID's is basically a filter on IDs, this is the filter
                    if(!thing.ID.includes(startID)){
                        localDone(false)
                        return
                    }
                }
                let typeID = t || r
                if(!thing.types.includes(typeID)){
                    localDone(false)
                    return
                }
                checkState()
            }
            function checkState(){
                //see if node is current
                let [statePval] = hasPropType(gb,thingType,'state')
                pvals.add(statePval)//had to add this so if it is 'removed' from the object we can update subscriptions to reflect that
                getCell(startID,statePval,function(state){
                    if(state !=='active'){
                        localDone(false)
                    }else{
                        if(isNode)checkLabels()
                        else checkRange()
                    }
                },true)
            }
            function checkLabels(){
                let [labelsPval] = hasPropType(gb,thingType,'labels')
                pvals.add(labelsPval)//had to add this so if it is 'removed' from the object we can update subscriptions to reflect that
                if(!thing.labels.length && !thing.not.length){//skip retrieval if nothing to check
                    checkRange()
                    return
                }
                getCell(startID,labelsPval,function(curLabelsArr){
                    for (const andLabel of thing.labels) {//ALL labels it must have
                        if(!curLabelsArr.includes(andLabel)){
                            localDone(false)
                            return
                        }
                    }
                    for (const notLabel of thing.not) {//ALL labels it cannot have
                        if(curLabelsArr.includes(notLabel)){
                            localDone(false)
                            return
                        }
                    }
                    checkRange()
                },true)
            }
            function checkRange(){
                let propRanges = thing.ranges.filter(x=>x.alias !== '_CREATED')
                let toGet = propRanges.length
                if(!toGet){checkFilter();return}
                let values = []
                for (const range of propRanges) {
                    let {from,to,alias} = range
                    let p = qParams.aliasToID.id(startID,alias)
                    pvals.add(p)
                    if(p===undefined){
                        console.warn('Cannot find '+alias+' for '+startID+' ---considered not passing---')
                        localDone(false)
                        return
                    }//?? undefined is basically out of range? node does not have this property? User passed invalid alias?
                    getCell(startID,p,function(value){
                        values.push([from,value,to])
                        toGet--
                        if(!toGet){verifyRanges();return}
                    },true)
                }
                function verifyRanges(){
                    let fail = values.filter(a=>{
                        let [from,value,to] = a
                        return (from>value || value>to)
                    })
                    if(fail.length){localDone(false);return}
                    checkFilter()
                }
            }
            function checkFilter(){
                let toGet = thing.filterProps.length
                if(!toGet){localDone(true);return}
                let values = {}
                for (const alias of filterProps) {
                    let p = qParams.aliasToID.id(startID,alias)
                    pvals.add(p)
                    if(p===undefined){
                        console.warn('Cannot find '+alias+' for '+startID+' ---considered not passing---')
                        localDone(false)
                        return
                    }//?? undefined is basically a fail? node does not have this property?
                    getCell(startID,p,function(value){
                        values[alias] = value
                        toGet--
                        if(!toGet){verifyFilter();return}
                    },true)
                }
                function verifyFilter(){
                    let eq = filter.replace(/\{(?:`([^`]+)`|([a-z0-9]+))\}/gi,function(match,$1,$2){
                        let alias = ($1!==undefined) ? $1 : $2
                        return values[alias]
                    })
                    let passed = evaluateAllFN(eq)//could techincally construct a function that does not eval to true or false, so truthy falsy test?
                    if(!passed)localDone(false)
                    else localDone(true)
                }
            }

            function localDone(passed){
                if(!passed){
                    console.log(startID, 'did not pass')
                    delete qParams.elements[startVar].passing[startID]
                    qParams.elements[startVar].failing[startID] = pvals
                    //TODO!! check prevPaths to see if it was used in anything
                    let wasIn = qParams.allNodes[startID] //undefined || Set{pathStrings}
                    if(wasIn){//this was passing, and was in some path(s)
                        for (const nowInvalidPathStr of wasIn) {
                            qParams.pathStrings.delete(nowInvalidPathStr)
                        }
                    }
                    openPaths--
                    return
                }
                console.log(startID, 'passed')

                qParams.elements[startVar].passing[startID] = pvals
                delete qParams.elements[startVar].failing[startID]

                let op = (dir === 'right') ? 'push' : 'unshift'
                curPath[op](startID)
                traverse()
            }
            function traverse(){
                let nextThing = thing[dir+'Thing']
                let toTraverse = []
                if(isNode){
                    let [rTypes,signs] = thing.validRelations(dir) || []
                    if(nextThing === null){//must have nextThing === null to consider dirDone
                        dirDone()
                        return
                    }else if(!rTypes){//should have a next, but nothing valid to get (bad query?)
                        openPaths--
                        return
                    }
                    let toGet = rTypes.length
                    for (const rid of rTypes) {
                        let linkSoul = makeSoul({b,t,r:rid,i})
                        gun.get(linkSoul).once(function(linkNode){
                            toGet--
                            if(linkNode !== undefined){
                                for (const linkAndDir in linkNode) {
                                    const boolean = linkNode[linkAndDir];
                                    if(linkAndDir === '_' || !boolean)continue
                                    let [sign,relationID] = linkAndDir.split(',')
                                    if(signs.includes(sign)){
                                        toTraverse.push(relationID)
                                    }
                                }
                            }
                            if(!toGet)attemptTraversal()
                        })

                    }
                }else{
                    let [p] = hasPropType(gb,thingType,thing[dir+'Is'])//looking for source/target pval
                    //technically if this is undirected, I think it we should branch our path again, and navigate this dir with both src and trgt ids...
                    //not doing that now, just going to have bidirectional paths show as a single path in results
                    getCell(startID,p,function(nodeid){
                        toTraverse.push(nodeid)
                        attemptTraversal()
                    },true)
                }
                function attemptTraversal(){
                    if(!toTraverse.length){
                        openPaths--//should have had more links to get, which means this doesn't match the pattern
                        return
                    }
                    pathParams[dir].curVar = nextThing.userVar
                    let copyParams = JSON.parse(JSON.stringify(pathParams))
                    let copyPath = JSON.parse(JSON.stringify(curPath))
                    for (const id of toTraverse) {
                        if(isNode){//currently a node, will be traversing relationships
                            let newParams = Object.assign({},copyParams,{[dir]:{curID:id}})
                            checkAndTraverse(copyPath,newParams)//we branch and create a new path
                            openPaths++
                        }else{//should only be a single id in this array, we are on a relationship getting a nodeID
                            pathParams[dir].curID = id //we don't copy anything, because a path can only end on a node.
                            checkAndTraverse(curPath,pathParams)
                            thing.rTraversed.add(id)//can only traverse a relationID once per query (should prevent circular?)
                            //we also not opening a new path, since we are in the 'middle' of evaluating this one.
                        }
                    }
                    if(isNode)openPaths--//since we branched n times, techically this particular path has ended (but it spawned a bunch more potentials)
                    
                }
                function dirDone(){
                    pathParams[dir].done = true
                    if(pathParams[otherDir].done){
                        openPaths--
                        //add to paths array that we will be using to assembleOutput
                        //need to make sure the path is unique..., or atleast does not duplicate a path in the output
                        pathStrings.add(JSON.stringify(curPath))
                        if(!openPaths){
                            assmebleOutput()//Everything has been checked, all possible paths have been evaluated (given the starting)
                        }
                    }else{//started in the middle, need to verify other half
                        //we are not starting a new path, as we are continuing the current path
                        pathParams.curDir = otherDir
                        checkAndTraverse(curPath,pathParams)

                    }
                }
            }
        }
    }
    function assmebleOutput(){
        //need to build all paths that are valid
        //if there is a sort, need to sort all the paths by the sortVal
        //if there is a limit/skip, we need to only grab the sub-list
        //with whatever list we have at this point, we need to getCell on all props,apply/skip formatting,put in array/object/optionally attach ids/addresses
        //when do we apply group? Don't, group is up to user

        let {sortBy,limit,skip,returning} = qParams
        qParams.allNodes = {} //clear all nodes for each requery.
        if(!sortBy){
            applySkipLimit([...pathStrings]) //applySkipLimit then buildPaths, then buildResults
        }else{
            buildPreReturn() //gets sortvalues and does sorting, then applySkipLimit to sorted arr of pathStrings then buildPaths, then buildResults
        }
        function applySkipLimit(someArr){
            if(limit > someArr.length)limit=someArr.length
            if(skip === 0 && limit === someArr.length){//no skip or limit, avoid the copy
                preReturn = someArr
            }else{
                preReturn = someArr.slice(skip,limit)
            }
            buildPaths()
        }
        function buildPaths(){
            for (const pathStr of preReturn) {
                let pathArr = JSON.parse(pathStr)
                let sorted = []
                let pathOrder = qParams.orderIdxMap
                let j = 0
                for (const id of pathArr) {
                    if(!nodesNeeded[id])nodesNeeded[id] = {}
                    nodesNeeded[id].userVar = returning[j]
                    if(!qParams.allNodes[id])qParams.allNodes[id] = new Set()
                    qParams.allNodes[id].add(pathStr)//add this path to paths that use this id
                    let newIdx = returning.indexOf(pathOrder[j])
                    if(newIdx === -1)continue//not part of the return
                    sorted[newIdx] = id
                    j++
                }
                if(qParams.idOnly)result.push(sorted)
                else paths.push(sorted)
            }
            if(qParams.idOnly)queryDone(true)
            else buildResults()
            
            //whatever paths is, we need to sort to match the return order user specified and add to paths
        }
        function buildPreReturn(){
            let beforeSkipLimit = []
            let sortArr = [] //[[pathsIdx, [value1,value2,...valueN]], [pathsIdx2, [value1,value2,...valueN]]]
            let [sortUserVar,...sortArgs] = sortBy
            let sortProps = sortArgs.map(x=>x.alias)
            let pathIdx = qParams.orderIdxMap.indexOf(sortUserVar)
            let toGet = pathStrings.size
            let i = 0
            for (const pathStr of pathStrings) {
                let path = JSON.parse(pathStr)
                if(!Array.isArray(sortArr[i]))sortArr[i] = [i,[]]
                let nodeID = path[pathIdx]
                let propsToGet = sortProps.length
                let j = 0
                for (const alias of sortProps) {
                    let p = qParams.aliasToID.id(nodeID,alias)
                    if(p!==undefined){
                        getCell(nodeID,p,addVal,true)
                    }else{
                        //what to do? put in a 0 so it is alway top or bottom?
                        console.warn('Cannot find '+alias+' for '+nodeID+' ---  sorting as value: -1  ---')
                        addVal(-1)
                    }
                    function addVal(val){
                        sortArr[i][1][j]=val
                        propsToGet--
                        if(!propsToGet){
                            toGet--
                            if(!toGet)sortReturn()
                        }
                    }
                    j++
                }
                i++
            }
            function sortReturn(){
                sortArr.sort(compareSubArr(sortArgs.map(x=>x.dir)))
                let pathArr = [...pathStrings]
                let i = 0
                for (const [originalIdx] of sortArr) {
                    beforeSkipLimit[i] = pathArr[originalIdx]//cannot get value by index in set, but order is preserved
                    i++
                }
                applySkipLimit(beforeSkipLimit)
                function compareSubArr(sortQueries){
                    return function(a,b){
                        return multiCompare(0,sortQueries,a,b)
                        function multiCompare(idx,dirArr,a,b){
                            const varA = (typeof a[1][idx] === 'string') ?
                                a[1][idx].toUpperCase() : a[1][idx];
                            const varB = (typeof b[1][idx] === 'string') ?
                                b[1][idx].toUpperCase() : b[1][idx];
                
                            let comparison = 0;
                            if (varA > varB) {
                                comparison = 1;
                            } else if (varA < varB) {
                                comparison = -1;
                            } else {
                                if(dirArr.lenth > 1){
                                    comparison = multiCompare(idx++,dirArr.slice(1),a,b)
                                }
                            }
                            return (
                                (dirArr[0] == 'DESC') ? (comparison * -1) : comparison
                                );
                        }
                    }
                    //a and b should be [idx, [p0Val,p1Val, etc..]]
                    //sortQueries = [dir,dir,dir]
                    
                }
            }
        }
        function buildResults(){
            //getNodes
            //then put in result
            let nodesToGet = Object.keys(nodesNeeded).length
            for (const nodeID in nodesNeeded) {
                let {userVar} = nodesNeeded[nodeID]
                let {props,returnAsArray,propsByID,noID,noAddress,raw:allRaw,rawLabels} = qParams.elements[userVar]
                // if(!props || (Array.isArray(props) && !props.length)){
                //     props = getAllActiveProps(gb,nodeID)
                // }
                let propsToGet = props.length

                const nodeObj = (returnAsArray) ? [] : {}
                if(!noID)Object.defineProperty(nodeObj,'id',{value: nodeID})
                if(!noAddress)Object.defineProperty(nodeObj,'address',{value: (returnAsArray) ? [] : {}})
                let j = 0
                for (const {alias,as:propAs,raw:rawProp} of props) {
                    let raw = !!allRaw || !!rawProp
                    let p = qParams.aliasToID.id(nodeID,alias)
                    if(p!==undefined){
                        //getCell(nodeID,p,addVal(nodeID,p,j,alias,propAs,propsByID,nodeObj,pending),raw)
                        getCell(nodeID,p,addValue(j),raw)
                        qParams.elements[userVar].passing[nodeID].add(p)
                    }else{
                        //what to do? neo returns `null`
                        console.warn('Cannot find '+alias+' for '+nodeID+' ---setting value as: `undefined`---')
                        addValue(undefined)
                    }
                    j++
                    function addValue(j){
                        return function(val){
                            let property = propAs || (propsByID) ? p : alias
                            if(returnAsArray){
                                property = j
                            }
                            nodeObj[property] = val
                            console.log(nodeID,property,val)
                            let fullPath = toAddress(nodeID,p)
                            if(!noAddress){
                                nodeObj.address[property] = fullPath
                            }
                            let {propType} = getValue(configPathFromChainPath(fullPath),gb)
                            if(!rawLabels && ['labels'].includes(propType) && Array.isArray(val)){
                                replaceLabelIDs(val,property)
                            }
                            propsToGet--
                            if(!propsToGet){
                                data[nodeID] = nodeObj
                                propIsDone()
                            }
                        }
                        
                    }
                }
                function replaceLabelIDs(raw,prop){
                    //raw could be either a string (soul) or array of souls (or if Label labelID)
                    //pType indicates whether this is label or not
                    //dType will tell us what data type to expect in raw
                    let allLabels = Object.entries(gb[b].labels)
                    let out = []
                    for (const labelID of raw) {
                        out.push(allLabels.filter(x=>x[1] === labelID)[0])
                    }
                    nodeObj[prop] = out
                }
                function propIsDone(){
                    nodesToGet--
                    if(!nodesToGet)makeResult()
                }
                
            }


            function makeResult(){
                //go through preReturn, for the ID grab the node arr/obj and put in result. If returning.length ===1 don't double up the array
                let i = 0
                for (const strPath of preReturn) {
                    let row = JSON.parse(strPath)
                    let j = 0
                    let newRow = []
                    for (const id of row) {
                        newRow[j] = data[id]
                        j++
                    }
                    result[i] = newRow
                    i++
                }
                queryDone(true)
            }
        }

    }
    function queryDone(returnResult){
        //setup up subscription, fire user cb
        if(isSub){
            console.log('setting up or updating sub: '+ sVal)
            //if(!gsubs[b])gsubs[b] = {}
            let basePath = makeSoul({b})
            setValue([basePath,sVal],{qParams,cb},gsubs)
            console.log(gsubs)
            pendingQueries.delete(sVal)
        }
        metaOut.time = Date.now()-startTime
        if(returnResult)cb(result)


    }
}


//PERMISSIONS
let authdConns = {}
function clientAuth(ctx){
    let root = ctx.root
    let msg = {}
    msg.creds = Object.assign({},root.user.is)
    msg['#'] = Gun.text.random(9)
    Gun.SEA.sign(msg['#'],root.opt.creds,function(sig){
        Gun.SEA.encrypt(sig,root.opt.pid,function(data){
            msg.authConn = data
            root.on('out',msg)
        })
    })
}
function verifyClientConn(ctx,msg){
    let root = ctx.root
    let ack = {'@':msg['#']}
    let{authConn,creds} = msg
    let pid = msg._ && msg._.via && msg._.via.id || false
    if(!pid){console.log('No PID'); return;}
    Gun.SEA.decrypt(authConn,pid,function(data){
        if(data){
            Gun.SEA.verify(data,creds.pub,function(sig){
                if(sig !== undefined && sig === msg['#']){
                    //success
                    authdConns[pid] = creds.pub
                    console.log("AUTH'd Connections: ",authdConns)
                    root.on('in',ack)
                }else{
                    ack.err = 'Could not verify signature'
                    root.on('in', ack)
                    //failure
                }
            })
        }else{
            console.log('decrypting failed')
        }
    })
}
function clientLeft(msg){
    let pid = msg && msg.id || false
    if(pid){
        delete authdConns[pid]
        console.log('Removed: ',pid, ' from: ',authdConns)
    }
}
function addHeader(ctx,msg,to){//no longer needed?
    let pair = ctx.opt.creds
    let type = (msg.get) ? 'get' : (msg.put) ? 'put' : false
    msg.header = {type,pub:false,sig:false}
    if(pair && type){
        let pub = pair.pub
        msg.header.pub = pub
        msg.header.token = token
        msg.header.sig = tokenSig
        
        to.next(msg)
        // let toSign = msg['#'] || msg['@'] //msg ID as entropy
        // Gun.SEA.sign(toSign,pair,function(sig){
        //     if(sig !== undefined){
        //         msg.header = {pub:pub,sig,alias:pair.alias}
        //         //console.log('HEADER ADDED: ',msg)
        //         to.next(msg)
        //     }else{
        //         to.next(msg)
        //     }
        // })
    }else{
        to.next(msg)
    }
    //console.log('OUT: ',msg)
}

function verifyPermissions(ctx,msg,to){
    if(msg.get && msg.get['#']){// get
        verifyOp(ctx,msg,to,'get')
    }else if (msg.put && Object.keys(msg.put).length){// put
        verifyOp(ctx,msg,to,'put')
    }else{
        to.next(msg)
    }
}

function isRestricted(soul,op){
    let getWhiteList = [/~/,/\|/,/GBase/,/config/,/\/t$/,/\/t\d*\/p/]
    if(op === 'get'){
        for (const t of getWhiteList) {
            let p = t.test(soul)
            if(p){
                return false
            }
        }
        //console.log('not on whiteList:', soul)
        let isGBase = /\/t\d+/g.test(soul) //looks for anything that has = '/t' + Number() (that didn't pass the whiteList)
        if(isGBase)return true
        return false //default everything else to read w/o login
    }else{
        if(/~/.test(soul))return false //allow user puts
        if(/GBase/.test(soul))return false //allow additions to list of bases
        
        return true //default all other puts to needing permission
    }
}
// let validTokens = {}
// const expireTok = (tok) =>{
//     delete validTokens[tok]
// }
function verifyOp(ctx,msg,to,op){
    let root = ctx.root
    let pobj = {msg,to,op}
    pobj.pub = false
    pobj.verified = false
    pobj.soul = (op==='put') ? Object.keys(msg.put)[0] : msg.get['#']
    pobj.prop = (op==='put') ? msg.put[pobj.soul] : msg.get['.']
    pobj.who = msg._ && msg._.via && msg._.via.id || false
    if(!isRestricted(pobj.soul,pobj.op)){//no auth needed
        //console.log('No auth needed: ',pobj.soul)
        to.next(msg)
        return
    }
    let authdPub = authdConns[pobj.who]
    //console.log('MSG FROM: ',pobj.who,' PUB: ',authdPub)
    if(pobj.who && authdPub){
        //console.log('Valid Connection')
        pobj.verified = true
        pobj.pub = authdConns[pobj.who]
        testRequest(root,pobj)
    }
    // if(msg.header && msg.header.sig && msg.header.pub && msg.header.token){
    //     if(msg.header.token !== 0 && validTokens[msg.header.token] && validTokens[msg.header.token] === msg.header.pub){
    //         console.log('Valid Token!')
    //         pobj.verified = true
    //         pobj.pub = msg.header.pub
    //         testRequest(root,pobj,pobj.soul)
    //     }else{
    //         let {pub,sig,token} = msg.header
    //         Gun.SEA.verify(sig,pub,function(data){
    //             if(data !== undefined && data === token){
    //                 console.log('Valid Sig!')
    //                 pobj.verified = true
    //                 pobj.pub = pub 
    //                 validTokens[token] = pub
    //                 setTimeout(expireTok,20000,token)
    //             }
    //             if(pobj.verified){
    //                 console.log('Message Sender Verified ', pobj.soul)
    //             }else{
    //                 //console.log('NOT VERIFIED: Sig/Pub mismatch',msg)
    //             }
    //             testRequest(root,pobj,pobj.soul)
    //         })
    //     }
    //     console.log('Checking ', pobj.op,': ', pobj.soul)
        
    // }
    else{//not logged in, could potentially have permissions?
        console.log('No/Empty message header! Attempting access to soul: ',pobj.soul)
        testRequest(root,pobj)
    }
}
let permCache = {}
function testRequest(root, request, testSoul){
    let {pub,msg,to,verified,soul,prop,op} = request
    testSoul = testSoul || soul
    if(!gb)throw new Error('Cannot find GBase config file') //change to fail silent for production
    let [path,...perm] = soul.split('|')
    let [base,tval,...rest] = testSoul.split('|')[0].split('/') //path === testSoul if not a nested property
    if(soul.includes('timeLog') || soul.includes('timeIndex')){
        path = path.split('>')[1]
        let[b,t,...i] = testSoul.split(':')[0].split('>')[1].split('/')
        base = b
        tval = t
        rest = (i) ? i[0].split('/') : i
    }
    let own = getValue([base,'props',tval,'owner'],gb) || false //false === row perms will be overridden by table perms
    let inherit = getValue([base,'inherit_permissions'],gb) || true // true === row will inherit table perms which will inherit base perms if missing
    let traverse = true
    let reqType
    
    if(soul.includes('|')){//permission change (put),(get is whitelisted)
        //console.log('Permission msg: ',msg)
        if((soul.includes('|super') || soul.includes('|group/admin|permissions')) && pub && verified){//attempt to modify 'baseID|super' node
            console.log('Attempting to create a Super Admin or Admin group')
            getSoul(soul,pub,true,function(data){
                //console.log(soul, ' IS: ',data)
                if(data && soul.includes('|super')){
                    console.log('Already exists! ',data)
                    root.on('in',{'@': msg['#'],  err: 'There is already a Super Admin for this base'})
                }else if(!data && soul.includes('|super')) {
                    //console.log('Creating new super node for new base')
                    to.next(msg)
                }else if(!data){
                    isSuper()
                }else{
                    attemptCHP(data,'group')
                }
            })
        }else if(soul.includes('|group/')){//group or group permission options
            if(soul.includes('permissions')){
                // console.log('CREATING GROUP PERMISSIONS')
                getSoul(soul,false, true ,function(data){
                    if(data){
                        attemptCHP(data,'group')
                    }else{//if node doesn't exist
                        isGrpOwner()//must have rowID|permission node created before creating group/...|permissions
                    }
                })
            }else{//changing membership
                //console.log('CHANGING MEMBERSHIP')
                let perms = soul + '|permissions'
                getSoul(perms,false,true,function(val){
                    //console.log('GROUP CHANGE, pubVerified: ', verified, 'pub: ', pub)
                    if(val){
                        addRemoveMember(val)
                    }else{// no permissions node for group. Must be admin?
                        isGrpOwner()
                    }
                })
            }
            
        }else if(soul.includes('permissions')){//for permission nodes themselves, sould be either base, table, or row permissions
            if(rest[0] === undefined){// baseID|permissions || baseID/tval|permissions : must be admin or super
                isAdmin()
            }else{//row permission
                //soul = baseID/tval/rval|permissions
                getSoul(soul,false, true, function(data){
                    if(data){
                        attemptCHP(data,'row') //editing existing soul
                    }else{//if node doesn't exist
                        //find 'create' permissions
                        checkScope('create') //creating this node
                    }
                })
            }
            
        }else if(soul.includes('|groups')){
            isAdmin()
        }
    }else if(soul.includes('config') && pub && verified){//no permissions node on config, must be admin or super
        isAdmin()
    }else{//all other restricted nodes, should be rows, can be 'get' or 'put'
        if(rest && rest[0] && rest[0][0] && rest[0][0] === 'r' || rest[0] === 'created'){// is some sort of row..
            let path
            if(rest[0] === 'created'){
                path = [base,tval].join('/')
            }else{
                path = [base,tval,rest[0]].join('/')
                reqType = 'row'
            }
            let permSoul = path +'|permissions'
            let hasNext = hasPropType(gb,[base,tval].join('/'),'next') //false || [pval]
            let opAs = (soul !== testSoul) ? 'get' : op
            if(!hasNext)traverse = false
            if(inherit || !own){
                checkScope(isOp(false, opAs))///read || create
            }else{
                getSoul(permSoul,false,true,function(val){
                    if(val){
                        testPermissions(val,isOp(true, opAs))
                    }else{
                        isAdmin('ERROR: NO PERMISSIONS FOUND!') 
                    }
                })
            }
            
        }else if(rest && rest[0] && rest[0][0] && rest[0][0] === 'p'){
            //going to deprecate these nodes in gbase soon.
            to.next(msg)
            //column soul base/tval/pval
        }else if(!rest){
            //base or base/tval
            to.next(msg)
        }else{
            //doesn't match anything in gbase
            isAdmin('Invalid Soul')
        }
        function isOp(exists, opAs){
            let tryOp = opAs || op
            if(tryOp === 'get'){
                return 'read'
            }
            if(exists){
                return 'update'
            }else{
                return 'create'
            }
        }
    }
    function checkScope(operation){
        let bPerm = base+'|permissions'
        let tPerm = [base,tval].join('/') +'|permissions'
        getSoul(tPerm,false,true,function(val){
            if(val){
                testPermissions(val,operation)
            }else if(inherit){
                getSoul(bPerm,false,true,function(val){
                    if(val){
                        testPermissions(val,operation)
                    }else{
                        isAdmin('ERROR: NO PERMISSIONS TO INHERIT!!')
                    }
                })
            }else{
                isAdmin('ERROR: NO PERMISSIONS TO INHERIT!!')  
            }
        })
    }
    function lookLocal(soul,prop,cb) {
        //console.log('lookLocal, ',soul,prop)
        if(!isNode){
            return undefined
        }
        prop = prop || ''
        cb = (cb instanceof Function && cb) || console.log
        var id = msg['#'], has = prop, opt = {}, graph, lex, key, tmp;
        if(typeof soul == 'string'){
            key = soul;
        } 
        //else 
        // if(soul){
        //     if(tmp = soul['*']){ opt.limit = 1 }
        //     key = tmp || soul['='];
        // }
        if(key && !opt.limit){ // a soul.has must be on a soul, and not during soul*
            if(typeof has == 'string'){
                key = key+esc+(opt.atom = has);
            }
            // else 
            // if(has){
            //     if(tmp = has['*']){ opt.limit = 1 }
            //     if(key){ key = key+esc + (tmp || (opt.atom = has['='])) }
            // }
        }
        // if((tmp = get['%']) || opt.limit){
        //     opt.limit = (tmp <= (opt.pack || (1000 * 100)))? tmp : 1;
        // }
        radata(key, function(err, data, o){
            if(err)console.log('ERROR: ',err)
            if(data){
                if(typeof data !== 'string'){
                    if(opt.atom){
                        data = u;
                    } else {
                        Radix.map(data, each) 
                    }
                }
                if(!graph && data){ each(data, '') }
            }
            cb.call(this,graph)
            //gun._.on('in', {'@': id, put: graph, err: err? err : u, rad: Radix});
        }, opt);
        function each(val, has, a,b){
            if(!val){ return }
            has = (key+has).split(esc);
            var soul = has.slice(0,1)[0];
            has = has.slice(-1)[0];
            opt.count = (opt.count || 0) + val.length;
            tmp = val.lastIndexOf('>');
            var state = Radisk.decode(val.slice(tmp+1), null, esc);
            val = Radisk.decode(val.slice(0,tmp), null, esc);
            (graph = graph || {})[soul] = Gun.state.ify(graph[soul], has, state, val, soul);
            if(opt.limit && opt.limit <= opt.count){ return true }
        }
        
    }
    function testPermissions(permsObj,opType){
        let {owner,create,read,update,destroy,chp} = permsObj
        //opType should be one of ['create','read','update','destroy']
        let grp = permsObj[opType]
        if(grp === undefined)isAdmin('Cannot find permissions for this operation!')
        if(grp === null && owner === pub && verified){
            to.next(msg)
        }else if(reqType === 'row' && traverse){
            isMember(grp,function(valid){
                if(valid){
                    traverseNext()
                }else if(owner === pub && verified){
                    traverseNext()
                }else{//admin can do whatever, no need to recur, if not admin, acks err
                    isAdmin()
                }
            })
        }else{
            isMember(grp,function(valid){
                if(valid){
                    to.next(msg)
                }else if(owner === pub && verified){
                    to.next(msg)
                }else{
                    isAdmin()
                }
            })
        }

    }
    function isGrpOwner(){
        let groupName = soul.split('|')[1].split('group/')[1]
        let isRow = /[^\/]+\/t[0-9]+\/r[^|]*/.test(groupName)
        if(isRow){
            let rowPermSoul = groupName + '|permissions'
            getSoul(rowPermSoul,'owner',false,function(message,eve){
                eve.off()
                if(message.put){
                    if(message.put === pub){//is Owner
                        to.next(msg)
                    }else{
                        isAdmin()
                    }
                }else{
                    isAdmin('No permission node found!')
                }
            })
        }else{
            isAdmin('Must be admin to make change to this group')
        }
        
    }
    function isMember(groupName,cb){
        if(groupName === 'ANY'){
            cb.call(this,true)
            return
        }
        let gsoul = base+'|group/'+groupName
        getSoul(gsoul,pub,false,function(val){
            cb.call(this,val)
        })
    }
    function isAdmin(errMsg){
        errMsg = errMsg || op+' PERMISSION DENIED on: '+JSON.stringify(msg)
        if(!verified){
            console.log('PERMISSION DENIED User not verified! OP: ',op,' ON SOUL: ',soul)
            root.on('in',{'@': msg['#']||msg['@'], err: errMsg})
            return
        }
        let [base] = path.split('/')
        getSoul(base+'|group/admin',pub,true, function(val){
            if(val){
                to.next(msg)
                //console.log('An Admin is performing action')
            }else{
                isSuper(errMsg)
            }
        })

    }
    function isSuper(errMsg){
        errMsg = errMsg || op+' PERMISSION DENIED on: '+JSON.stringify(msg)
        getSoul(base+'|super',pub,true, function(val){
            if(val){
                to.next(msg)
                //console.log('Super is performing action')
            }else{
                console.log(errMsg)
                root.on('in',{'@': msg['#']||msg['@'], err: errMsg})
            }
        })
    }
    function addRemoveMember(put){
        let {add,remove} = put
        let ops = Object.values(msg.put[soul])
        let adding = ops.includes(true)
        let removing = ops.includes(false)
        if(adding && removing){
            isMember(add,function(valid){
                if(valid){
                    isMember(remove,function(valid){
                        if(valid){
                            to.next(msg)
                        }else{
                            isGrpOwner()
                        }
                    })
                }else{
                    isGrpOwner()
                }
            })

        }else if(removing){
            isMember(remove,function(valid){
                if(valid){
                    to.next(msg)
                }else{
                    isGrpOwner()
                }
            })
        }else if(adding){
            isMember(add,function(valid){
                if(valid){
                    to.next(msg)
                }else{
                    isGrpOwner()
                }
            })
        }
    }
    function attemptCHP(perms, type){
        console.log('ATTEMPTING TO CHANGE PERMISSIONS')
        let {owner,chp} = perms
        let putKeys = Object.keys(msg.put[soul])
        let needsOwner = putKeys.includes('chp')
        let row = false
        if(type ==='row'){
            needsOwner = (putKeys.includes('chp') || putKeys.includes('owner')) //changing ownership or chp
            row = true
        }
        if(chp === 'ANY'){//not sure when this would be... Anyone could change who could CRUD.
            if(!needsOwner){//cannot change 'chp' unless you own the row (if not row, need admin)
                console.log('`ANY` is editing permissions')
                to.next(msg)
            }else if(needsOwner){
                isOwner()
            }else{
                isAdmin('Invalid permission change, `any` cannot edit owner or group permission settings')
            }
        }else if(verified && pub && chp !== null){//if in group, can edit
            let groupSoul = base+'|group/'+chp
            getSoul(groupSoul,false, true, function(data){//must do lookLocal in case group is referencing itself.
                if(data[pub]){
                    if(!needsOwner){//is on list, can edit
                        to.next(msg)
                    }else if(needsOwner){
                       isOwner()
                    }
                }else{
                    isOwner()
                    //isAdmin('Cannot find a list of group members for group specified in permissions!') //if no group list? or emit a different error message?
                }
            })
        }else if(verified && pub && chp === null){
            isOwner()
        }else{//admins or super can change permissions regardless of permission settings
            isAdmin()
        }
        function isOwner(){
            if(row && pub === owner){//is this the owner of the row
                to.next(msg)
            }else if(!row){
                isGrpOwner()
            }else{
                isAdmin()
            }
        }
    }
    function traverseNext(){
        let pval = hasNext[0] //should be single 'next' column
        let links = path + '/links/'+ pval
        getSoul(links,false,false,function(val){
            if(val){
                for (const nextLink in val) {
                    const valid = val[nextLink];
                    if(valid){//take first valid link, should only be one
                        testRequest(root,request,nextLink)
                    }
                }
            }
        })
    }
    function getSoul(soul,prop,local,cb){
        //local = true; Will ignore cache and always get from disk? Maybe always check cache first?
        //console.log('GETTING SOUL ', soul, prop ,local,permCache[soul])
        //console.log('getting ', soul,' from...')
        if(!(cb instanceof Function)) cb = function(){}
        if(permCache[soul] !== undefined){//null if node does not exist, but has been queried and sub is set
            //console.log('cache')
            if(prop){
                cb.call(this, getValue([soul,prop],permCache)) 
            }else{
                cb.call(this, permCache[soul]) 
            }
        }else if(local){//local could have been cached from a previous local:false get
            //do no setup sub or ask gun, because we might need to know if it is a 'create' vs 'update', ie: super
            //console.log('disk')
            lookLocal(soul,prop||false,function(node){
                let obj = node || {}
                let out
                if(prop){
                    out = getValue([soul,prop],obj)
                }else{
                    out = getValue([soul],obj)
                }
                if(!node){//no data, null to avoid a disk read next time.
                    permCache[soul] = null
                }else{
                    permCache[soul] = out
                }
                addSub(soul) //add sub to update cache to avoid a slow disk read
                cb.call(this,out) 
            })
        }else{
            //console.log('gun')
            let get = {'#':soul}
            if(prop){
                get['.'] = prop
            }
            gun._.on('in', {//faster than .get(function(msg,eve){...????
                get,
                '#': gun._.ask(function(msg){
                    cb.call(this,msg.put && msg.put[soul] || undefined)
                    permCache[soul] = msg.put && msg.put[soul] || null //non-undefined in case no data, but still falsy
                })
            })
            // gun.get(soul).get(function(messg,eve){//check existence
            //     eve.off()
            //     cb.call(this,messg.put)
            //     permCache[soul] = messg.put || null //non-undefined in case no data, but still falsy
            // })
            addSub(soul)
        }
    }
    function addSub(soul){//if you get a local, and it already exists, subscribe and put it in the cache
        gun.get(soul).on(function(data){//setup sub to keep cache accurate
            permCache[soul] = data
        })
    }
}







//NON CHAIN STUFF
function loadGBaseConfig(cb){
    reactConfigCB = cb

}
const {makegetAlias,makegetProps} = require('../util/util')
const getAlias = makegetAlias(gb)
const getProps = makegetProps(gb)


//WIP___________________________________________________



async function assembleTree(gun, node, fromID, archived, max, inc, arr){
    let res
    let idRef
    let newNode
    if(inc === undefined){//initial call
        newNode = Gun.obj.copy(node)
        inc = 0
        max = max || Infinity
        arr = [[],[]];
        let arrObj = {id: fromID,
                    data: newNode,
                    from: false,
                    prop: false
                    }   
        arr[0][0] = arrObj
        res = [node, arr]
        fromID = fromID
        
    }
    if(inc == max){return}
    //console.log(inc)
    inc++
    let refsToTraverse = Object.keys(GB[node['!TYPE']]['prev'])
    if (refsToTraverse){
        for (let i = 0; i < refsToTraverse.length; i++){
            if (node[refsToTraverse[i]]){
                if(!Array.isArray(arr[inc])){arr[inc] = []}
                let lookup = node[refsToTraverse[i]]["#"]
                let id = {id: lookup} //arr
                idRef = Object.assign({}, id) //arr
                let subthings = []
                //console.log(lookup)
                let propRef = await gunGetListNodes(gun, lookup)
                propRef.map(function(node){
                    let subNode = Gun.obj.copy(node)

                    if(!archived && subNode['!DELETED']){
                        
                    }else{
                        subthings.push(subNode)
                        let newObj = Object.assign({}, subNode)
                        let nodeInfo = {data: newObj,
                                        from: fromID,
                                        prop: refsToTraverse[i]}
                        let arrObj = Object.assign({}, idRef, nodeInfo)
                        arr[inc].push(arrObj)
                    }
                })
            node[refsToTraverse[i]] = Gun.obj.copy(subthings)
            }
        }
        //console.log(node)
        //console.log(arr)
        for (let i = 0; i < refsToTraverse.length; i++){
            if (node[refsToTraverse[i]]){
                for (let j = 0; j < node[refsToTraverse[i]].length; j++){
                let nextLevel = node[refsToTraverse[i]][j]
                assembleTree(gun, nextLevel, idRef.id, archived, max, inc, arr);//fires for each prop with refs, and once for each ref on said prop
                }
            }
        }
    }
    //accumulate math?
    return res; // Should return the full tree
}

function reduceRight(treeArr, method , acc){
    acc = acc || false //accumulate all mapper returns to single value, if false, will tree reduce
    let reduced = 0
    let calcArr = JSON.parse(JSON.stringify(treeArr))//?
    treeArr.push(calcArr)
    for (let i = calcArr.length-1; i > -1; i--){
        for (let j = 0; j < calcArr[i].length; j++){
            let node = (calcArr[i][j].data) ? calcArr[i][j].data : calcArr[i][j]//?
            let fromID = calcArr[i][j].from
            let fromProp = calcArr[i][j].prop
            if(node && !node['!DELETED']){
                let mapper = GB[node['!TYPE']]["methods"][method]
                let res = mapper(node)
                reduced += res
                console.log(calcArr[i][j])
                calcArr[i][j].data = res//?
                //let parent = _.find(calcArr[i-1], ['id', fromID])
                let parent = (calcArr[i-1]) ? calcArr[i-1].find(function(i){
                    return i.id == fromID
                }) : undefined
                if(!parent){
                    console.log(reduced)
                    treeArr = res
                }else{
                    if(typeof parent.data[fromProp] !== 'number'){//if it is a ref, replace with first value
                    parent.data[fromProp] = res
                    }else{
                        parent.data[fromProp] += res //if not a ref, then take old value and add it to new value
                        console.log(calcArr)
                    }
                }
            }
        }
    }
    let ret = (acc) ? reduced : treeArr
    return ret
}
function generateTreeObj(startNodeID, opt){
    let gun = this.back(-1)
    let archived = (opt) ? opt.archived || false : false
    let max = (opt) ? opt.max || undefined : undefined
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
    let tree = gunGet(gun,startNodeID).then(parentNode =>{
        let copy = Gun.obj.copy(parentNode) 
        return assembleTree(gun, copy, startNodeID, archived, max)})
    return tree
}
function generateTreeArr(startNodeID, max, archived){
    let gun = this.back(-1)
    archived = archived || false
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
	let parentNode
	gun.get(startNodeID).on(e => parentNode = Gun.obj.copy(e))
    let tree = assembleTree(gun, parentNode, startNodeID, archived, max)//?
    return tree[1]
}
function treeReduceRight(startNodeID, method, acc, max){
    let gun = this.back(-1)
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
	let parentNode
	gun.get(startNodeID).on(e => parentNode = Gun.obj.copy(e))
    let tree = assembleTree(gun, parentNode, startNodeID, false, max)//?
    let methodCalc = reduceRight(tree[1], method, acc)
    return methodCalc
}

//Tree Logic



module.exports = {
    loadGBaseConfig,
    gbase,
    gunToGbase,
    formatQueryResults,
    addHeader,
    verifyPermissions,
    clientAuth,
    verifyClientConn,
    clientLeft,
    getAlias,
    getProps
}