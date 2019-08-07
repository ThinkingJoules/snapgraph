"use strict";
import Gun from ('gun')
const {
    configPathFromChainPath,
    gbForUI,
    gbByAlias,
    setValue,
    getValue,
    makeSoul,
    parseSoul,
    ISO_DATE_PATTERN,
    ALL_INSTANCE_NODES,
    DATA_INSTANCE_NODE,
    RELATION_INSTANCE_NODE,
    DATA_ADDRESS,
    RELATION_ADDRESS,
    INSTANCE_OR_ADDRESS,
    isEnq,
    toAddress,
    gunGet,
    IS_STATE_INDEX,
    removeP,
    IS_CONFIG,
    IS_CONFIG_SOUL,
    TIME_INDEX_PROP,
    ALL_ADDRESSES,
    StringCMD,
} = require('./util.js')
let gbGet


const {
    basicFNvalidity,
    gbGet:rawgbGet,
}= require('./configs')
const makegbGet = rawgbGet(gb)

const {makenewBase,
    makenewNodeType,
    makeaddProp,
    makenewNode,
    makenewFrom,
    makeconfig,
    makeedit,
    makeimportNewNodeType,
    makeshowgb,
    makeshowcache,
    makeshowgsub,
    makeshowgunsub,
    makeperformQuery,
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
    makeaddressGet,
    makekill,
    makegetConfig,
    makeaddLabel,
    makeimportRelationships,
    makeperformExpand
} = require('./chain_commands')
let newBase,newNodeType,addProp,newNode,config,edit,nullValue,relatesTo
let importNewNodeType,archive,unarchive,deleteNode,newFrom
let performQuery,setAdmin,newGroup,addUser,userAndGroup,chp
let typeGet, nodeGet, addressGet, getConfig,addLabel, importRelationships,performExpand
const showgb = makeshowgb(gb)
const showcache = makeshowcache(cache)
const showgunsub = makeshowgunsub(gunSubs)


const {makesolve} = require('../function_lib/function_utils');
let solve


const {timeIndex,
    queryIndex,
    timeLog,} = require('../chronicle/chronicle')
let qIndex,tIndex,tLog

function Snap(o){
	if(!(this instanceof Snap)){ return new Snap(o) }
	this._ = {}
    let root = this._
    root.graph = root.graph || {};
    root.ask = root.ask || Snap.ask;
    root.dup = root.dup || Snap.dup();
    root.sg = {} //formerly gb
    root.subs = {addrSubs:{},nodeSubs:{},querySubs:{},configSubs:{}}//this will probably change since my architecture changed...
    root.inherit = {up:{},down:{}} //was upDeps, downDeps
    Object.assign(this,snapChainOpt(this))

    let nodeStatesBuffer = {}
    let stateBuffer = true
    let gbBases = []
    const kill = makekill(querySubs,configSubs,killSub)
    const showgsub = makeshowgsub(querySubs,addrSubs,nodeSubs,configSubs)
}
Snap.ask = require('./ask');
Snap.dup = require('./dup');


