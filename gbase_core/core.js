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
let gsubsParams = {}
let gunSubs = {}
let subBuffer = {}
let bufferState = false
let reactConfigCB
let gbChainState = true

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
    bufferPathFromSoul,
    getAllActiveProps,
    Cache,
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
    lookupID
} = require('./util.js')
const cache = new Cache()
const upDeps = {}
const downDeps = {}

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
    makeimportChildData,
    makeaddChildProp,
    makepropIsLookup,
    makearchive,
    makeunarchive,
    makedelete,
    makenullValue,
    makerelatesTo,
} = require('./chain_commands')
let newBase,newNodeType,addProp,newNode,config,edit,nullValue,relatesTo
let importData,importNewNodeType,archive,unarchive,deleteNode,newFrom
let subscribeQuery,retrieveQuery,setAdmin,newGroup,addUser,userAndGroup,chp,importChildData,addChildProp,propIsLookup
const showgb = makeshowgb(gb)
const showcache = makeshowcache(cache)
const showgsub = makeshowgsub(gsubsParams)
const showgunsub = makeshowgunsub(gunSubs)

const {makesolve,
    findTruth,
    parseTruthStr,
    regexVar,
    evaluateAllFN
} = require('../function_lib/function_utils');
const solve = makesolve(gb, getCell)


const {timeIndex,
    queryIndex,
    timeLog,
    makecrawlIndex
} = require('../chronicle/chronicle')
let qIndex,tIndex,tLog,crawlIndex



