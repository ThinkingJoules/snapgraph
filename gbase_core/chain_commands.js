const{getValue,
    configPathFromChainPath,
    findID,
    findRowID,
    tsvJSONgb,
    convertValueToType,
    checkUniques,
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
    INSTANCE_OR_ADDRESS,
    DATA_INSTANCE_NODE,
    newDataNodeID,
    configSoulFromChainPath,
    CONFIG_SOUL,
    makeEnq,
    toAddress,
    removeP,
    grabThingPropPaths,
    NON_INSTANCE_PATH,
    grabAllIDs,
    StringCMD,
    BASE

} = require('./util')

const{newBaseConfig,
    newNodeTypeConfig,
    newNodePropConfig,
    newRelationshipConfig,
    newRelationshipPropConfig,
    handleImportColCreation,
    handleTableImportPuts,
    handleConfigChange,
    loadAllConfigs

} = require('./configs')


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

const DEPS_GET_CELL = ['propType','dataType','format']
const DEPS_ACTIVE_PROPS = ['hidden','archived','deleted','sortval']
const DEPS_PUT_DATA = (isNew) =>{
    let base = [...DEPS_GET_CELL,...DEPS_ACTIVE_PROPS,'enforceUnique','autoIncrement']
    if(!isNew)return base
    return [...base,'required','defaultval']
}


const makeDeps = (arrOfArrs) =>{
    let out = new Set()
    for (const deps of arrOfArrs) {
        for (const dep of deps) {
            out.add(dep)
        }
    }
    return [...out]
}