function snapChainOpt(snap){
    return {snap,
        newBase, 
        showgb, 
        showcache, 
        showgsub, 
        showgunsub, 
        solve, 
        base, 
        node: node(),
        ls:ls(),
        help:chainHelp(),
        getConfig: getConfig(),
        kill:kill()
    }
}
function baseChainOpt(_path){
    return {_path,
        ls:ls(_path),
        help:chainHelp(_path),
        kill:kill(_path), 
        config: config(_path), 
        subscribeQuery: performQuery(_path,true), 
        subscribeExpand: performExpand(_path,true),
        retrieveQuery: performQuery(_path,false), 
        retrieveExpand: performExpand(_path,false),
        newNodeType: newNodeType(_path,'t'), 
        newRelation: newNodeType(_path,'r'), 
        importNewNodeType: importNewNodeType(_path), 
        newGroup: newGroup(_path),
        setAdmin: setAdmin(_path),
        addUser: addUser(_path),
        getConfig: getConfig(_path),
        addLabel: addLabel(_path),
        
        relation:nodeType(_path,false),
        nodeType:nodeType(_path,true)
    }
}
function nodeTypeChainOpt(_path,isNode){
    let out = {_path,
        ls:ls(_path),
        help:chainHelp(_path),
        kill:kill(_path), 
        config: config(_path), 
        addProp: addProp(_path), 
        subscribe:typeGet(_path,true),
        retrieve:typeGet(_path,false),
        getConfig: getConfig(_path),

        prop:prop(_path),
        node:node(_path)
    }

    if(isNode){
        Object.assign(out,{newNode: newNode(_path)})
    }
    if(!isNode){
        Object.assign(out,{importRelationships: importRelationships(_path)})
        
    }

    return out
}
function propChainOpt(_path){
    let out = {_path,
        kill:kill(_path), 
        config: config(_path),
        subscribe:typeGet(_path,true),
        retrieve:typeGet(_path,false),
        getConfig: getConfig(_path)
    }
    // if(['string','number'].includes(dataType) && propType === 'data'){
    //     out = Object.assign(out,{importChildData: importChildData(_path),propIsLookup:propIsLookup(_path)})
    // }
    return out
}
function nodeChainOpt(_path, isData){
    let out = {_path,
        kill:kill(_path), 
        edit: edit(_path,false,false), 
        retrieve: nodeGet(_path,false), 
        subscribe: nodeGet(_path,true),
        archive: archive(_path),
        unarchive:unarchive(_path),
        delete:deleteNode(_path),
        getConfig: getConfig(_path),

        prop:prop(_path)
    }
    if(isData){
        Object.assign(out,{relatesTo:relatesTo(_path),newFrom:newFrom(_path)})
    }
    return out
}
function nodeValueOpt(_path){
    return {_path,
        kill:kill(_path), 
        edit: edit(_path,false,false),
        subscribe: addressGet(_path,true),
        retrieve:addressGet(_path,false), 
        clearValue:nullValue(_path),
        getConfig: getConfig(_path)
    }
}





 export const Snap = (function(opts){
    








    //CHAIN CONSTRUCTORS
    const base = (function(base){
        //check base for name in gb to find ID, or base is already ID
        //return baseChainOpt
        let bases = Object.keys(gb)
        if(base === undefined && bases.length == 1)base = bases[0]
        if(!base) throw new Error('You must specify a baseID to use as context!')
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
    });
    base.help = function(){
        let summary = 
        `
        Used to move your chain context to a particular base.
        `
        let table = {firstArg:{what:'ID or Alias',type:'string'}}

        console.warn(summary)
        console.table(table)
    }
    const nodeType = (path,isNode) =>{
        const f = (function(label){
            //check base for name in gb to find ID, or base is already ID
            //return depending on table type, return correct tableChainOpt
            let {b} = parseSoul(path)
            let sym = (isNode) ? 't' : 'r'
            let under = (isNode) ? 'props' : 'relations'
            let thingType = makeSoul({b,[sym]:label})
            let id
            let tvals = gb[b][under]
            let check = getValue(configPathFromChainPath(thingType),gb)
            if(check !== undefined){
                id = label
            }else{
                for (const tval in tvals) {
                    const {alias,parent} = tvals[tval];
                    if(label === alias){
                        id = tval
                        break
                    }
                }
            }
            if(!id){
                throw new Error('Cannot find corresponding ID for alias supplied')
            }
            let out
            let newPath = makeSoul({b,[sym]:id})
            out = nodeTypeChainOpt(newPath, isNode)

            return out
        });
        f.help = function(){
            let summary = 
            `
            Used to move your chain context to a particular type of Node (Not a relationship!).
            `
            let table = {firstArg:{what:'ID or Alias',type:'string'}}
        
            console.warn(summary)
            console.table(table)
        }
        return f
    }
    const prop = (path) =>{
        const f = (function(prop){
            //check base for name in gb to find ID, or base is already ID
            //return depending on table type, return correct columnChainOpt
            let pathO = parseSoul(path)
            let {b,t,r,i} = pathO
            let id
            let {props:pvals} = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb)
            for (const pval in pvals) {
                const {alias} = pvals[pval];
                if(prop === alias || prop === pval){
                    id = pval
                    break
                }
            }
            if(!id){
                throw new Error('Cannot find corresponding ID for prop alias supplied')
            }
            let out
            let newPath = makeSoul(Object.assign(pathO,{p:id}))
            if(!i){
                out = propChainOpt(newPath)
            }else{//called prop from snap.node(ID).prop(name)
                out = nodeValueOpt(newPath)
            }
            return out
        });
        f.help = function(){
            let summary = 
            `
            Used to move your chain context to a particular property of your current context.
            `
            let table = {firstArg:{what:'ID or Alias',type:'string'}}
        
            console.warn(summary)
            console.table(table)
        }
        return f
    }
    const node = (path) =>{
        const f = (function(nodeID){
            //can be with just id of or could be whole string (!#$ or !-$)
            //can someone edit !-$ directly? I don't think so, should use the correct relationship API since data is in 3 places (each node, and relationship node)
            let testPath = nodeID
            if(path){//only if coming from base.nodeType.node
                if(!INSTANCE_OR_ADDRESS.test(nodeID)){
                    testPath = parseSoul(path)
                    Object.assign(testPath,{i:testPath})
                    testPath = makeSoul(testPath)
                } 
            }
    
            if(DATA_INSTANCE_NODE.test(testPath)){
                return nodeChainOpt(testPath,true)
            }else if(RELATION_INSTANCE_NODE.test(testPath)){
                return nodeChainOpt(testPath,false)
            }else if(DATA_ADDRESS.test(testPath)){//is a nodeProp
                return nodeValueOpt(testPath)
            }else if(RELATION_ADDRESS.test(testPath)){//is a relationProp
                return nodeValueOpt(testPath)
            }else{
                throw new Error('Cannot decipher rowID given')
            }
        });
        f.help = function(){
            let summary = 
            `
            Used to select a specific node OR property on a node (address)
            `
            let table = {'1st Arg, Opt 1':{what:'NodeID (!#$,!-$)',type:'string'},'1st Arg, Opt 2':{what:'Address (!#.$,!-.$)',type:'string'}}
        
            console.warn(summary)
            console.table(table)
        }
        return f
    }

    //STATIC CHAIN OPTS
    


})










