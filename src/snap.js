"use strict";
import {
    configPathFromChainPath,
    gbForUI,
    gbByAlias,
    setValue,
    getValue,
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
    rand,
    mergeObj,
    on,
    encTime,
    decTime,
    snapID
} from './util.js'
let gbGet


import {
    gbGet as rawgbGet
} from './configs'
//const makegbGet = rawgbGet(gb)

// import {makenewBase,
//     makenewNodeType,
//     makeaddProp,
//     makenewNode,
//     makenewFrom,
//     makeconfig,
//     makeedit,
//     makeimportNewNodeType,
//     makeshowgb,
//     makeshowcache,
//     makeshowgsub,
//     makeshowgunsub,
//     makeperformQuery,
//     makesetAdmin,
//     makenewGroup,
//     makeaddUser,
//     makeuserAndGroup,
//     makechp,
//     makearchive,
//     makeunarchive,
//     makedelete,
//     makenullValue,
//     makerelatesTo,
//     maketypeGet,
//     makenodeGet,
//     makeaddressGet,
//     makekill,
//     makegetConfig,
//     makeaddLabel,
//     makeimportRelationships,
//     makeperformExpand
// } from './chain_commands'
let newBase,newNodeType,addProp,newNode,config,edit,nullValue,relatesTo
let importNewNodeType,archive,unarchive,deleteNode,newFrom
let performQuery,setAdmin,newGroup,addUser,userAndGroup,chp
let typeGet, nodeGet, addressGet, getConfig,addLabel, importRelationships,performExpand
//const showgb = makeshowgb(gb)
//const showcache = makeshowcache(cache)
//const showgunsub = makeshowgunsub(gunSubs)


// import {makesolve} from './functions/function_utils'
// let solve


// import {timeIndex,
//     queryIndex,
//     timeLog,} from '../chronicle/chronicle'
// let qIndex,tIndex,tLog

var isNode=new Function("try {return this===global;}catch(e){return false;}")()



import Router from './router';
import MemStore from './memStore'
import SG from './sg'
import ResourceManager from './resources'
import PeerManager from './peerManager'
import commsInit from './peer/listen'
import Resolver from './resolver'
import addListeners from './events'
import { create, auth, leave, verify } from './auth/auth';
import coreApi from './coreApi'
import {encode,decode} from '@msgpack/msgpack'


const defaultOpts = {
    persist: {
        gossip:isNode,
        data:isNode, //would be nice to give it a namespace of things to persist (if this peer was only watching 1 db?)
    },
    inMemory: {
        gossip:true,
        data:true, 
    },
    log: console.log,
    debug: function(){},
}

export default function Snap(initialPeers,opts){
    if(!new.target){ return new Snap(initialPeers,opts) }
    opts = opts || {}
    if(!initialPeers)initialPeers = (isNode) ? [] : ['http://localhost:8765/snap']  // https://www.hello.snapgraph.net/snap //if they want no peers, must specify []
    if(initialPeers && !Array.isArray(initialPeers))[initialPeers]
    let self = this
	this._ = {}
    let root = this._
    root.snapID = snapID
    root.isPeer = isNode
    if(isNode)mergeObj(defaultOpts,{maxConnections:300})//currently not implemented
    root.opt = defaultOpts
    mergeObj(root.opt,opts) //apply user's ops
    root.verify = verify

    root.memStore = new MemStore(root)
    //root.sg = new SG(root)
    root.assets = new ResourceManager(root)
    root.mesh = new PeerManager(root)
    root.router = new Router(root)
    root.resolver = new Resolver(root)
    if(isNode){
        commsInit(root)//listen on port
    }
    coreApi(root)
    addListeners(root)
    //add diskStore
    root.is = {}// not here, but need to get them so our intro/auth can send them
    root.has = {}

    root.util = {getValue,setValue,rand,encode,decode}
    
    // for (let i = 0; i < initialPeers.length; i++) {
    //     root.connect(initialPeers[i])
    // } can only connect from making a request?
        
    Object.assign(self,snapChainOpt(self))   
}
let nodeStatesBuffer = {}
let stateBuffer = true
let gbBases = []
//const kill = makekill(querySubs,configSubs,killSub)






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
function snapChainOpt(snap){
    return {snap,
        signUp:create,
        signIn:auth,
        signOut:leave,
        //newBase, 
        //showgb, 
        //showcache, 
        //showgsub, 
        //showgunsub, 
        //solve, 
        //base, 
        //node: node(),
        //ls:ls(),
        //help:chainHelp(),
        //getConfig: getConfig(),
        //kill:kill()
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

let getBuffer = {}
let getBufferState = true