//GBASE CHAIN COMMANDS
const makenewBase = (gun,timeLog) => (alias, basePermissions, baseID,cb) =>{
    try{
        cb = (cb instanceof Function && cb) || function(){}
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
            makenewNodeType(gun,newgb,timeLog)(makeSoul({b}),'t')({id:'USERS',alias: 'Users',humanID:'ALIAS'},false,[{alias:'Public Key',id:'PUBKEY'},{alias:'Alias',id:'ALIAS'}])
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
    cb = (cb instanceof Function && cb) || function(){}
    let {b} = parseSoul(path)
    let isNode = (relationOrNode === 't')
    let {id:tid} = configObj
    let toPut = {}
    let newGB = JSON.parse(JSON.stringify(gb))
    let err
    propConfigArr = propConfigArr || []
    if(isNode && !propConfigArr.filter(x => x.propType === 'labels')[0])propConfigArr.unshift({alias:'LABELS',propType:'labels',id:'LABELS'})
    else{
        if(!propConfigArr.filter(x => x.propType === 'target')[0])propConfigArr.unshift({alias:'TRGT',propType: 'target',id:'TRGT'})
        if(!propConfigArr.filter(x => x.propType === 'source')[0])propConfigArr.unshift({alias: 'SRC',propType: 'source',id:'SRC'})
    }
    if(!propConfigArr.filter(x => x.propType === 'state')[0])propConfigArr.unshift({alias: 'STATE', propType:'state',id:'STATE'})

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
    //console.log(newPath,tCsoul)

    handleConfigChange(gun,newGB,false,false,false,timeLog,false,tconfig,newPath,{isNew:true, internalCB:function(obj){
        let {configPuts} = obj
        Object.assign(toPut,configPuts)
        let forGB = Object.assign({},configPuts[tCsoul],{props:{}})
        setValue(configPathFromChainPath(newPath),forGB,newGB)
        makeProp()
    }},throwError)

    function handlePropCreation(o){
        propConfigArr.shift()
        let {path,configPuts} = o
        //console.log(path,configPuts)
        let cSoul = configSoulFromChainPath(path)
        for (const soul in configPuts) {
            addToPut(soul,configPuts[soul])
        }
        if(propConfigArr.length){
            //console.log(configPathFromChainPath(path),configPuts[cSoul],newGB)
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
        //console.log(pconfig)
        handleConfigChange(gun,newGB,false,false,false,timeLog,false,pconfig,newPpath,{isNew:true,internalCB:handlePropCreation},throwError)

    }
    function done(){
        if(err)return
        for (const csoul in toPut) {//put all configs in
            const cObj = toPut[csoul];
            if(CONFIG_SOUL.test(csoul)){
                timeLog(csoul,cObj)
                //console.log(csoul,cObj)
                setValue(configPathFromChainPath(csoul),cObj,newGB,true)//mutate gb object before the gun CB hits, that way when this done CB is called user can use gb
            }
            gun.get(csoul).put(cObj)
        }
        cb.call(cb,undefined,newGB)
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
const makeaddProp = (gun,gb,getCell,cascade,solve,timeLog,timeIndex) => (path,cb) =>{
    const f = (function(configObj){
        cb = (cb instanceof Function && cb) || function(){}
        let {b,t,r} = parseSoul(path)
        let propConfigArr = (Array.isArray(configObj)) ? configObj : [configObj]
        let isNode = !r
        let toPut = {}
        let newGB = JSON.parse(JSON.stringify(gb))
        let err
        let ID = ''
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
            ID=id
            let pconfig = (isNode) ? newNodePropConfig(nextPconfig) : newRelationshipPropConfig(nextPconfig)
            let newPpath = makeSoul({b,t,r,p:id})
            handleConfigChange(gun,gb,getCell,cascade,solve,timeLog,timeIndex,pconfig,newPpath,{isNew:true,internalCB:handlePropCreation},throwError)
    
        }
        function done(){
            if(err)return
            for (const csoul in toPut) {//put all configs in
                const cObj = toPut[csoul];
                if(CONFIG_SOUL.test(csoul)){
                    timeLog(csoul,cObj)
                    setValue(configPathFromChainPath(csoul),cObj,gb)//mutate gb object before the gun CB hits, that way when this done CB is called user can use gb
                }
                gun.get(csoul).put(cObj)
            }
            cb.call(cb,undefined,ID)
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
    })
    f.help = function(){
        let fromReadMe =
`
**addProp(*configObj*,*cb*)**  
All arguments are optional.
For valid config options see [config](#config).
Alias must be unique for the thingType you are adding it to.
If you give the configObj.id a value, then it must be unique across all IDs

Example usage:

//assume: 'ACME Inc.' has a baseID = "B123" and "Items" = "1tk23k"
gbase.base('ACME Inc.').table('Items').addProp('Vendor',(err,value) =>{
  if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
  }else{
    //err = falsy
    //value = will return the new prop ID
  }
})

`
        console.log(fromReadMe)
    }
    return f
}
const makenewNode = (gun,gbGet,getCell,cascade,timeLog,timeIndex,relationIndex) => (path) =>{
    const f = (function(data, cb){
        let deps = makeDeps([DEPS_PUT_DATA(true)])
        let {b,t} = parseSoul(path)
        let allThings = grabAllIDs(gbGet(),b)
        let allProps = []
        for (const typeID in allThings) {
            allProps.push([typeID,['log','externalID']])
            const propArr = allThings[typeID];
            for (const pPath of propArr) {
                allProps.push([pPath,deps])
            }
        }
        gbGet(allProps,newNode)
        function newNode(gb){
            try{
                cb = (cb instanceof Function && cb) || function(){}
                //API can be called from:
                /*
                gbase.base(b).nodeType(t).newNode() 
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
    })
    f.help = function(){
        let fromReadMe = 
`### newNode
**newNode(*dataObj*, *cb*)**  
All arguments are optional  
dataObj = {Column Alias || pval: value}   
cb = Function(err, value) 
Note: A null node will be created if no dataObj provided
Example usage:

//assume: 'ACME Inc.' has a baseID = "B123" and "Items" = "1t3ds2"
gbase.base('ACME Inc.').nodeType('Items').newNode({name:'Anvil'})
(can use the current alias for conveinence)

OR
(Preffered method)
gbase.base("B123").nodeType("1t3ds2").newNode({name:'Anvil'})
This will always work (if an alias changes the first method will fail)



--With Data and CB--
gbase.base("B123").nodeType("1t3ds2").newNode({name:'Anvil'}, (err,value) =>{
    if(err){//err will be falsy (undefined || false) if no error
        //value = undefined
        //handle err
    }else{
        //err = falsy
        //value = will return the new nodes ID
    }
})`
        console.log(fromReadMe)
    }






    return f
} 
const makenewFrom = (gun,gbGet,getCell,cascade,timeLog,timeIndex,relationIndex) => (path) => (data,cb,opt)=>{//TODO
    let deps = makeDeps([DEPS_PUT_DATA(true)])
    let {b,t,i} = parseSoul(path)
    let allThings = grabAllIDs(gbGet(),b)
    let allProps = []
    for (const typeID in allThings) {
        allProps.push([typeID,['log','externalID']])
        const propArr = allThings[typeID];
        for (const pPath of propArr) {
            allProps.push([pPath,deps])
        }
    }
    gbGet(allProps,newFrom)
    function newFrom(gb){
        try{
            //API can be called from:
            /*
            gbase.base(b).nodeType(t).node(ID).newFrom() << where t is a root table, as-is api
            gbase.node(ID).newFrom() <<gbase can handle everything, this is the preferred method.
            */
            cb = (cb instanceof Function && cb) || function(){}
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
    
}

const makeconfig = (gun,gbGet,getCell,cascade,solve,timeLog,timeIndex) => (path) => {
    
    const f = (function(configObj,cb){
        let loadPath = makeSoul({b:parseSoul(path).b})//load all the configs regardless of chain context
        loadAllConfigs(gbGet,loadPath,config)
        function config(gb){
            try{
                cb = (cb instanceof Function && cb) || function(){}
                
                handleConfigChange(gun,gb,getCell,cascade,solve,timeLog,timeIndex,configObj, path, false,cb)
                
            }catch(e){
                console.log(e)
                cb.call(this,e)
                return false
            }
        }
        
    })

    f.help = function(){
        console.log('.config( configObj, doneCB )')
    }
    return f
}
const makeedit = (gun,gbGet,getCell,cascade,timeLog,timeIndex) => (path) => {
    
    const f = (function(editObj, cb, opt){
        let deps = makeDeps([DEPS_PUT_DATA(false)])
        let pathObj = parseSoul(path)
        let {b,t,r,p} = pathObj
        let allThings = grabAllIDs(gbGet(),b)
        let allProps = []
        for (const typeID in allThings) {
            allProps.push([typeID,['log','externalID']])
            const propArr = allThings[typeID];
            for (const pPath of propArr) {
                allProps.push([pPath,deps])
            }
        }
        gbGet(allProps,edit)
        function edit(gb){
            try{
                cb = (cb instanceof Function && cb) || function(){}
                let {own} = opt || {}
                let stateP = 'STATE'
                if(p){
                    let {dataType} = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb)
                    delete pathObj.p
                    delete pathObj['.']
                    if((typeof editObj !== 'object' || (typeof editObj === 'object' && Array.isArray(editObj))) && dataType === 'unorderedSet')throw new Error('Must provide an object to edit an unorderedSet')
                    else if(Array.isArray(editObj) && dataType !== 'array')throw new Error('Must provide a full array to edit an array value')
                    else if(typeof editObj === 'object' && !['unorderedSet','array'].includes(dataType))editObj = Object.values(dataObj)[0]

                    editObj = {[p]:editObj}
                    path = makeSoul(pathObj)
                }
                if(typeof editObj !== 'object' || editObj === null)throw new Error('Must pass in an object in order to edit.')
                const checkForState = (value) =>{
                    let e
                    if([undefined,null].includes(value)){
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
    })

    f.help = function(){
        let fromReadMe =
`
**edit(*\*dataObj* OR *\*value*, *cb*, *opts*)**  
-cb and opts are optional  

dataObj = {Prop Alias || PropID: value} || value* 
cb = Function(err, value) 
opts = {own:false} See [inheritance](#inheritance) for more info  

**WARNING** If the context is an address you can just give edit the value for that property, 
the API will effectively do {[propID]:value}. 
If you give it an object **it will not look at the propID/alias in that object**. 
The api does {[propID]:Object.values(dataObj)[0]}

Example usage (3 chain locations (**2 usages!**)):
//assume:
'ACME Inc.'= "B123"
'Items' = '1t2o3'
'Vendor' = '3p3kd'

nodeID = '!B123#1t2o3$abcd'
address = '!B123#1t2o3.3p3kd$abcd'

//because the nodeID or address contains all context, we can skip the middle bits
gbase.node(nodeID).edit({'Vendor': 'Anvils 'r Us'})
gbase.node(address).edit("Anvils 'r us")


//However, the long api is still valid
gbase.base('ACME Inc.').nodeType('Items').node(nodeID).edit({'Vendor': 'Anvils 'r Us'})

gbase.base('ACME Inc.').nodeType('Items').node(nodeID).prop('Vendor').edit("Anvils 'r us")

gbase.base('ACME Inc.').nodeType('Items').node(address).edit("Anvils 'r us")



--With Data and CB--
gbase.node(address).edit("Anvils 'r us", (err,value) =>{
    if(err){//err will be falsy (undefined || false) if no error
    //value = undefined
    //handle err
    }else{
    //err = falsy
    //value will return the nodeID
    }
})
`       
        console.log(fromReadMe)
    }
    return f
}


const makeperformQuery = (gbGet,setupQuery) => (path,isSub) => {
    
    const f = (function(cb, queryArr,subID){
        let {b} = parseSoul(path)
        let allThings = grabAllIDs(gbGet(),b)
        let allProps = []
        let deps = makeDeps([DEPS_GET_CELL,DEPS_ACTIVE_PROPS])
        for (const typeID in allThings) {
            const propArr = allThings[typeID];
            for (const pPath of propArr) {
                allProps.push([pPath,deps])
            }
        }
        if(isSub && !subID)subID = Symbol()
        //soryBy = [pval,ASC|DESC,pval2,ASC|DESC,...etc]
        gbGet(allProps,performQuery)//preload gb, as Query will need this things to parse
        return subID
        function performQuery(gb){
            try{
                if(isSub && !subID)throw new Error('Must specify a subscription ID!')
                queryArr = queryArr || []
                setupQuery(path,queryArr,cb,true,subID)
            }catch(e){
                console.warn(e)
            }
        }
    })
    f.help = function(){
        let fromReadMe = 
`

`
        console.log(fromReadMe)
    }


    
}
const maketypeGet = (gbGet,setupQuery) => (path,isSub) => {
    const f = (function(cb,opts){
        cb = (cb instanceof Function && cb) || function(){}
        let allProps = grabThingPropPaths(gbGet(),path)
        let deps = makeDeps([DEPS_GET_CELL,DEPS_ACTIVE_PROPS])
        allProps = allProps.map(x => [x,deps])
        let {b,t,r,p} = parseSoul(path)
        let type = t || r
        let {sortBy,skip,limit,idOnly, returnAsArray,propsByID,noID,noAddress,raw,subID,props,labels} = opts || {}

        if(isSub && !subID)subID = Symbol()
        //soryBy = [pval,ASC|DESC,pval2,ASC|DESC,...etc]
        gbGet(allProps,typeGet)
        return subID
        function typeGet (gb){
            try{
                
                skip = skip || 0
                limit = limit || Infinity
                props = (p) ? [p] : props || getAllActiveProps(gb,path)
                sortBy = sortBy || []
                let ret = {RETURN:[]}
                let retArg = ret.RETURN
                let matchStr = (t) ? 'MATCH (x:'+type+')' : 'MATCH ()-[x:'+type+']-()'
                let match = {CYPHER:[matchStr]}
        
                let retFirstArg = {limit,skip,idOnly}
                let retSecArg = {x:{returnAsArray,propsByID,noID,noAddress,raw}}
        
                if(sortBy.length){
                    retFirstArg.sortBy = ['x']
                    for (let i = 0; i < sortBy.length; i+=2) {
                        const alias = sortBy[i];
                        let dir = sortBy[i+1]
                        if(!['ASC','DESC'].includes(dir)) dir = 'DESC'
                        retFirstArg.sortBy.push(alias)
                        retFirstArg.sortBy.push(dir)
                    }
                }
                retArg.push(retFirstArg)
                let propArr = []
                let withP = makeSoul({b,t,r,p:true})
                for (const prop of props) {
                    let propID = findID(gb,prop,withP)
                    propArr.push(propID)
                }
                retSecArg.x.props = propArr
                retArg.push(retSecArg)
        
                let queryArr = [match,ret]
                console.log('Number of props to get:',propArr.length)
                setupQuery(path,queryArr,cb,!!isSub,isSub && subID)
            }catch(e){
                console.warn(e)
                return e
            }
        }
    })

    f.help = function(){
        console.log('TODO... for now see table in readme: https://github.com/ThinkingJoules/gundb-gbase/')

    }
    return f
    
}
const makenodeGet = (gbGet,getCell,subThing,nodeSubs) => (path,isSub) =>{
    const f = (function(cb,opts){
        cb = (cb instanceof Function && cb) || function(){}
        let allProps = grabThingPropPaths(gbGet(),path)
        allProps = allProps.map(x => [x,['hidden','archived','deleted','sortval','propType','format']])
        let {returnAsArray,propsByID,noID,noAddress,raw,subID,props,propAs,partial} = opts || {}
        if(isSub && !subID)subID = Symbol()
        gbGet(allProps,nodeGet)
        return subID
        function nodeGet(gb){
            try{
                props = props || getAllActiveProps(gb,path)
                let nodeObj
                if(returnAsArray){
                    nodeObj = []
                    nodeObj.length = props.length
                }else{
                    nodeObj = {}
                }
                if(!noID)Object.defineProperty(nodeObj,'id',{value: path})
                if(!noAddress)Object.defineProperty(nodeObj,'address',{value: (returnAsArray) ? [] : {}})
                let allSubs = []
                let toGet = props.length
                for (let i = 0,l=props.length; i < l; i++) {
                    const p = props[i];
                    let property
                    if(returnAsArray){
                        property = i
                    }else{
                        property =  propAs && propAs[p] || (propsByID) ? p : getValue(configPathFromChainPath(toAddress(path,p)),gb).alias
                    }
                    let addr = toAddress(path,p)
                    getCell(path,p,function(val){
                        nodeObj[property] = val
                        if(!noAddress)nodeObj.address[property] = addr
                        toGet--
                        if(!toGet)cb.call(cb,nodeObj)
                    },raw,true)
                    let addrsub = subThing(addr,nodeSubCB(nodeObj,property,cb,partial),false,{raw})
                    allSubs.push(addrsub)
                }
                setValue([path,subID],{kill:function(){allSubs.map(x => x.kill())}},nodeSubs)
            }catch(e){
                console.warn(e)
                return e
            }
        }
        
        function nodeSubCB(obj,keyAs,cb,partial){
            return function(v){
                obj[keyAs] = v
                if(partial && !returnAsArray)cb.call(cb,{[keyAs]:v})
                else cb.call(cb,obj)
            }
        }
    })

    f.help = function(){
        console.log('TODO... for now see table in readme: https://github.com/ThinkingJoules/gundb-gbase/')

    }
    return f
}
const makeaddressGet = (gbGet,getCell,subThing) => (path,isSub) =>{
    const f = (function(cb,opts){
        cb = (cb instanceof Function && cb) || function(){}
        let deps = makeDeps([DEPS_GET_CELL])
        let {b,t,r,p} = parseSoul(path)//get rid of instance info
        let need = [[makeSoul({b,t,r,p}),deps]]
        let {raw,subID} = opts || {}
        if(isSub && !subID)subID = Symbol()
        gbGet(need,addressGet)
        return subID
        function addressGet(gb){
            try{
                let [nodeID,p] = removeP(path)
                getCell(nodeID,p,cb,raw,true)
                subThing(path,cb,false,{raw})
            }catch(e){
                console.warn(e)
            }
        }
    })
    f.help = function(){
        let summary,table,opts,toKill
        if(subThing){
            summary = 
            `
            Used to subscribe to changes on this specific property on this specific node.
            `
            table = {'1st Arg':{what:'callback fn',type:'function'},'2nd Arg':{what:'options object',type:'object'}}
            opts = {'raw':{'Default':false,'Purpose':'To apply formatting according to config.format'},
                    'subID':{'Default':Symbol(),'Purpose':'Must be unique against all other subIDs'}}
            toKill = 
            `
            To kill the subscription, use like:
            let sub = gbase.node(${path}).subscribe(cb,opts)
            ...
            gbase.node(someAddress).kill(sub)
            `
        }else{
            summary = 
            `
            Used to retrieve this specific property on this specific node.
            `
            table = {'1st Arg':{what:'callback fn',type:'function'},'2nd Arg':{what:'options object',type:'object'}}
            opts = {'raw':{'Default':false,'Purpose':'To apply formatting according to config.format'}}
        }
        
    
        console.warn(summary)
        console.info('ARGUMENTS')
        console.table(table)
        console.info('')
        console.info('Options')
        console.table(opts)
        if(subThing)console.warn(toKill)


    }
    return f
    
}

const makegetConfig = (gbGet,configSubs,mountBaseToChain) => (chainPath) =>{
    const f = (function(cb,opts){
        cb = (cb instanceof Function && cb) || function(){}
        let {path,subID,full} = opts || {}
        if(!path && !chainPath)throw new Error("Must specify either a nodeID or address to get it's configs")
        path = path || chainPath
        if(BASE.test(path) && !gb[path.slice(1)]){//adding a new base to the chain api
            mountBaseToChain(path.slice(1),full,cb)
            return
        }
        if(!INSTANCE_OR_ADDRESS.test(path) && !NON_INSTANCE_PATH.test(path))throw new Error('"path" must be a valid gbase path')
        let {b,t,r,p} = parseSoul(path)//get rid of instance info
        let cleanPath = makeSoul({b,t,r,p})
        let need = [[cleanPath,false]]//should get all things
        gbGet(need,getConfig)
        return subID
        function getConfig(gb){
            let things = JSON.parse(JSON.stringify(getValue(configPathFromChainPath(cleanPath),gb)))
            let cSoul = configSoulFromChainPath(cleanPath)
            if(subID !== undefined)configSubs[subID] = {cb,soul:cSoul}
            cb(things)

        }
    })
    f.help = function(){
        let msg = 
`
### getConfig  
**getConfig(*cb*, *opts*)**  
cb will fire with the config object for the chain context or for the path provided in opts.


opts = {
  path: '!'+baseID (for adding a new base to this gbase chain) || nodeID(for that type config) || address(for that property config)

  subID: If provided, will subscribe and fire callback with full config object at each change

  full: Only used for a '!'+baseID path. Determines whether to do a minimal load, or get all configs
}


Example usage:
There are a couple ways to use.

//To add a new base to the api chain:
gbase.getConfig(cb,{path:'!B123'}) // if B123 was already mounted to this chain, it would return it't configs

//To get by context
gbase.base('B123').nodeType('Items').getConfig(cb)

//To get by path
nodeID = '!B123#1t2o3$abcd'
gbase.getConfig(cb,{path: nodeID, subID: 'forUI'}) //Will subscribe the nodeType config object
...
gbase.kill('forUI') //config subs are not namespaced by path. Only subscription that can killed without context.

`
        console.log(msg)
    }


    return f
}

const makekill = (querySubs,configSubs,killSub) => (path) => (subID)=>{
    if(!path){
        if(configSubs && configSubs[subID]){
            delete configSubs[subID]
        }
        return
    }
    let {b} = parseSoul(path)
    if(INSTANCE_OR_ADDRESS.test(path)){//address sub
        killSub(path,subID)()
    }else if(NON_INSTANCE_PATH.test(path)){//query sub path is either !, !#, !-, !#., !-.
        if(querySubs && querySubs[b] && querySubs[b][subID]){
            let qParams = querySubs[b][subID]
            qParams.kill()
        }else if(configSubs && configSubs[subID]){
            delete configSubs[subID]
        }
    }
}


const makeimportData = (gun, gb) => (path) => (tsv, ovrwrt, append,cb)=>{//not updated, NEEDS WORK
    //gbase[base].importNewTable(rawTSV, 'New Table Alias')

    //should run all of these through .edit(), to ensure it matches schema/types


    cb = (cb instanceof Function && cb) || function(){}
    ovrwrt = (ovrwrt === undefined) ? false : !!ovrwrt
    append = !!append
    
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
const makeimportNewNodeType = (gun,gb,timeLog,timeIndex,triggerConfigUpdate,getCell) => (path) => (tsv, configObj,opts, cb)=>{//updated
    //gbase.base(baseID).importNewTable(rawTSV, 'New Table Alias')
    try{
        let {b} = parseSoul(path)
        cb = (cb instanceof Function && cb) || function(){}
        let {delimiter,labels} = opts
        delimiter = delimiter || ', '
        let t = (typeof configObj === 'object') ? configObj.id : undefined
        configObj = configObj && newNodeTypeConfig(configObj) || newNodeTypeConfig()
        configObj.alias = configObj.alias || 'New NodeType' + rand(2)
        let {externalID} = configObj
        if(t && !/[^a-z0-9]/i.test(t) || !t){
            t = newID(gb,makeSoul({b,t:true}))
        }
        let altgb = JSON.parse(JSON.stringify(gb))
        configObj.id = t
        setValue(configPathFromChainPath(makeSoul({b,t})),configObj,altgb,true)
        //console.log(b,t)
        let dataArr = (Array.isArray(tsv)) ? tsv : tsvJSONgb(tsv) //can give it a pre-parse array.
        let colHeaders = dataArr[0]
        let [newParr, aliasLookup] = handleImportColCreation(altgb, path , colHeaders, dataArr[1],{externalID,labels, append:true})
        console.log(newParr)
        let externalIDidx = colHeaders.indexOf(externalID)
        if(externalIDidx === -1 && externalID)throw new Error('Cannot find the external IDs specified')
        if(externalIDidx !== -1){
            configObj.externalID = aliasLookup[externalID] //change externalID in config from the alias to the new pval
        }
        let invalidData = {}

        let rid = 0,IDs={},temp ={},result ={}

        for (let i = 1; i < dataArr.length; i++) {//start at 1, past header
            const rowArr = dataArr[i];
            let curID
            if(externalIDidx !== -1){
                curID = rowArr[externalIDidx]
                assignID(curID)
            }else{
                curID = assignID()
            }
            for (let j = 0; j < rowArr.length; j++) {
                let value = rowArr[j];
                value = (['',null,undefined].includes(value)) ? null : value
                if(!temp[curID])temp[curID] = {}
                let {dataType,id:headerPval} = newParr[j]
                try {
                    value = convertValueToType(value,dataType,curID,delimiter)
                } catch (error) {
                    //need to fail back to a 'string' type on this pval and re-convert all data on final time through
                    //convert will not throw errors on 'string' everything else will.
                    invalidData[j] = dataType
                }
                temp[curID][headerPval] = value
            }
        }
        let typeChange = Object.keys(invalidData)
        for (const pval of typeChange) {
            let {propType} = newParr[pval]
            if(propType === 'labels')throw new Error('Cannot convert your label field to an array. Please check your data to make sure it can be converted to an array.')
            newParr[pval].dataType = 'string'
            newParr[pval].propType = 'data' //probably already is, but could be 'date' and 'number'
        }
        const isVariant = /\$\{(.+)\}/
        for (const curID in temp) {
            const node = temp[curID];
            let rowsoul = (externalIDidx !== -1) ? IDs[curID] : curID

            for (const p in node) {
                let v = node[p]
                if(typeof v === 'string' && isVariant.test(v)){
                    v = v.replace(isVariant, function(m,$1){
                        let soul = ID[$1]
                        if(!DATA_INSTANCE_NODE.test(soul))return m
                        let addr = toAddress(soul,p)
                        return '${'+addr+'}'

                    })
                    v = makeEnq(v)
                }
                setValue([rowsoul,p],v,result)
            }
        }
        done()
        //console.log(newPconfigs,result)
        function assignID(alias){
            let id = makeSoul({b,t,i:newDataNodeID(rid)})
            if(alias)IDs[alias] = id
            rid++
            return id
        }
        function done(){
            makenewNodeType(gun,gb,timeLog)(path,'t')(configObj,function(err,newGB){
                if(!err){
                    console.log(newGB)
                    for (const newSoul in result) {
                        let put = result[newSoul]
                        putData(gun, newGB, getCell, false, timeLog, timeIndex, false, newSoul, put, {isNew:true,isUnique:true}, function(err){
                            //console.log('put errors',newSoul,err)
                        })
                    } 
                }else{
                    console.log(e)
                    cb.call(this,e)
                }
            },newParr.slice())
                      
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
        return e
    }
    
}
//export data..


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
        let srcP = 'SRC'
        let trgtP = 'TRGT'
        let stateP = 'STATE'
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
const makeshowgsub = (querySub,addrSubs,nodeSubs,configSubs) => () =>{
    return {querySub,addrSubs,nodeSubs,configSubs}
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
    makegetConfig
}