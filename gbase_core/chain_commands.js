
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
    makeEnq,
    toAddress,
    setMergeValue
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
            makenewNodeType(gun,newgb,timeLog)(makeSoul({b}),'t')({alias: 'Users',humanID:'ALIAS'},false,[{alias:'Public Key',id:'PUBKEY'},{alias:'Alias',id:'ALIAS'}])
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
        console.log(pconfig)
        config(pconfig,newPpath,{isNew:true,internalCB:handlePropCreation},throwError)

    }
    function done(){
        if(err)return
        for (const csoul in toPut) {//put all configs in
            const cObj = toPut[csoul];
            if(IS_CONFIG_SOUL.test(csoul)){
                timeLog(csoul,cObj)
                console.log(csoul,cObj)
                setMergeValue(configPathFromChainPath(csoul),cObj,newGB)//mutate gb object before the gun CB hits, that way when this done CB is called user can use gb
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
const makeaddProp = (gun, gb, timeLog) => (path) => (configObj)=>{
    let {b,t,r} = parseSoul(path)
    let propConfigArr = (Array.isArray(configObj)) ? configObj : [configObj]
    let isNode = !r
    let toPut = {}
    let newGB = JSON.parse(JSON.stringify(gb))
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
            if(IS_CONFIG_SOUL.test(csoul)){
                timeLog(csoul,cObj)
                setValue(configPathFromChainPath(csoul),cObj,gb)//mutate gb object before the gun CB hits, that way when this done CB is called user can use gb
            }
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
        if(typeof editObj !== 'object' || editObj === null)throw new Error('Must pass in an object in order to edit.')
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


const makeperformQuery = (setupQuery) => (path,isSub) => (cb, queryArr,subID) =>{
    try{
        if(isSub && !subID)throw new Error('Must specify a subscription ID!')
        queryArr = queryArr || []
        setupQuery(path,queryArr,cb,true,subID)
    }catch(e){
        console.warn(e)
        return e
    }
}
const maketypeGet = (gb,setupQuery) => (path,isSub) => (cb,props,opts)=>{
    try{
        let {b,t,r} = parseSoul(path)
        let type = t || r
        let {sortBy,skip,limit,idOnly, returnAsArray,propsByID,noID,noAdress,raw,subID} = opts || {}

        if(isSub && !subID)throw new Error('Must specify a subscription ID!')

        //soryBy = [pval,ASC|DESC,pval2,ASC|DESC,...etc]
        skip = skip || 0
        limit = limit || Infinity
        props = props || getAllActiveProps(gb,path)
        sortBy = sortBy || []
        let ret = {RETURN:[]}
        let retArg = ret.RETURN
        let matchStr = (t) ? 'MATCH (x:'+type+')' : 'MATCH ()-[x:'+type+']-()'
        let match = {CYPHER:[matchStr]}

        let retFirstArg = {limit,skip,idOnly}
        let retSecArg = {x:{returnAsArray,propsByID,noID,noAdress,raw}}

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
        console.log(retFirstArg)
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
        console.log(propArr)
        setupQuery(path,queryArr,cb,!!isSub,isSub && subID)
    }catch(e){
        console.warn(e)
        return e
    }
}
const makenodeGet = (gb,setupQuery) => (path,isSub) => (cb,props,opts)=>{
    try{
        let {b,t,r,i} = parseSoul(path)
        let type = t || r
        let {returnAsArray,propsByID,noID,noAdress,raw,subID} = opts || {}

        if(isSub && !subID)throw new Error('Must specify a subscription ID!')
        
        props = props || getAllActiveProps(gb,path)
        let ret = {RETURN:[]}
        let retArg = ret.RETURN

        //Match
        let matchStr = (t) ? 'MATCH (x:'+type+')' : 'MATCH ()-[x:'+type+']-()'
        let match = {CYPHER:[matchStr]}

        //return
        let retFirstArg = {}
        let retSecArg = {x:{returnAsArray,propsByID,noID,noAdress,raw}}
        retArg.push(retFirstArg)
        let propArr = []
        let withP = makeSoul({b,t,r,p:true})
        for (const prop of props) {
            let propID = findID(gb,prop,withP)
            propArr.push(propID)
        }
        retSecArg.x.props = propArr
        retArg.push(retSecArg)

        //filter
        let filter = {FILTER:['x','ID('+path+')']}

        let queryArr = [match,ret,filter]
        setupQuery(path,queryArr,cb,!!isSub,subID)
    }catch(e){
        console.warn(e)
        return e
    }
}
const makeaddressGet = (setupQuery) => (path,isSub) => (cb,opts)=>{
    try{
        let soulObj = parseSoul(path)
        let {b,t,r,i,p} = soulObj
        let type = t || r
        let {returnAsArray,propsByID,noID,noAdress,raw,subID} = opts || {}

        if(isSub && !subID)throw new Error('Must specify a subscription ID!')
        
        let props = [p]
        let ret = {RETURN:[]}
        let retArg = ret.RETURN

        //Match
        let matchStr = (t) ? 'MATCH (x:'+type+')' : 'MATCH ()-[x:'+type+']-()'
        let match = {CYPHER:[matchStr]}

        //return
        let retFirstArg = {}
        let retSecArg = {x:{returnAsArray,propsByID,noID,noAdress,raw}}
        retArg.push(retFirstArg)
        
        retSecArg.x.props = props
        retArg.push(retSecArg)

        //filter
        delete soulObj.p
        delete soulObj['.']
        let nodePath = makeSoul(soulObj)
        let filter = {FILTER:['x','ID('+nodePath+')']}

        let queryArr = [match,ret,filter]
        setupQuery(path,queryArr,cb,!!isSub,subID)
    }catch(e){
        console.warn(e)
        return e
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
        setMergeValue(configPathFromChainPath(makeSoul({b,t})),configObj,altgb)
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
                    triggerConfigUpdate()//fire callback for app code to get new config data.
                    for (const newSoul in result) {
                        let put = result[newSoul]
                        putData(gun, newGB, getCell, false, timeLog, timeIndex, false, newSoul, put, {isNew:true,isUnique:true}, function(err){
                            console.log('put errors',newSoul,err)
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
const makeshowgsub = (querySub,addrSubs,nodeSubs) => () =>{
    return [querySub,addrSubs,nodeSubs]
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
    makeaddressGet
}