const gunToGbase = (gunInstance,baseID) =>{
    gun = gunInstance
    startGunConfigSubs(baseID)
    //DI after gunInstance is received from outside
    tLog = timeLog(gun)
    tIndex = timeIndex(gun)
    qIndex = queryIndex(gun)
    crawlIndex = makecrawlIndex(gun)




    newBase = makenewBase(gun)
    newNodeType = makenewNodeType(gun,gb,tLog)
    importNewNodeType = makeimportNewNodeType(gun,gb,tLog,tIndex,triggerConfigUpdate)
    addProp = makeaddProp(gun,gb,tLog)
    addChildProp = makeaddChildProp(gun,gb,tLog,triggerConfigUpdate)
    importChildData = makeimportChildData(gun,gb,getCell,tLog,tIndex,triggerConfigUpdate)


    propIsLookup = makepropIsLookup(gun,gb,getCell,triggerConfigUpdate)
    
    
    newNode = makenewNode(gun,gb,getCell,cascade,tLog,tIndex)   
    newFrom = makenewFrom(gun,gb,getCell,cascade,tLog,tIndex) 
    edit = makeedit(gun,gb,getCell,cascade,tLog,tIndex)
    relatesTo = makerelatesTo(gun,gb,getCell,tLog,tIndex)  
    archive = makearchive(gun,gb,getCell,tLog,tIndex)
    unarchive = makeunarchive(gun,gb,getCell,tLog,tIndex)
    deleteNode = makedelete(gun,gb,getCell,tLog,tIndex)
    nullValue = makenullValue(gun)


  

    importData = makeimportData(gun, gb)
    handleConfigChange = makehandleConfigChange(gun,gb,getCell,cascade,solve,tLog)
    config = makeconfig(handleConfigChange)
    subscribeQuery = makesubscribeQuery(gb,setupQuery)
    retrieveQuery = makeretrieveQuery(gb,setupQuery)



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
                const value = data[key];
                if (key === baseID) {
                    let baseconfig = makeSoul({b:key,'%':true})
                    gun.get(baseconfig).on(function(gundata, id){
                        gunSubs[baseconfig] = true
                        let data = Gun.obj.copy(gundata)
                        delete data['_']
                        data.props = {}
                        data.groups = {}
                        data.relations = {}
                        let configpath = configPathFromSoul(id)
                        setMergeValue(configpath,data,gb)
                        setupTypesSubs(baseID)
                        //setupPropSubs(key)
                        triggerConfigUpdate(id)
                    })

                    let baseGrps = makeSoul({b:key,'^':true})
                    gun.get(baseGrps).on(function(gundata, id){
                        gunSubs[baseGrps] = true
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
    let isNode = path.includes('#')
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
        let isChild = false
        if(isNode){
            isChild = (ptype === 'child') ? true : false
        }
        out = nodeValueOpt(newPath, isChild)
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
        let {parent} = getValue(configPathFromChainPath(makeSoul({b,t})),gb)
        let allowNewFrom = !parent //if '' then true if 'value' then false
        if(!allowNewFrom){//is child table, but see if allowMultiple = true
            let {allowMultiple} = getValue(configPathFromChainPath(parent),gb)
            allowNewFrom = allowMultiple
        }
        return nodeChainOpt(testPath,true,allowNewFrom)
    }else if(RELATION_INSTANCE_NODE.test(testPath)){
        return nodeChainOpt(testPath,false)
    }else if(DATA_PROP_SOUL.test(testPath)){//is a nodeProp
        let {propType} = getValue(configPathFromChainPath(makeSoul({b,t,p})),gb)
        let isChild = (propType === 'child') ? true : false
        return nodeValueOpt(testPath,isChild)
    }else if(RELATION_PROP_SOUL.test(testPath)){//is a relationProp
        return nodeValueOpt(testPath,false)
    }else{
        throw new Error('Cannot decipher rowID given')
    }
}






//STATIC CHAIN OPTS
function gbaseChainOpt(){
    return {newBase, showgb, showcache, showgsub, showgunsub, solve, base, item: node}
}
function baseChainOpt(_path){
    return {_path, config: config(_path), newNodeType: newNodeType(_path), importNewNodeType: importNewNodeType(_path), relation,nodeType,group,newGroup: newGroup(_path),setAdmin: setAdmin(_path),addUser: addUser(_path)}
}
function groupChainOpt(base, group){
    return {_path:base, add: userAndGroup(base,group,true), remove:userAndGroup(base,group,false), chp:chp(base,group)}
}
function nodeTypeChainOpt(_path,isRoot){
    let out = {_path, config: config(_path), addProp: addProp(_path), addChildProp: addChildProp(_path), importData: importData(_path), subscribe: subscribeQuery(_path), retrieve: retrieveQuery(_path),prop,node}
    if(isRoot){
        Object.assign(out,{newNode: newNode(_path)})
    }
    return out
}
function relationChainOpt(_path){
    return {_path, config: config(_path), newRow: newNode(_path), newColumn: addProp(_path), importData: importData(_path),prop}
}

function propChainOpt(_path, propType, dataType){
    let out = {_path, config: config(_path)}
    if(['string','number'].includes(dataType) && propType === 'data'){
        out = Object.assign(out,{importChildData: importChildData(_path),propIsLookup:propIsLookup(_path)})
    }
    return out
}
function relationPropChainOpt(_path){
    let out = {_path, config: config(_path)}
    return out
}
function nodeChainOpt(_path, isData, allowNewFrom){
    let out = {_path, edit: edit(_path,false,false), retrieve: retrieveQuery(_path), subscribe: subscribeQuery(_path),archive: archive(_path),unarchive:unarchive(_path),delete:deleteNode(_path)}
    if(isData){
        Object.assign(out,{relatesTo:relatesTo(_path)})
    }
    if(allowNewFrom){
        Object.assign(out,{newFrom:newFrom(_path)})
    }
    return out
}
function nodeValueOpt(_path, isChild){
    let out = {_path, edit: edit(_path,false,false), clearValue:nullValue(_path)}
    if(isChild){
        Object.assign(out,{newNode:newNode(_path)})
    }
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
    const looksAtAddress = toAddress(inheritsNodeID,p)
    
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
        if(!upDeps[looksAtAddress])upDeps[looksAtAddress] = {[address]: true}
        else Object.assign(upDeps[looksAtAddress], {[address]: true})
    }
    function removeDep(){
        let oldDep = downDeps[address]
        if(oldDep && upDeps[oldDep]) delete upDeps[oldDep][address]
        if(oldDep) delete downDeps[address]
    }
}
function setupSub(soul, p){
    let sname = soul+'+'+p
    if(gunSubs[subname])return
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
    let {b,t,r,i} = parseSoul(nodeID)
    let address = makeSoul({b,t,r,i,p})
    let [from,v] = cache[address] || []//if it is inherited we want the value to go out to buffer

    if(v === undefined){
        cache.watch(address,handlePropDataChange)
    }
    if(newEnq || (from === address && value !== v)){//this is some sort of new/changed value
        cache[address] = value//should fire the watch cb
        return
    }
    function handlePropDataChange(address,getterVal){
        let [from,v] = getterVal
        let {p} = address
        let startAddress = (address === from) ? from : address
        let nodeID = removeP(startAddress)
        handleNewPropData(nodeID,p,v)
        checkDeps(startAddress)
        function checkDeps(changedAddress){
            let deps = upDeps[changedAddress]
            if(deps){
                for (const depAddr in deps) {
                    let nodeID = removeP(depAddr)
                    handleNewPropData(nodeID,p,v)
                    checkDeps(startAddress)//recur... until it can't
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
    let {b,t,r,i} = parseSoul(nodeID)
    let propPath = makeSoul({b,t,r,p})
    let {propType, dataType, format} = getValue(configPathFromChainPath(propPath),gb)
    let address = makeSoul({b,t,r,i,p})
    let [from, cVal] = cache[address] || []
    if(cVal !== undefined){
        if(!raw)cVal = formatData(format,propType,dataType,cVal)
        cb.call(this,cVal, from)
        return
    }
    getData(nodeID)
    function getData(soul){
        //if nodeID != proto nodeID, run getVar, after this
        let {b,t,r} = parseSoul(soul)
        let {dataType} = getValue(configPathFromChainPath(makeSoul({b,t,r,p})),gb)
        gun.get(soul).get(p, function(msg,eve){//check for existence only
            eve.off()
            let val = msg.put
            setupSub(soul,p)
            if([null,undefined].includes(val)){
                sendToCache(soul,p,null)
                cb.call(this,null,soul)
                return
            }else if(isEnq(val)){//will keep getting inherited props until we get to data.
                let inheritFrom = val.slice(1)
                sendToCache(soul,p,val)//put the lookup in cache
                getData(inheritFrom)
                return
            }
            //so we have data on this soul and this should be returned to the cb
            if(dataType === 'unorderedSet'){//this will be a full object
                let data = JSON.parse(JSON.stringify(val))
                let links = []
                for (const key in data) {
                    if(key === '_')continue
                    const obj = data[key];
                    if (typeof obj === 'object' && obj !== null) {//if current link
                        links.push(key) 
                    }
                }
                val = links
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
            sendToCache(soul,p,val)
            if(!raw)val = formatData(format,propType,dataType,val)
            cb.call(this,val, soul)
        })
    }
}
function getArray(nodeID,pval,cb){
    //nodeID should be !#$&
    let arrSoul = makeSoul(Object.assign(parseSoul(nodeID),{p:pval, '[':true}))
    let arr = [], hashes = {}, length = 0, err
    gun.get(arrSoul).get('length').get(function(msg,eve){
        eve.off()
        if(msg.put === undefined){
            done()
        }else{
            length = msg.put*1 //coerce to number incase it is a string
            getHashes()
        }

    })
    function getHashes(){
        if(length === 0 || length === NaN)done()
        let have = 0
        for (let i = 0; i < length; i++) {
            gun.get(arrSoul).get(i).get(function(msg,eve){
                eve.off()
                let h = msg.put
                if(msg.put === undefined){
                    h = NULL_HASH
                }
                addHash(h,i)
                have++
                if(have === length){
                    getValues()
                }
            })            
        }
    }
    function getValues(){
        let vals = Object.keys(hashes).length
        let done = 0
        for (const hash in hashes) {
            gun.get(arrSoul).get(hash).get(function(msg,eve){
                eve.off()
                const idxArr = hashes[hash];
                let value
                let json = msg.put
                if(json === undefined){
                    value = null
                }
                try {
                    value = JSON.parse(json)
                } catch (e) {
                    value = json //invalid json? shouldn't happen if gbase api is used
                }
                if(ISO_DATE_PATTERN.test(value)){//JSON takes a date object to ISO string on conversion
                    value = new Date(value)
                }
                for (const idx of idxArr) {//replace hash with value to all indices in the output array
                    arr[idx] = value
                }
                done++
                if(done === vals){
                    done()
                }
            })
        }
    }
    function done(){
        cb.call(cb,arr)
    }
    function addHash(hash,idx){
        let idxArr = hashes[hash]
        if(!Array.isArray(idxArr))idxArr = []
        idxArr.push(idx)
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
function flushSubBuffer(){
    let buffer = JSON.parse(JSON.stringify(subBuffer))
    subBuffer = {}
    bufferState = false
    console.log('flushing buffer', buffer)
    for (const base in gsubsParams) {
        let ts = gsubsParams[base]
        for (const tval in ts) {
            const subs = ts[tval];
            for (const subID in subs) {
                let tableBuffer = buffer[base][tval]
                if(tableBuffer){
                    let subParams = subs[subID]
                    handleSubUpdate(subID, subParams, tableBuffer)
                    console.log('Checking Sub:',subID)
                }
            } 
        }
    }
}
function parseRowSub(subParams,tableBuffer){
   
    let trigger = false
    let {allColumns,allRows} = subParams
    for (const rowID in tableBuffer) {
        if(trigger)break
        if(!allRows[rowID]){//only singular row of data,must find that row
            continue
        }
        const propObj = tableBuffer[rowID];
        for (const pval of allColumns) {
            if(propObj[pval] !== undefined){
                trigger = true
                break
            }
        }
    }
    return trigger
}
function parseTableSub(subParams,tableBuffer){
    let trigger = []
    let {allColumns} = subParams
    for (const rowID in tableBuffer) {
        const propObj = tableBuffer[rowID]; //get propArr from cache, it should be updated since this is running because the cache updated
        for (const pval of allColumns) {
            if(propObj[pval] !== undefined){
                trigger.push(rowID)
                break
            }
        }
    }
    return trigger
}

function handleSubUpdate(subID, subParams, tableBuffer){
    //subID = base/....,sval
    /* subParams
    {columns: {},
    type: row || table || li
    range: {idx,from,to} || false,
    query: [
        {search:[args]},
        {filter:[args]},
        {sort:[args]}]
        ] || false
    }
    */
    //this is called directly from .edit to see if this row meets any current subs
    let {type} = subParams

    let triggered
    if(type === 'row'){
        triggered = parseRowSub(subParams,tableBuffer)
    }else if(type === 'table'){//table
        triggered = parseTableSub(subParams,tableBuffer)
    }
    if(triggered){
        reQuerySub(subID,triggered)
    }
}
function newRowSubCheck(path){//never implemented??
    //this is also called directly from .edit(newRow:true) to see if this row meets any current subs
    let [base,tval] = path.split('/')
    let subs = getValue([base,tval],gsubs)
    for (const subID in subs) {
       reQuerySub(subID,newNode)
    }
}
function reQuerySub(subID,triggers,newRow){
    let [path,sID] = subID.split(',')
    let {b,t} = parseSoul(path)
    let {columns,range,query,userCB,allRows} = getValue([b,t,subID],gsubsParams)
    let q = Query(path,columns,range,query,userCB,true,sID, true)
    if(newRow && q.type !== 'row'){//redo range, to see if new row needs to be added to .rows for table or li subs
        getRange(q)
    }else{//something updated on a row already in .rows, update data in store, and return store
        q.allRows = Array.from(new Set(allRows))
        q.rows = Array.from(new Set(triggers))
        q.next()
    }
     

}
function handleNewPropData(rowID,pval,value){
    //parse gun soul and keys in data
    //console.log('handle new Data' ,soul)
    let cpath = bufferPathFromSoul(rowID,pval)
    setValue(cpath,value,subBuffer)
    if(!bufferState){
        bufferState = true
        setTimeout(flushSubBuffer, 250)
    }
}
function setupSub(qObj){
    //subParams will have rows object in it {range: {from,to,idx,items}, type: table,row,li, columns: {p0,p1,etc}, query: [qArr], userCB, allRows}
    let {subID,allRows,allColumns,range,type,columns,query,userCB,arrMap,data,output,needRows} = qObj
    let [path] = subID.split(',')
    let {b,t} = parseSoul(path)
    let subParams = {userCB,query,allRows,range,columns,type,allColumns,arrMap,last:output}
    console.log('setting up or updating sub: '+ subID)
    setValue([b,t,subID],subParams,gsubsParams)
    for (const soul in needRows) {
        for (const p of allColumns) {
            loadRowPropToCache(soul,p)
        } 
    }
}


//QUERY
function setupQuery(path,pvalArr,queryArr,cb,subscription, sVal){
    if(!(cb instanceof Function))throw new Error('Must provide a callback!')
    queryArr = queryArr || []
    let {i} = parseSoul(path)
    let {range,limit,query,format} = parseQuery(queryArr,pvalArr,path) //queryArr could be false if it is an ALL or a row
    let q = new Query(path,pvalArr,query,range,limit,format,cb,subscription,sVal)
    if(i){
        q.checkNodes = [path]  
    }
    console.log(q)
    q.run()
}
function getRange(qObj){
    //traverse the tRange and find all souls in the range.
    //once all souls are found fire qObj.next() in the callback.
    //let [base,tval] = qObj.table.split('/')
    //let {type} = getValue([base,'props',tval],gb)
    let {index,to,from,items} = qObj.range
    //let idx = index.split('/')
    console.log('Getting Range:', qObj.range)
    qIndex(index,function(data){
        //data is arr of souls
        qObj.allRows = Array.from(data)
        qObj.rows = Array.from(data)
        qObj.next()
    },items,from,to,false,true)
}

const parseSearch = (obj) =>{
    //obj = {SEARCH: ['String with spaces preserved']}
    let arg = obj.SEARCH[0]
    return {SEARCH: [String(arg)]}
}
const parseLimit = (obj) =>{
    //obj = {LIMIT: [10]}
    let arg = obj.LIMIT[0]
    if(isNaN(arg))throw new Error('Limit argument must be a number. {LIMIT:[Number()]}')
    return arg*1
}
const parseFormat = (obj) =>{
    //obj = {FORMAT: [FALSE]}
    let arg = obj.FORMAT[0]
    return !!arg
}
let validFilterFN = ['ABS','SQRT','MOD','CEILING','FLOOR','ROUND','INT','COUNT','NOT','T', 'AND', 'OR','TRUE','FALSE']
const parseFilter = (obj,colArr) =>{
    //obj = {FILTER: ['FN string']}
    //fnString = '{p2} > 3'
    let [fnString] = obj.FILTER
    let colRef = /\{(p[0-9/.]+)\}/gi
    let hasCompare = /[<>=!]/g.test(fnString)
    if(!hasCompare)throw new Error('Must have at least (and only) one comparison operator! Valid operators: <, >, <=, >=, =, !=')
    let found = []
    let match
    while (match = colRef.exec(fnString)) {
        let replace = match[0]
        let pval = match[1]
        found.push(pval)
    }
    let fnSearch = /[A-Z]+(?=\(.+?\))/g
    let fn
    while (fn = fnSearch.exec(fnString)) {
        let FN = fn[0]
        if(!validFilterFN.includes(FN))throw new Error('Invalid FN used inside of "FILTER". Valid FNs :' + validFilterFN.join(', '))
    }
    basicFNvalidity(fnString)
    if(found.length !== 1){
        throw new Error('Can only reference a single column')
    }
    if(!colArr.includes(found[0])) throw new Error('Must include column in your return if you are using it in FILTER')
    return obj
}
const parseRange = (obj,traverseFormat) =>{
    //obj = {RANGE: [tIndex,from,to,items,dir,relativeTime,__toDate,last__,firstDayOfWeek]}
    //MUST have some sort of timeIndex
    //Needs to end up with a from, to, items
    //from and to must be date obj or unix time
    if(!obj.RANGE)return false
    let [tIndex,from,to,items, dir, relativeTime, __toDate,last__,firstDayOfWeek] = obj.RANGE
    let out = {}
    if(!tIndex || !PROPERTY_PATTERN.test(tIndex)){
        throw new Error('Must specify a valid time index in order to find data. Must be !#, !#. or !-. index pattern')
    }
    out.index = tIndex
    dir = dir || '<'
    if(dir !== '<' && dir !== '>')throw new Error('invalid direction sign. ">" starts at the earlier date, "<" most recent')
    out.dir = dir
    if((from || to) && (__toDate || last__ || relativeTime))throw new Error('Too many arguments in RANGE. use "from" & "to" OR "toDate" OR "last" OR "relavtiveTime"')
    if(firstDayOfWeek){
        if(isNaN(firstDayOfWeek)){
            throw new Error('Invalid first day of week. Must be a number between 0-6. Sunday = 0')
        }
    }else{
        firstDayOfWeek = 0
    }
    if(__toDate && !last__){
        let valid = ['year','month','week','day']
        if(!valid.includes(__toDate.toLowerCase()))throw new Error('toDate preset only accepts: '+ valid.join(', '))
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth()
        let dayOfMonth = now.getDate()
        let dayOfWeek = now.getDay()
        switch (__toDate.toLowerCase()) {
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
    }else if(!__toDate && last__){
        let valid = ['year','quarter','month','week','day']
        if(!valid.includes(last__.toLowerCase()))throw new Error('"last" preset only accepts: '+ valid.join(', '))
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth()
        let dayOfMonth = now.getDate()
        let dayOfWeek = now.getDay()
        switch (last__.toLowerCase()) {
            case 'year':
                from = new Date(year-1,0)
                to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                break;
            case 'quarter':
                let current = (month + 1)/3
                if(current <=1){//q1
                    from = new Date(year-1,8)
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
            default:
                break;
        }
    }
    if(relativeTime){
        //Number() + ...
        //y = year (relative date, from: -365days to: Infinity)
        //m = month (-Number() * 30 days?) not fixed length...
        //w = week (-Number() * 7days)
        //d = day (-Number() of days)
        //h = hours (-Number() of hours)
        let valid = 'ymwdh'
        let num = relativeTime.slice(0,relativeTime.length-1)*1
        let unit = relativeTime[relativeTime.length-1]
        if(isNaN(num))throw new Error('If you are specifiying a relative time it should be some number with a single letter specifying units')
        if(!valid.includes(unit.toLowerCase()))throw new Error('Invalid unit. Must be one of: y, m, w, d, h. (year, month, week, day, hour)')
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth()
        let dayOfMonth = now.getDate()
        let curHour = now.getHours()
        let fromDate = new Date()
        to = Infinity
        switch (unit) {
            case 'y':
                from = fromDate.setFullYear(year-num)
                break;
            case 'm':
                from = fromDate.setMonth(month-num)
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
            default:
                break;
        }

    }
    
    if(items){
        if(isNaN(items))throw new Error('If specifying max items, it must be a number')
        out.items = items*1
    }else{
        out.items = Infinity
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
    if(traverseFormat){
        return out
    }else{
        return {RANGE:[out.index,out.from,out.to]}
    }
}
const validCypher = ['MATCH']
const parseCypher = (obj,path) =>{
    let args = obj.CYPHER
    let {b} = parseSoul(path)
    let out = []
    const evaluate = {
        MATCH: function(str){
            //assign id's to each () [] or use user var
            //then parse thing by thing
            let q = {}
            str = str.replace(/(\(|\[)([a-zA-Z]+)?/g, function(match, $1, $2) {//assign id's to those that user didn't already do
                let o = ($1 === '(') ? new MatchNode() : new MatchRelation()
                if ($2) {
                    q[$2] = o
                  return match
                }else{
                    id = rand(8,'abcdefghijklmnopqrstuvwxyz')
                    q[id] = o
                  return match+id
                }
            });
            str = str.replace(/(\(|\[)([a-zA-Z]+:)([a-zA-Z:\`|\s]+)/g, function(match, $1, $2, $3) {//find gbID's for aliases of types,relations,labels
                let isNode = ($1 === '(')
                let splitChar = (isNode) ? ':' : '|'
                let aliases = [...$3.split(splitChar)]
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
                    if(id === undefined)throw new Error('Cannot parse alias for '+$3+' Alias: '+alias)
                    ids.push(id)
                    i++
                }
                return $1+$2+ids.join(splitChar)
            });
            //on parse...
            //we need to get each 'thing' put in to it's object
            //if this is more than a simple (), then all 3 (or more..) things will effect each other.
            //need to figure out direction, *pathLength
            //once everything is done, score all elements
            //return

            function rmvBT(s){
                return s.replace(/`([^`]*)`/g, function(match,$1){
                    if($1)return $1
                    return match
                })
            }
            function MatchNode(){
                this.isNode = true
                this.types = []
                this.labels = []
                this.filters = []
                this.ranges = []
                this.search = ''
                this.rTypes = []
                this.rDirs = []
                this.score = 0
                this.output = false
                this.ID = ''
                this.rID = ''

            }
            function MatchRelation(){
                this.isNode = false
                this.types = []
                this.filters = []
                this.ranges = []
                this.search = ''
                this.srcTypes = []//redundant on undirected match
                this.trgtTypes = []
                this.src = ''//only used with directed match
                this.trgt = ''
                this.score = 0
                this.output = false
                this.ID = ''
            }
        }
    }
    for (let arg of args) {
        arg = arg.replace(/([^`]+)|(`[^`]+`)/g, function(match, $1, $2) {//remove whitespace not in backticks
            if ($1) {
                return $1.replace(/\s/g, '');
            } else {
                return $2; 
            } 
        });
        let t
        arg = arg.replace(/([A-Z]+)/, function(match, $1) {//find and remove command ie: MATCH
            if ($1) {
            t = match
                return ''
            }
        });
        if(!validCypher.includes(t))throw new Erro('Invalid Cypher command. Valid include: '+validCypher.join(', '))
        out.push(evaluate[t](arg))

    }
    

}
function parseSort(obj,colArr){
    //obj = {SORT: [pval, asc || dsc]}
    let [pval, dir] = obj.SORT
    let out = []
    if(pval){
        if(colArr.includes(pval)){
            out.push(pval)
        }else{
            throw new Error('Must include the column used in SORT in the result')
        }
    }else{
        throw new Error('Must specifiy a column with SORT parameter')
    }
    if(dir && (dir === 'asc' || dir === 'dsc')){
        out.push(dir)
    }else{
        dir = 'asc'
        out.push(dir)
    }
    return {FILTER: out}
}
function parseGroup(obj,colArr){
    //obj = {GROUP: [pval]}
    let pval = obj.GROUP[0]
    let out = []
    if(pval){
        if(colArr.includes(pval)){
            out.push(pval)
        }else{
            throw new Error('Must include the column used in GROUP in the result')
        }
    }else{
        throw new Error('Must specifiy a column with GROUP parameter')
    }

    return {GROUP: out}
}
function parseQuery(qArr,colArr,path){
    //qArr optional, if none specified, range is ALL
    //if qArr, if RANGE: parseRange(), if FILTER: checkFunction(), ...rest: validate args
    let query = []
    let timeRanges = []
    let range
    let limit
    let format
    for (const qArgObj of qArr) {
        if(!Array.isArray(Object.values(qArgObj)[0]))throw new Error('Query arguments must be in an array: [{SEARCH:["String"]}]')
        if(qArgObj.SEARCH){
            query.push(parseSearch(qArgObj))
        }else if(qArgObj.FILTER){
            query.push(parseFilter(qArgObj,colArr))
        }else if(qArgObj.RANGE){
            timeRanges.push(parseRange(qArgObj,true))
            query.push(parseRange(qArgObj,false))
        }else if(qArgObj.LIMIT){
            if(limit)throw new Error('Can only define a single limit per query')
            limit = parseLimit(qArgObj)
        }else if(qArgObj.FORMAT){
            format = parseFormat(qArgObj)
        }else if(qArgObj.CYPHER){
            format = parseCypher(qArgObj,path)
        }
    }
    if(!timeRanges.length){//will eventually need to figure out how to make this work for relationships as well...
        let{b,t} = parseSoul(path)
        range = parseRange({RANGE:[makeSoul({b,t})]},true)//get created
    }else{//this should still work for relationships
        //timeRanges [{index,to,from,dir}]
        //Pick one that has the smallest to-from delta?? Not sure how to pick the shortest list without more queries...
        //however that would be probably worth it when we implement relationships
        //complex queries will want to start with the narrowest set of potential matches to start
        //so a few extra lookups could save hundreds of queries
        range = timeRanges.sort((a,b)=>(a.to-a.from)-(b.to-b.from))[0]
    }
    if(format === undefined)format = true
    return {range,limit,query,format}
}
function gatherData(qObj){//NEEDS UPDATE FOR NEW CACHE
    let {allColumns, rows, reQuery} = qObj
    console.log('Gathering Data; Rows: '+ rows.length + ' Columns: '+allColumns.join(', '))
    for (const rowID of rows) {
        let cpath = cachePathFromRowID(rowID)
        let propArr = getValue(cpath,cache)
        if(propArr && propArr.length >= allColumns.length && !propArr.includes(undefined)){
            qObj.data[rowID] = Array.from(propArr)
            qObj.isRowDone(rowID,true)
        }else{
            for (const pval of allColumns) {
                if (pval !== null){
                    getRowProp(qObj,rowID,pval)
                }else{
                    addDataToQobj(rowID,pval,null,qObj)//fill archived or deleted indices with non-undefined value
                }
                
            }
        }
    }
}
function Query(path, colArr, qArr, tRange, limit, format, cb, isSub, sVal){
    this.soulObj = parseSoul(path)
    let {b,t} = this.soulObj
    let idx = tRange.index //should be a !#. or !-. soul
    if(idx === 'created'){
        tRange.index = makeSoul({b,t})
    }

    
    this.type = (this.soulObj.i) ? 'row' : 'table'
    this.allActiveProps = getAllActiveProps(gb,path)
    this.returnProps = colArr || this.allActiveProps
    this.subID = (sVal) ? path + ',' + sVal : path + ',' + rand(4)
    let {arrMap,last} = getValue([b,t,this.subID],gsubsParams) || {arrMap: false,last:[]}
    this.reQuery = (arrMap === false) ? false : true
    this.arrMap = arrMap || {}
    this.last = last
    this.subscribe = !!isSub
    this.range = tRange
    this.limit = limit || Infinity
    this.format = (format === undefined) ? true : format
    this.userCB = cb
    //let columns = colArr
    this.propsToGet = (qArr.filter(o => o.SEARCH).length) ? this.allActiveProps : this.returnProps //will break if FILTERed on pval not in colArr, currently throws error
    //this.allRows = []//total rows currently in this.range
    this.checkNodes = []// this.rows  rows to look for on THIS query, allRows !== rows when data has been edited on row in allRows
    this.evaluated = []
    this.query = qArr
    //arrMap = arrMap || {}
    this.retrievedCols = {}//to know if all rowIDs in this.rows has allColumns
    this.completedRows = []//probably don't need now
    this.data = {}
    this.output = last //? change? If already in cache, could just recompute all.. memory vs speed...
    this.callStack = []
    this.nextBlock = (this.range.dir === '<') ? this.range.to : this.range.from
    this.chron = (this.range.dir === '<') ? false : true
    this.curNode = []
    this.start = function(){
        if(this.checkNodes.length && this.reQuery){//use the range provided (can be added after creation; ie on data change)
            this.callStack.push(['getNode',[null]])
        }else{
            this.callStack.push(['getMoreSouls', [null]])
            this.callStack.push(['getNode',[null]])
            this.run()
        }
       
    }
    this.getMoreSouls = function(){
        let self = this
        crawlIndex(this.range.index,this.nextBlock,this.chron,function(idArr,next){
            //blockArr = [[soul,unix],[soul,unix]]
            self.nextBlock = next
            self.checkNodes = idArr
            self.run()
        })

    }
    this.getNode = function(){
        this.callStack.unshift(['evaluateNode',[null]])
        let self = this
        let i = 0
        let toGet = this.propsToGet.length
        let id = this.checkNodes[0]
        for (const pval of this.propsToGet){
            getCell(id,pval,function(data){
                self.curNode[i] = data
                toGet--
                if(!toGet){
                    self.run()
                }
            },true)
            i++
        }
    }
    this.evaluateNode = function(){
        let id = this.checkNodes[0]
        let i = this.arrMap[id]
        this.evaluated[id] = true
        let pass = false
        if(this.testRowAgainstQuery()){
            pass = true
            let out
            if(this.allActiveProps === this.returnProps){
                out = this.curNode.slice()
            }else{
                for (const p of this.returnProps) {
                    let i = this.propsToGet.indexOf(p)
                    out.push(this.curNode[i])
                }
            }


            out.id = id
            out.propIDs = []
            out.alias = []
            let s = parseSoul(id)
            let j = 0
            let {props} = getValue(configPathFromChainPath(id),gb)
            for (const p of this.returnProps) {
                let {format:formatData, propType, dataType, alias} = props[p]
                if (this.format && formatData !== ''){
                    out[j] = formatData(formatData,propType,dataType,out[j])
                }
                out.propIDs.push( makeSoul(Object.assign({},s,{p})))
                out.alias.push(alias)
                j++
            }
            
            if(!i) i = this.output.length
            this.arrMap[id] = i
            this.output[i] = out
        }else if(i){
            this.arrMap[id] = false
            this.output[i] = null
        }
        this.checkNodes.shift()
        this.curNode = []
        
        if(!this.reQuery && (this.checkNodes.length || this.nextBlock) && this.output.length < this.limit){
            if(pass){}//if we want to add a 'check' relations or something...need to not add output just yet (if pattern matching)
            this.callStack.unshift(['getNode',[null]])
            this.run()
        }else{

        }

        


    }
    this.evaluateNode = function(){

    }
    this.qParams = function(){
        return {range, type, columns, query, userCB, allRows}
    }
    this.isRowDone  = function(rowID,forceDone){
        let rowDone = forceDone || false
        if(!rowDone){
            let propArr = retrievedCols[rowID]
            rowDone = (propArr.length === allColumns.length) ? true : false
        }
        if(rowDone){
            completedRows.push(rowID)
            if(completedRows.length === rows.length){
                done()
            }
        }
    }
    this.testRowAgainstQuery = function(){ //really this is just the query check on the row, doesn't matter if it's new or old
        let pass = true
        let propArr = this.curNode
        for (const q of this.query) {
            if(!pass)break
            let qType = Object.keys(q)[0]
            let qArgArr = q[qType]
            if(['SORT','FILTER'].includes(qType))continue
            if(qType === 'SEARCH'){
                let reg = regexVar('~', qArgArr[0],'gi')
                let searchPass = false
                for (const val of propArr) {
                    if(reg.test(val)){
                        searchPass = true
                        break
                    }
                }
                pass = searchPass
            }else if(qType === 'FILTER'){
                let colRef = /\{([a-z0-9]+)\}/gi
                let fnString = qArgArr[0].slice()
                while (match = colRef.exec(fnString)) {
                    let [replace,pval] = match
                    let valIdx = columns.indexOf(pval)
                    let val = propArr[valIdx]
                    fnString = fnString.replace(replace,val)
                }
                let fnResolved = evaluateAllFN(fnString)
                pass = findTruth(fnResolved,true)
            }else if(qType === 'RANGE'){ //should only have index,from,to
                let [index, from, to] = qArgArr
                //index should be some sort of valid path string
                //from, to will already be unix times of +/-Infinity
                let {p} = parseSoul(index)
                if(!p){//created index, this will need to change if on a relationship
                    let {i} = parseSoul(this.checkNodes[0])
                    let [id,created] = i.split('_')
                    if(created <= from || created >= to){//created or edited is outside of range
                        return false
                    }
                }else{
                    let idxPval = this.propsToGet.indexOf(p)
                    let valDate = new Date(propArr[idxPval]).getTime()
                    if(valDate <= from || valDate >= to){//date column idx specified is outside of range
                        return false
                    }
                }
            }
        }
        if(pass){
            return true
        }else{
            return false
        }

    }
    this.done = function(){//really only returns the data since new function will check the query.
        console.log('Query Done, returning data')
        let rows = this.rows
        let added = false, removed = false
        if(this.type !== 'row'){
            if(this.reQuery){
                for (const rowID of rows) {
                    let propArr = this.data[rowID]
                    let pass = testRowAgainstQuery(propArr,qParams)
                    if(pass && arrMap[rowID] === undefined){//add row to output
                        added = true
                        let i = output.length
                        arrMap[rowID] = i
                        output.push([rowID, pass])
                    }else if(!pass && allRows.includes(rowID)){//remove row from allRows, last
                        removed = true
                        let i = arrMap[rowID]
                        output.splice(i,1)
                        delete arrMap[rowID]
                    }else if(pass){//not added or removed, updated
                        let i = arrMap[rowID]
                        output[i][1] = pass
                    }
                }
                if(removed){
                    let j = 0
                    for (const el of output) {
                        let [rowid] = el
                        arrMap[rowid] = j
                        j++
                    }
                }
            }else{
                added = true
                if(output.length)throw new Error('First query should have no previous output')
                for (const rowID of rows) {
                    let propArr = data[rowID]
                    let pass = testRowAgainstQuery(propArr,qParams)
                    if(pass){
                        let i = output.length
                        arrMap[rowID] = i
                        output.push([rowID, pass])
                    }
                }
            }
        }else{//return row
            output = []
            for (const rowID of rows) {
                let propArr = data[rowID]
                
                for (const pval of columns) {
                    let idx = pval.slice(1)
                    output.push(propArr[idx])
                }
            }
        }
        if(subscribe){
            util.setupSub()
        }
        if(type === 'row' || added || removed || reQuery){
            console.log('Returning query to cb on subID: '+subID)
            userCB.call(this,output,columns)
        }
        
    }
    this.throwError = function(errmsg){
        let err = this.err
        let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = error
        console.log(error)
        this.userCB.call(this,error)
    }
    this.run = function(){
        if(this.err)return
        if(this.callStack.length){
            let [fn, args] = this.callStack[0]
            this.callStack.shift()
            this[fn](...args)
        }else{
            this.done()
        }
    }
    
    this.callStack.push(['start',[null]])
    //current query flow:
    //get valid range of souls, order them by this.range.dir (in case of items) set this to this.allRows
    //get one node at a time, validate once all props are received, if pass add to this.rows, check items limit
    //  going node by node will allow us to implement patter matching a little easier later?
    
    
}
function addDataToQobj(rowID, pval, data, qObj){
    let idx = pval.slice(1)
    if(!Array.isArray(qObj.data[rowID]))qObj.data[rowID] = []
    if(!Array.isArray(qObj.retrievedCols[rowID]))qObj.retrievedCols[rowID] = []
    qObj.data[rowID][idx] = data
    qObj.retrievedCols[rowID].push(pval)
    qObj.isRowDone(rowID)
}
function getRowProp(qObj, rowID, pval){//NEEDS UPDATE FOR NEW CACHE, USE getCell???
    let {b,t,r,i,f} = parseSoul(rowID)
    let p = pval
    let dataType = (t) ? getDataType(gb,makeSoul({b,t,p})) : getDataType(gb,makeSoul({b,r,p}))//rowID will only have one or other
    let propSet = (t) ? makeSoul({b,t,p,i,f}) : makeSoul({b,r,p,i,f})
    let nodeSoul = (t) ? makeSoul({b,t,i,f}): makeSoul({b,r,i,f})
    let subname = nodeSoul+'+'+p

    if(dataType === 'set' && !gunSubs[propSet]){//may already be subd from rowprops
        gun.get(propSet, function(msg,eve){//check for existence only
            eve.off()
            qObj.needRows[rowID] = true
            if(msg.put === undefined){
                addDataToQobj(rowID,pval,[],qObj)
            }else{
                let links = []
                for (const key in msg.put) {
                    if(key === '_')continue
                    const torf = msg.put[key];
                    if (torf) {//if current link
                        links.push(key) 
                    }
                }
                addDataToQobj(rowID,pval,links,qObj)
            }
        })      
    }else if(!gunSubs[subname]){
        gun.get(nodeSoul).get(p, function(msg,eve){//check for existence only
            eve.off()
            qObj.needRows[rowID] = true
            if(msg.put === undefined){
                addDataToQobj(rowID,pval,null,qObj)
            }else{
                addDataToQobj(rowID,pval,msg.put,qObj)
            }
        })
    }else{//do nothing, gun is already subscribed and cache is updating
        let val = getRowPropFromCache(cachePathFromRowID(rowID,pval),cache)
        addDataToQobj(rowID,pval,val,qObj)
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







//REACT STUFF
function loadGBaseConfig(cb){
    reactConfigCB = cb

}



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
    clientLeft
}