function dumpStateChanges(){
    let buffer = Object.assign({}, nodeStatesBuffer)
    nodeStatesBuffer = {}
    stateBuffer = !stateBuffer
    sendToSubs(buffer)
}

function sendToSubs(buffer){
    for (const baseid in querySubs) {
        if(!buffer[baseid])continue
        const subO = querySubs[baseid];
        for (const sVal in subO) {
            const qParams = subO[sVal];
            qParams.newStates(buffer[baseid])   
        }
    }
    
}
function incomingPutMsg(msg,soul){//wire listener should get all emitted puts (either from us, or from other peers)
    if(msg && msg.put){
        soul = (soul !== undefined) ? soul : Object.keys(msg.put)[0]
        let putObj = msg.put[soul]
        if(IS_STATE_INDEX.test(soul)){//watching for a change on an index
            let stateAlias = {true:'active',false:'archived',null:'deleted'}
            for (const nodeID in putObj) {
                let {b} = parseSoul(nodeID)
                const state = putObj[nodeID];
                let toBuffer = stateAlias[state]
                setValue([b,nodeID],toBuffer,nodeStatesBuffer)
            }
            if(stateBuffer){
                stateBuffer = !stateBuffer
                setTimeout(dumpStateChanges,50)
            }
        }else if(!/\/UP$/.test(soul) && !TIME_INDEX_PROP.test(soul) && INSTANCE_OR_ADDRESS.test(soul) && !msg['@']){//watching for incoming data
            if(ALL_INSTANCE_NODES.test(soul)){//non-unorderedSet values
                for (const p in putObj) {
                    if(p === '_')continue
                    let addr = toAddress(soul,p)
                    let cVal = cache.get(addr)
                    //console.log('INC DATA; Cache is..',cVal)
                    if(cVal === undefined)continue //nothing is subscribing to this value yet, ignore
                    const v = putObj[p];
                    if(cVal === v)continue //value is unchanged, do nothing
                    let isSet = (typeof v === 'object' && v !== null && v['#'])
                    if(!isSet)sendToCache(soul,p,v)//value changed, update cache; sendToCache will handle Enq dependencies
                    let subs = addrSubs[addr]
                    console.log('NEW ADDR CACHE VALUE:',v, {subs})
                    if(subs === undefined)continue //no current subscription for this addr
                    
                    if(isEnq(v) || isSet)getCell(soul,p,processValue(addr,subs),true,true)//has subs, but value isEnq, get referenced value, then process subs
                    else processValue(addr,subs)(v,addr)//value is a value to return, process subs with value available
                }
            }else if(ALL_ADDRESSES.test(soul)){//this is an unorderedSet, soul is the address
                let cVal = cache.get(soul)
                console.log('INCOMING ADDRESS/SET',soul,putObj,cVal)

                if(cVal === undefined)return //nothing is subscribing to this value yet, ignore
                let v = (Array.isArray(cVal)) ? new Set(cVal) : new Set()
                for (const item in putObj) {
                    if(item == '_')continue
                    const boolean = putObj[item];
                    if(boolean)v.add(item) //added something to the set that wasn't there before
                    else if(!boolean && v.has(item))v.delete(item) //removed something that was previously in the set
                }
                v = [...v]
                let [s,p] = removeP(soul)
                sendToCache(s,p,v)//value changed, update cache; sendToCache will handle Enq dependencies
                let subs = addrSubs[soul]
                if(subs === undefined)return //no current subscription for this addr
                processValue(soul,subs)(v,soul)//value is a value to return, process subs with value available
            }
            
        }else if(/\/UP$/.test(soul) && !TIME_INDEX_PROP.test(soul) && ALL_ADDRESSES.test(soul) && !msg['@']){//UP looking inheritance dependencies
            //this will be for cascade/function stuff
            
        }else if(IS_CONFIG_SOUL.test(soul) && !msg['@']){//watching for config updates
            let type = IS_CONFIG(soul)
            if(!type)return
            let {b,t,r} = parseSoul(soul)
            if(!gbBases.includes(b))return//so we don't load other base configs.
            let data = JSON.parse(JSON.stringify(putObj))
            delete data['_']
            if(type === 'baseConfig'){
                data.props = {}
                data.groups = {}
                data.relations = {}
                data.labels = {}
                let configpath = configPathFromChainPath(soul)
                setValue(configpath,data,gb,true)
            }else if(type === 'typeIndex'){
                for (const tval in data) {//tval '#' + id || '-'+id
                    const boolean = data[tval];
                    let {t,r} = parseSoul(tval)
                    let path = configPathFromChainPath(makeSoul({b,t,r}))
                    let current = getValue(path,gb)
                    if(boolean && !current){//valid things, that is not in gb
                        setValue(path,{},gb)
                    }else if(!boolean && current){//deleted but was active, null from gb
                        setValue(path,null,gb)
                    }
                }
            }else if(type === 'propIndex'){
                for (const p in data) {
                    const boolean = data[p];
                    let path = configPathFromChainPath(makeSoul({b,t,r,p}))
                    let current = getValue(path,gb)
                    if(boolean && !current){//valid things, that is not in gb
                        setValue(path,{},gb)
                    }else if(!boolean && current){//deleted but was active, null from gb
                        setValue(path,null,gb)
                    }
                }
            }else if(['thingConfig','propConfig','labelIndex'].includes(type)){
                let configpath = configPathFromChainPath(soul)
                let data = JSON.parse(JSON.stringify(putObj))
                delete data['_']
                if(data.usedIn)data.usedIn = JSON.parse(data.usedIn)
                if(data.pickOptions)data.pickOptions = JSON.parse(data.pickOptions)
                setValue(configpath,data,gb,true)

            }
            if(['typeIndex','propIndex','labelIndex'].includes(type))return
            let values = JSON.parse(JSON.stringify(getValue(configPathFromChainPath(soul),gb)))
            for (const subID in configSubs) {
                const {cb,soul:cSoul} = configSubs[subID];
                if(cSoul === soul){
                    cb(values)
                }
            }
        }
    }
}
function processValue(addr,subs){
    return function(val,from){
        let {format,propType,dataType} = getValue(configPathFromChainPath(addr),gb)
        if(dataType === 'array'){
            try{
                val = JSON.parse(val)
            }catch(e){} 
        }
        for (const sID in subs) { //value has changed, trigger all subs
            handleSub(subs[sID],val)
        }
        const syms = Object.getOwnPropertySymbols(subs)
        for (const sym of syms) {
            handleSub(subs[sym],val)
        }
        function handleSub(subO,val){
            //console.log('firing sub for',addr)
            const {cb,raw} = subO
            if(!raw){
                val = formatData(format,propType,dataType,val)
            }
            //console.log('firing sub with value:',val)
            cb.call(cb,val,from)
        }
    }
}






const gunToSnap = (gunInstance,opts,doneCB) =>{
    gun = gunInstance
    let {bases,full} = opts
    if(bases !== undefined && !Array.isArray(bases))bases = [bases]//assume the passed a single baseID as a string
    if(Array.isArray(bases)){
        for (const baseID of bases) {
            mountBaseToChain(baseID,full,doneCB)
        }
    }
    gbGet = makegbGet(gun)
    //DI after gunInstance is received from outside
    tLog = timeLog(gun)
    tIndex = timeIndex(gun)
    qIndex = queryIndex(gun)

    solve = makesolve(gbGet, getCell)


    getConfig = makegetConfig(gbGet,configSubs,mountBaseToChain)
    newBase = makenewBase(gun,tLog)
    newNodeType = makenewNodeType(gun,gb,tLog)//new should only need id/alias of current gb
    importNewNodeType = makeimportNewNodeType(gun,gb,tLog,tIndex,getCell)//new should only need id/alias of current gb
    importRelationships = makeimportRelationships(gun,gbGet,tLog,tIndex,getCell)
    addProp = makeaddProp(gun,gb,getCell,cascade,solve,tLog,tIndex)//new should only need id/alias of current gb
    addLabel = makeaddLabel(gun,gb)
    
    newNode = makenewNode(gun,gbGet,getCell,cascade,tLog,tIndex)
    newFrom = makenewFrom(gun,gbGet,getCell,cascade,tLog,tIndex)
    edit = makeedit(gun,gbGet,getCell,cascade,tLog,tIndex)
    relatesTo = makerelatesTo(gun,gbGet,getCell,tLog,tIndex)//  
    archive = makearchive(gun,gbGet,getCell,tLog,tIndex)//
    unarchive = makeunarchive(gun,gbGet,getCell,tLog,tIndex)//
    deleteNode = makedelete(gun,gbGet,getCell,tLog,tIndex)//
    nullValue = makenullValue(gun)


  

    config = makeconfig(gun,gbGet,getCell,cascade,solve,tLog,tIndex)
    performQuery = makeperformQuery(gbGet,setupQuery)
    performExpand = makeperformExpand(gbGet,setupQuery)
    typeGet = maketypeGet(gbGet,setupQuery)
    nodeGet = makenodeGet(gbGet,getCell,subThing,nodeSubs)
    addressGet = makeaddressGet(gbGet,getCell,subThing)



    setAdmin = makesetAdmin(gun)
    newGroup = makenewGroup(gun)
    addUser = makeaddUser(gun)
    userAndGroup = makeuserAndGroup(gun)
    chp = makechp(gun)


    snap.newBase = newBase
    snap.ti = tIndex
    snap.tl = tLog
    snap.qi = qIndex
    
    gun._.on('put',incomingPutMsg)
    //gun._.on('in',function(msg){console.assert(!(msg && msg['@']),msg)})

    Object.assign(snap,snapChainOpt())
}
//snap INITIALIZATION
/*
---GUN SOULS---
see ./util soulSchema
*/


function mountBaseToChain(baseID,full,cb){//could maybe wrap this up fully so there is a cb called when it is fully loaded?
    //would be nice to figure out how to load minimal amt of config (id:alias) and then as the app needed more info it would get it?
    //since all keys are on all configObj, we could make a 'propLoader' where you give it some 'query' of the data needed from config and it will return cb w/it.
    //alias would get the chain to work, then once in the chain command async load all configs, and then the cb would be the actual chain command
    //would make first calls slower, but would make initial page loads more seamless. Otherwise chain can break and through errors, breaking the page.
    //propLoader would be a stripped down and simplified version of the data query buildResult part.

    //need to have this function be like `enableBaseID` so everytime it fires, it will try to get all the aliases so snap chain can navigate mutlitple baseIDs
    cb = (cb instanceof Function && cb) || function(){}
    gbBases.push(baseID)
    const get = gunGet(gun)
    let baseconfig = makeSoul({b:baseID,'%':true})
    let gbMerge = {}
    //if loadAll, run existing, else only get alias

    let toGet = {count:3,got:function(){
        this.count--
        if(!toGet.count){
            Object.assign(gb,gbMerge)

            //merge with gb
            //fireCB
            cb(true)
        }
        return
    }}
    get(baseconfig,false,function(gundata){
        if([undefined,null].includes(gundata)){
            toGet.got()
            return
        }
        let data = JSON.parse(JSON.stringify(gundata))
        delete data['_']
        data.props = {}
        data.groups = {}
        data.relations = {}
        data.labels = {}
        Object.assign(gbMerge,{[baseID]:data})
        toGet.got()
    })
    let baseLabels = makeSoul({b:baseID,l:true})
    get(baseLabels,false,function(gundata){
        if([undefined,null].includes(gundata)){
            toGet.got()
            return
        }        
        let data = JSON.parse(JSON.stringify(gundata))
        delete data['_']
        let configpath = configPathFromChainPath(baseLabels)
        setValue(configpath,data,gbMerge,true)
        toGet.got()
    })

    let tlist = makeSoul({b:baseID})
    get(tlist,false,function(data){//should have both relations and nodeTypes on this soul
        if([undefined,null].includes(data)){
            toGet.got()
            return
        }  
        for (const typeID in data) {//tval '#' + id
            if(typeID === '_')continue
            const isLink = data[typeID];
            if(isLink !== null && typeof isLink === 'object' && isLink['#']){//this is an active thing
                let tconfig = isLink['#']
                toGet.count++
                if(full)get(tconfig,false,handleGunConfig(tconfig))
                else get(tconfig,'alias',function(alias){
                    let o = {alias}
                    handleGunConfig(tconfig)(o)
                })
                getPropConfigs(tconfig)
            }
        }
        toGet.got()
    })
    function handleGunConfig(subSoul){
        return function(gundata){
            //will be type config or prop config 
            let configpath = configPathFromChainPath(subSoul)
            if([undefined,null].includes(gundata)){
                setValue(configpath,{},gbMerge)
            }else{
                let data = JSON.parse(JSON.stringify(gundata))
                delete data['_']
                if(data.usedIn)data.usedIn = JSON.parse(data.usedIn)
                if(data.pickOptions)data.pickOptions = JSON.parse(data.pickOptions)
                setValue(configpath,data,gbMerge,true)
            }
            toGet.got()
        }
        
    }
    function getPropConfigs(tpath){
        //tpath should be either !# or !-   
        toGet.count++
        let {b,t,r} = parseSoul(tpath)
        let pIdx = makeSoul({b,t,r})
        get(pIdx,false,function(data){
            if([undefined,null].includes(data)){
                toGet.got()
                return
            }  
            for (const typeID in data) {
                if(typeID === '_')continue
                const isLink = data[typeID];
                if(isLink !== null && typeof isLink === 'object' && isLink['#']){//this is an active thing
                    let pconfigSoul = isLink['#']
                    toGet.count++
                    if(full)get(pconfigSoul,false,handleGunConfig(pconfigSoul))
                    else get(pconfigSoul,'alias',function(alias){
                        let o = {alias}
                        handleGunConfig(pconfigSoul)(o)
                    })
                }
            }
            toGet.got()
        })
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
//CHAIN HELPERS
const ls = (path) =>(function(){
    let things = {}
    let {b,t,r} = path && parseSoul(path) || {}
    if(t || r){
        let cmd = new StringCMD(path,'prop')
        let cPath = [...configPathFromChainPath(path),'props']
        Object.entries(getValue(cPath,gb)).map(x => things[cmd.appendReturn(x[0])] = {ALIAS:x[1].alias,ID:x[0]})
    }else if(!b){
        let cmd = new StringCMD(path)
        Object.entries(gb).map(x => things[cmd.appendReturn(`.base('${x[0]}')`,true)] = {ID:x[0],ALIAS:x[1].alias})
    }else if(b && !(t||r)){
        let b1 = new StringCMD(path,'nodeType')
        let b2 = new StringCMD(path,'relation')
        let cP1 = [...configPathFromChainPath(path),'props']
        let cP2 = [...configPathFromChainPath(path),'relations']
        Object.entries(getValue(cP1,gb)).map(x => things[b1.appendReturn(x[0])] = {ALIAS:x[1].alias,ID:x[0]})
        Object.entries(getValue(cP2,gb)).map(x => things[b2.appendReturn(x[0])] = {ALIAS:x[1].alias,ID:x[0]})
    }
    console.warn('You can use either the "ID" or the "ALIAS" in the api calls. "ALIAS" will check against the **current** configuration')
    console.table(things)

    return path
    
})
function chainHelp(path){
    return function(){
        let calls = Object.keys(this)
        let table = {}
        for (const key of calls) {
            if(['ls','help'].includes(key))continue
            let baseCMD = new StringCMD(path,key)
            table[key] = {help:baseCMD.appendReturn('.help()',true)}
        }
        console.table(table)
    }
}




function groupChainOpt(base, group){
    return {_path:base, add: userAndGroup(base,group,true), remove:userAndGroup(base,group,false), chp:chp(base,group)}
}



//DATA SUBSCRIPTIONS
function subThing (path,cb,sID,opts){
    //path must be a nodeID or address, nothing else
    //if sID already exists, this will ovrwrt the prev values
    if(!ALL_ADDRESSES.test(path))throw new Error('Can only subscribe to an address!')
    sID = sID || Symbol() //user can pass a truthy sID or we will create an always unique ID
    if(!(cb instanceof Function))throw new Error('Must provide a callback!')
    let {raw} = opts
    let sObj = {cb,raw}
    setValue([path,sID],sObj,addrSubs)
    return {kill:killSub(path,sID)}     
}
function killSub (path,sID){
    return function(){
        //path must be a nodeID or and address, nothing else
        let isNode = ALL_INSTANCE_NODES.test(path)
        if(isNode){
            let sub = getValue([path,sID],nodeSubs) || {}//this is setup in the chainCommand...
            sub.kill()
            delete nodeSubs[path][sID]
        }else{//address
            delete addrSubs[path][sID]
        }
    }
    
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
        return removeDep()
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
        if(oldDep && upDeps[oldDep])upDeps[oldDep].delete(address)
        if(oldDep) delete downDeps[address]

        if(upDeps[address])return true
        return false

    }
}
function sendToCache(nodeID, p, value){
    let newEnq = handleCacheDep(nodeID,p,value)//will get deps correct so we can return proper data to buffer
    let address = toAddress(nodeID,p)
    let v = cache.get(address)//if it is inherited we want the value to go out to buffer
    let from = address
    while (isEnq(v)) {
        let lookup = isEnq(v)
        v = cache.get(lookup)
        from = lookup
    }
    if(newEnq || (from === address && value !== v)){//this is some sort of new/changed value
        cache.set(address,value)//should fire the watch cb
        handlePropDataChange()
        return
    }
    function handlePropDataChange(){
        let {p} = parseSoul(address)
        let startAddress = (address === from) ? from : address
        checkDeps(startAddress)
        function checkDeps(changedAddress){
            let deps = upDeps[changedAddress]
            if(deps){
                for (const depAddr of deps) {
                    let subs = addrSubs[depAddr]
                    if(subs === undefined)continue
                    let [nodeID,pval]= removeP(depAddr)
                    getCell(nodeID,pval,processValue(depAddr,subs),true,true)
                    checkDeps(depAddr)//recur... until it can't
                }
            }
        }
        
    }
}
let getBuffer = {}
let getBufferState = true

function getCell(nodeID,p,cb,raw){
    //need to store all the params in the 
    // buffer should be //Map{nodeID: Map{p:[]}}
    let address = toAddress(nodeID,p)
    let cVal = cache.get(address)
    let from = address
    if(cVal !== undefined){
        while (isEnq(cVal)) {
            let lookup = isEnq(cVal)
            cVal = cache.get(lookup)
            from = lookup
        }
        if(cVal !== undefined){
            let [fromN,p] = removeP(from)
            //console.log('RETURNING GET CELL FROM CACHE:',cVal)
            returnGetValue(fromN,p,cVal,cb,raw)
            //console.log('getCell,cache in:',Date.now()-start)
            return cVal //for using getCell without cb, assuming data is in cache??
        }
    }

    //only runs the following when needing network request
    if(getBufferState){
        getBufferState = false
        setTimeout(batchedWireReq,1)
    }
    let args = [cb,raw]
    if(!getBuffer[nodeID]){
        getBuffer[nodeID] = new Map()
    }
    let argArr = getBuffer[nodeID].get(p)
    if(!argArr)getBuffer[nodeID].set(p,[args])
    else argArr.push(args)
}
function batchedWireReq(){//direct to super peer(s??)
    let b = Object.assign({},getBuffer)
    getBuffer = {}
    getBufferState = true
    let doneCBs = {} //{[addr:[[cb,raw]]]}
    let requests = {}

    for (const nodeID in b) {
        let pMap = b[nodeID]
        requests[nodeID] = []
        for (const [p,argArry] of pMap.entries()) {
            doneCBs[toAddress(nodeID,p)] = argArry
            requests[nodeID].push(p)
        }
    }
    //console.log('WIRE BATCH',requests,doneCBs)
    gun._.on('out', {
        getBatch: requests,
        '#': gun._.ask(function(msg){
            let sg = msg.subGraph
            for (const soul in sg) {
                const putObj = sg[soul];
                for (const prop in putObj) {
                    if(prop === '_')continue//these are valid gun nodes
                    const value = putObj[prop];
                    let addr = toAddress(soul,prop)
                    sendToCache(soul,prop,value)
                    let argsArr = doneCBs[addr]
                    let e
                    if(e = isEnq(value)){//send it for another round...
                        let [s,p] = removeP(e)
                        for (const args of argsArr) {
                            getCell(s,p,...args)
                        }
                    }else{
                        handleGetValue(soul,prop,value,argsArr)
                    }      
                }    
            }
        })
    })
}
function handleGetValue(nodeID,p,val,argsArr){
    //console.log("GET VALUE:",val,{nodeID,p})
    for (let i = 0,l = argsArr.length; i < l; i++) {
        const args = argsArr[i];
        returnGetValue(nodeID,p,val,...args)   
    }
}
function returnGetValue(fromSoul,fromP,val,cb,raw){
    let {b,t,r} = parseSoul(fromSoul)
    let {propType,dataType,format} = getValue(configPathFromChainPath(makeSoul({b,t,r,p:fromP})),gb)
    let fromAddr = toAddress(fromSoul,fromP)
    if([null,undefined].includes(val)){
        cb.call(cb,null,fromAddr)
        //console.log('getCell,NULL in:',Date.now()-start)
        return
    }
    //so we have data on this soul and this should be returned to the cb
    if(dataType === 'unorderedSet'){//this will be a full object
        let data = JSON.parse(JSON.stringify(val))
        let setVals = []
        if(Array.isArray(data)){
            setVals = data.slice()
        }else{
            for (const key in data) {
                if(key === '_')continue
                const boolean = data[key];
                if (boolean) {//if currently part of the set
                    setVals.push(key) 
                }
            }
        }
        
        if(fromP === 'LABELS')setVals.unshift(t)
        val = setVals
    }else if(dataType === 'array'){
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
    if(!raw)val = formatData(format,propType,dataType,val)
    cb.call(cb,val, fromAddr)
    //console.log('getCell,DATA in:',Date.now()-start)

}




module.exports = {
    snap,
    gunToSnap,
    getAlias,
    getProps
}