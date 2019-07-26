const {convertValueToType,
    configPathFromChainPath,
    configSoulFromChainPath,
    findRowID,
    findID,
    getValue,
    setValue,
    removeFromArr,
    handleRowEditUndo,
    findHIDprop,
    rand,
    makeSoul,
    parseSoul,
    DATA_INSTANCE_NODE,
    PROPERTY_PATTERN,
    IS_CONFIG_SOUL,
    putData,
    newID,
    gunGet,
    gunPut,
    IS_CONFIG,
    ALL_INSTANCE_NODES,
    CONFIG_SOUL,
    toAddress,
    removeP,
    lookupID
} = require('../gbase_core/util')

const {verifyLinksAndFNs, ALL_LINKS_PATTERN} = require('../function_lib/function_utils')

//CONFIG FUNCTIONS
const newBaseConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Base'
    let archived = config.archived || false
    let deleted = config.deleted || false
    let inheritPermissions = config.inheritPermissions || true
    return {alias, archived, deleted, inheritPermissions}
}
const newNodeTypeConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Node Type ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    let log = config.log || false
    let externalID = config.externalID || '' //pval of which prop is an ID
    let humanID = config.humanID || ''
    return {alias, log, archived, deleted, externalID, humanID}
}
const newNodePropConfig = (config) =>{
    config = config || {}
    let defType = {data:'string',date:'number',pickList:'string',file:'string'}

    let alias = config.alias || 'New property ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    let hidden = config.hidden || false
    let propType = config.propType || 'data' //data, date, pickList, pickMultiple, prev ,next, lookup, ids
    let allowMultiple = config.allowMultiple || false
    let required = config.required || false 
    let sortval = config.sortval || 0
    let defaultval = config.defaultval || null //null represents no default. Anything other than null will be injected at node creation.
    let autoIncrement = config.autoIncrement || "" // must be a number, value after comma is optional start value. ie: 1,11500 (11500,11501,etc)
    let enforceUnique = config.enforceUnique || false // used to ensure unique values, must be 'string' or 'number'
    let fn = config.fn || "" 
    let usedIn = JSON.stringify([])
    let format = config.format || ""
    let pickOptions = config.pickOptions || JSON.stringify([])
    let dataType = config.dataType || defType[propType] || 'string' //string,number,boolean,set
    if(['labels','state'].includes(propType))hidden = true
    if(allowMultiple || propType === 'labels'){
        dataType = 'unorderedSet'
    }else if(autoIncrement){
        dataType = 'number'
    }

    return {alias, archived, deleted, hidden, propType, dataType, sortval, required, defaultval, autoIncrement, enforceUnique, fn, usedIn, pickOptions, format, allowMultiple}
}
const newRelationshipConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Relationship ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    return {alias, archived, deleted}
}
const newRelationshipPropConfig = (config) =>{
    config = config || {}
    let defType = {data:'string',date:'number',pickList:'string',labels:'unorderedSet'}
    let alias = config.alias || 'New property ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    let hidden = config.hidden || false
    let propType = config.propType || 'data' //lookup is basically prev, but it is only a one-way link (next is stored as a relation?)
    let dataType = config.dataType || defType[propType] || 'string' //string,number,boolean,set
    let required = config.required || false 
    let defaultval = config.defaultval || null 
    let format = config.format || ""
    let pickOptions = config.pickOptions || JSON.stringify([])
    let allowMultiple = config.allowMultiple || false
    let sortval = config.sortval || 0
    if(['state'].includes(propType))hidden = true
    return {alias, archived, deleted, hidden,sortval, propType, dataType, required, defaultval, pickOptions, format, allowMultiple}
}
const validDataTypes = ["string", "number", "boolean", "unorderedSet", "array"]
const validNodePropTypes = ["data", "date", "pickList", "labels", "state", "function", "file"]
const validRelationPropTypes = ["data", "date", "pickList", "file","source","target","state","function"]
const validNumberFormats = ['AU', '%',]
const checkConfig = (validObj, testObj, type) =>{//use for new configs, or update to configs
    if(!type)throw new Error('Must specify whether this is a node or a relation')
    let validPropTypes = (type === 'node') ? validNodePropTypes : validRelationPropTypes
    //whichConfig = base, table, column, ..row?
    let nullValids = {string: true, number: true, boolean: true, null: true, object: false, function: false}
    for (const key in testObj) {
        let testVal = testObj[key]
        if (validObj[key] !== undefined) {//key is valid
            const tTypeof = (testObj[key] === null) ? null : typeof testObj[key];
            const vTypeof = (validObj[key] === null) ? null : typeof validObj[key]
            if(validObj[key] === null && (!nullValids[tTypeof] || testObj[key] !== null)){//wildcard check
                let err = 'typeof value must be one of: '+ Object.keys(nullValids).join(', ')
                throw new Error(err)
            }else if(vTypeof !== tTypeof){
                let test
                try {//want to allow the JSON arrays through
                    test = JSON.parse(validObj[key])
                    if(!Array.isArray(test))throw new Error()
                } catch (error) {
                    let err = vTypeof + ' !== '+ tTypeof + ' at: '+key
                    throw new Error(err)
                }
            }
            if(key === 'propType' && !validPropTypes.includes(testObj[key])){//type check the column data type
                let err = 'propType does not match one of: '+ validPropTypes.join(', ')
                throw new Error(err)
            }
            if(key === 'dataType' && !validDataTypes.includes(testObj[key])){//type check the column data type
                let err = 'dataType does not match one of: '+ validDataTypes.join(', ')
                throw new Error(err)
            }
            if(key === 'autoIncrement' && testVal){
                //check autoIncrement format
                validateAutoIncrement(testVal)
            }
        }else{
            console.warn(key + ' does not match valid keys of: '+ Object.keys(validObj).join(', '))
            delete testObj[key]
        }
    }
    function validateAutoIncrement(val){
        let vals = val.split(',')
        let a = vals[0]*1
        let b = (vals[1] === undefined) ? 0 : vals[1]*1
        if(isNaN(a) || isNaN(b)){
            throw new Error('Invalid autoIncrement value. Should be String(Number()) OR String(Number()+","+Number())')
        }else{
            testObj.autoIncrement = (vals[1] === undefined) ? a : [a,b].join(',')
        }
    }
}

function handleConfigChange(gun,gb,getCell,cascade,solve,timeLog,timeIndex, configObj, path, opts, cb){
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    //this._path from wherever config() was called
    let {isNew,internalCB} = opts || {}
    cb = (cb instanceof Function && cb) || function(){}
    let {b,t,r,p} = parseSoul(path)
    let cpath = configPathFromChainPath(path)
    let csoul = configSoulFromChainPath(path)
    let thisConfig = getValue(cpath,gb) || {}
    let toPut = {},configPuts={}, cPut = configPuts[csoul] = {}, tempStore = {},soulList = [],run = []
    let convertData = false,err, typeChange = false
    let pType = (configObj.propType !== undefined) ? configObj.propType : thisConfig.propType
    let delimiter = configObj.delimiter || ', '
    let pathType
    verifyConfig()//attempts to throw errors if anything is invalid and sets the dataType it should be.
    
    let configAPIPropType = ['data','date','pickList','function']
    let complexConfigs = ['externalID','format','enforceUnique']
    for (const key in configObj) {//split config obj based on keys
        const value = configObj[key];
        if(!complexConfigs.includes(key) || isNew)cPut[key] = value//these config vals have no additional checks needed
        else if(['enforceUnique'].includes(key) && value)run.push(['checkUnique',[null]])
        else if(key === 'propType' && value !== thisConfig.propType && configAPIPropType.includes(value))typeChange = value
        else if(key === 'externalID'){
            cPut[key] = value
            if(value !== ''){
                run.push(['checkUnique',[null]]);
                p = value;
            }else{
                p = thisConfig.externalID
            }
            let pSoul = configSoulFromChainPath(makeSoul({b,t,r,p}))
            addToPut(pSoul,{enforceUnique: !!value},configPuts)
        }
    }

    //below is the config router, can only take one 'path', but can have more than one 'utilCall'
    if(isNew){
        run.push(['setupNew',[null]])
    }else if(configObj.deleted){
        run.push(['delete',[null]])
    }else if(configObj.archived){
        run.push(['archive',[null]])
    }else if(typeChange){//change propType
        run.push(['changePropType',[null]])
    }else if(configObj.fn && thisConfig.propType === 'function'){//update function
        run.push(['handleFN',[configObj]])
    }else if(!run.length && !Object.keys(cPut).length){
        throw new Error('No configs to change')
    }
    const util = {
        changeDataType: function(toType){//only used to convert all values for property this config() was called for. any others need manual conversion
            let from = thisConfig.dataType
            let toSingle = (configObj.allowMultiple === false && thisConfig.allowMultiple === true) ? true : false
            if(['unorderedSet','array'].includes(from) && !['unorderedSet','string','array'].includes(toType)){
                //would not be running this call if from === to
                throwErr('Can only change unorderedSet to: "array" or "string". Can only change an array to: "unorderedSet" or "string"')
                return
            }
            getList(function(list){
                console.log(list)
                for (const idOnList in list) {
                    const value = list[idOnList];
                    if(Array.isArray(value) && toSingle && value.length > 1){
                        throwErr('Too many values in Array for {allowMultiple: false} setting. nodeID:', idOnList)
                        return
                    }
                    try {
                        let v = convertValueToType(value,toType,idOnList,delimiter)
                        tempStore[idOnList] = v
                        addToPut(idOnList,{[p]:v},toPut)//might be overwritten later, but if not, this is the only time it is added to the output
                    } catch (error) {
                        if(pType === 'date'){
                            throwErr('Cannot parse values into a date.')
                        }else{
                            throwErr(error)
                        }
                        return
                    }
                }
                runNext()
            })
            function getList(cb){
                let stateSoul = makeSoul({b,t,r,i:true})
                let toObj = {}
                let soulList = []
                gun.get(stateSoul).once(function(data){
                    if(data === undefined){cb.call(cb,toObj); return}//for loop would error if not stopped
                    for (const soul in data) {
                        if(!ALL_INSTANCE_NODES.test(soul))continue
                        if(data[soul] !== null){//not Deleted
                            //this means `false` will pass through, so archived items will still keep increment and unique values enforced
                            soulList.push(soul)
                        }
                    }
                    let toGet = soulList.length
                    if(!toGet)cb.call(cb,toObj)
                    for (const soul of soulList) {
                        getCell(soul,p,function(val,from){
                            let addr = toAddress(soul,p)
                            let [fromSoul] = removeP(from)
                            toGet--
                            if(addr === from){
                                toObj[fromSoul] = val
                            }
                            if(!toGet){
                                cb.call(cb,toObj)
                            }
                        },true)
                    }
                })
            }
        },
        checkUnique: function(){
            getList(function(list){
                list = list || {}
                let vals = Object.values(list)
                let set = new Set(vals)
                if(set.size !== vals.length){
                    let all = Object.entries(list)
                    let same = {}
                    for (const [soul,val] of all) {
                        let v = String(val)
                        if(!same[v])same[v] = soul
                        else if(Array.isArray(same[v]))same[v].push(soul)
                        else{
                            let firstSoul = same[v]
                            same[v] = [firstSoul,soul]
                        }
                    }
                    let conflictSouls = Object.values(same).filter(x=>Array.isArray(x)).reduce((p,c)=>{p.concat(c)})
                    throwErr('Non-Unique values already exist on souls: '+conflictSouls.join(', '))
                }
                runNext()
            })
            function getList(cb){//gets a single property off a soul {[soul]:propVal}
                let stateSoul = makeSoul({b,t,r,i:true})
                let toObj = {}
                let soulList = []
                gun.get(stateSoul).once(function(data){
                    if(data === undefined){cb.call(cb,toObj); return}//for loop would error if not stopped
                    for (const soul in data) {
                        if(!ALL_INSTANCE_NODES.test(soul))continue
                        if(data[soul] !== null){//not Deleted
                            //this means `false` will pass through, so archived items will still keep increment and unique values enforced
                            soulList.push(soul)
                        }
                    }
                    let toGet = soulList.length
                    if(!toGet)cb.call(cb,toObj)
                    for (const soul of soulList) {
                        getCell(soul,p,function(val,from){
                            toGet--
                            toObj[soul] = val
                            if(!toGet){
                                cb.call(cb,toObj)
                            }
    
                        },true)
                    }
                })
            }
        },
        changePropType: function(){
            //determine from type > to type, determine if it is possible or what calls are needed
            let {propType:fType} = thisConfig

            //undo stuff
            if(fType === 'function'){//clear out old fn values (remove all usedIn)
                run.unshift(['handleFN',[{fn:''}]])//can be ran in any order
            }
            
            //new stuff
            if (pType === 'function'){//parse equation and store
                let fn = configObj.fn
                if(!fn){throwErr('Must specify a function');return}
                //check equation for valididty? balanced () and only one comparison per comma block?
                try {
                    basicFNvalidity(fn)
                } catch (error) {
                    throwErr(error)
                    return
                }
                //handleFNColumn(path, configObj, cb) //initial change to fn column
                run.unshift(['handleFN',[configObj]])
            }else if (pType === 'pickList'){//make sure it is an array
                let opts = configObj.pickOptions
                if(!opts || !Array.isArray(opts)){throwErr('Must specify an array of options for {pickOptions: ["option 1","option 2"]}');return}
                cPut.pickOptions = opts
            }else if (pType === 'date'){
                //don't really need to do anything more? maybe something with format?
                //this would have the special format requirements
                if(!configObj.format)console.warn('A date format is suggested but not required. Will currently return a unix timestamp.')                
            }else if (pType === 'data'){
                //don't really need to do anything more? maybe something with format if coming from a certain type? Maybe just '' the format field?
            }else{
                throwErr('propType specified is not editable')//Should never run because checkConfig verifies it's valid (only 'source' and 'target' could get here)
            }
            cPut.propType = pType
            runNext()
        },
        handleFN: function(argObj){
            //parse equation for all links
            let fn = argObj.fn
            let oldfn = thisConfig.fn
            try {
                verifyLinksAndFNs(gb,path,fn)
            } catch (error) {
                throwErr(error)
                return
            }
            let allLinkPattern = new RegExp(ALL_LINKS_PATTERN)
            let newLinksTo = []
            let checkmatch
            while (checkmatch = allLinkPattern.exec(fn)) {
                let path = checkmatch[1]
                newLinksTo.push(...path.split(','))
            }
            checkForCirc(gb,path,newLinksTo)
            let oldLinksTo = []
            let match
            let linkPattern = new RegExp(ALL_LINKS_PATTERN)//has global flag so need another regex object
            while (match = linkPattern.exec(oldfn)) {
                let path = match[1]
                oldLinksTo.push(...path.split(','))
            }
            let remove = oldLinksTo.filter(val => !newLinksTo.includes(val))
            let add = newLinksTo.filter(val => !oldLinksTo.includes(val))
            //console.log(add, remove)
            for (let i = 0; i < add.length; i++) {
                const link = add[i];
                let csoul = configSoulFromChainPath(link)
                let cpath = configPathFromChainPath(link)
                cpath.push('usedIn')
                let newUsedIn = getValue(cpath,gb)
                newUsedIn.push(path)
                let uniq = [ ...new Set(newUsedIn) ]
                addToPut(csoul,{usedIn: JSON.stringify(uniq)},configPuts)
            }
            for (let i = 0; i < remove.length; i++) {
                const link = remove[i];
                let csoul = configSoulFromChainPath(link)
                let cpath = configPathFromChainPath(link)
                cpath.push('usedIn')
                let newUsedIn = removeFromArr(path,getValue(cpath,gb))
                let uniq = [ ...new Set(newUsedIn) ]
                addToPut(csoul,{usedIn: JSON.stringify(uniq)},configPuts)
            }
            //console.log(usedIn)
            
            cPut.fn = fn
            let toSolve = soulList.length //NEED TO BUILD SOULLIST
            for (const rowid of soulList) {
                solve(rowid,fn,function(val){
                    addToPut(rowid,{[p]:val},toPut)
                    toSolve--
                    if(!toSolve){
                        runNext()
                    }
                })
            }
        },
        archived: function(){
            //todo: logic to archive base,nodeType,relationType,prop
            cPut.archived = true
            runNext()
        },
        deleted: function(){
            //todo: logic to delete base,nodeType,relationType,prop
            cPut.deleted = true
            runNext()
        },
        setupNew: function(){
            //look at path figure out what it is
            //look at configObj,
            //  if isType, make sure they are not doing linking in init
            //  if isProp, should be pretty much good to go?
            //generate soul, and list soul
            //list soul needs special put (no log)

            if(pathType === 'base')throwErr(new Error('Cannot create new base through the config api'))
            if(['nodeType','relationType'].includes(pathType)){
                let list
                if(pathType === 'nodeType'){//cannot set these vals on creation, forcing to default
                    //cPut.externalID = '' //allow it to be set on creation
                    list = '#' + t
                    
                }else{
                    list = '-' + r
                }
                addToPut(makeSoul({b}),{[list]:{'#':csoul}},configPuts)
            }else if(['nodeProp','relationProp'].includes(pathType)){
                cPut.fn = "" 
                addToPut(makeSoul({b,t,r}),{[p]:{'#':csoul}},configPuts)
            }
            runNext()
        }
    }
    //start logic

    console.log(JSON.stringify(run))
    runNext()

    
    function verifyConfig(){
        for (const key in configObj) {
            const value = configObj[key];
            const cur = thisConfig[key]
            if(value === cur){
                delete configObj[key]
            }
        }
        if(!Object.keys(configObj).length){
            throwErr(new Error('New config matches old config, nothing changed.'))
        }
        
        let validConfig
        let type = (t) ? 'node' : 'relation'
        if(p && t){//node Prop
            pathType = 'nodeProp'
            validConfig = newNodePropConfig()
        }else if(p && r){//relation prop
            pathType = 'relationProp'
            validConfig = newRelationshipPropConfig()
        }else if(t){//nodeType
            pathType = 'nodeType'
            validConfig = newNodeTypeConfig()
        }else if(r){//relationType
            pathType = 'relationType'
            validConfig = newRelationshipConfig()
        }else{//base (or row, but validConfig is not called)
            pathType = 'base'
            validConfig = newBaseConfig()
        }
        // let validNew = ["data", "date", "pickList", "file"]
        // if(isNew && ['nodeProp','relationProp'].includes(pathType) && !validNew.includes(configObj.propType)){
        //     throw new Error('New properties can only be created as one of these propTypes: '+validNew.join(', '))
        // }
        //these should throw errors and stop the call if they don't pass
        checkConfig(validConfig, configObj,type) //SHOULD ADD VALIDATION FOR SPECIAL PROP STRING FORMATTING (format?)
        checkName()
        if(['nodeType','relationType'].includes(pathType)){
            if(configObj.externalID && configObj.externalID !== '' && !isNew){
                let isID = findID(gb,configObj.externalID,makeSoul({b,t,r,p:configObj.externalID}))
                if(isID === undefined)throw new Error('Cannot locate the property specified for the externalID')
                configObj.externalID = isID
            }
            return
        } //rest is for properties
        handleSortval()
        //config obj has valid keys/values, next is figuring out if the dataType is valid
        let dType = (configObj.dataType !== undefined) ? configObj.dataType : thisConfig.dataType
        let allowMultiple = (configObj.allowMultiple !== undefined) ? configObj.allowMultiple : thisConfig.allowMultiple
        let enforceUnique = (configObj.enforceUnique !== undefined) ? configObj.enforceUnique : thisConfig.enforceUnique
        let autoIncrement = (configObj.autoIncrement !== undefined) ? configObj.autoIncrement : thisConfig.autoIncrement
        let requiredType = requiredTypes()
        //console.log(pType, dType, requiredType)
        if(!requiredType.includes(dType)){
            dType = requiredType[0]//take first (or only) one
            if(configObj.dataType && configObj.dataType !== dType){
                console.warn('Setting dataType to: '+dType+'. Instead of the requested type: '+configObj.dataType)
            }
        }
        let listOnly = false

        //determine what needs to change
        if(dType !== thisConfig.dataType){//need to change the dataType
            console.warn('setting dataType to:',dType)
            convertData = dType
            getData = true
        }else if((enforceUnique && !thisConfig.enforceUnique) || configObj.externalID){//turning on enforceUnique, dataType is already correct
            getData = true
        }else if(configObj.fn){
            getData = true
            listOnly = true
        }
        if(!isNew && convertData)run.push(['changeDataType',[convertData]])
        cPut.dataType = dType
        let o = {allowMultiple,enforceUnique,autoIncrement}
        Object.assign(cPut,o)
        function requiredTypes(){
            if(autoIncrement){
                if(pType === 'data')return ['number']
                throw new Error('An AutoIncrement property must be of type "data".')
            }
            if(enforceUnique){
                if(pType === 'data')return ['string','number']
                if(pType === 'date')return ['number']
                throw new Error('An enforceUnique property must be of type "data" or "date".')
            }
            if(pType === 'data')return ['string','number','boolean','unorderedSet','array','file']
            if(pType === 'date')return ['number']
            if((pType === 'pickList' && allowMultiple) || pType === 'labels')return ['unorderedSet']
            if((pType === 'pickList' && !allowMultiple) || pType === 'function')return ['string','number']
            return ['string']
        }
        function checkName(){
            let aliasNotUnique = (configObj.alias) ? lookupID(gb,configObj.alias,path) : false
            if(aliasNotUnique)throwErr(new Error('`alias` is not unique'))
        }
        function handleSortval(){
            let {sortval} = configObj
            if(sortval === undefined && !isNew)return
            let {props} = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb) || {}
            let copyProps = JSON.parse(JSON.stringify(props))
            let copyConfig = JSON.parse(JSON.stringify(configObj))
            if(isNew && (copyConfig.sortval === undefined || copyConfig.sortval === 0))copyConfig.sortval = Infinity
            copyProps[p] = copyConfig
            console.log(p,copyProps[p])
            let things = Object.entries(copyProps)
            things.sort((a,b)=>a[1].sortval-b[1].sortval)
            console.log(things.map(x=>[x[0],x[1].sortval]))
            for (let i = 0; i < things.length; i++) {
                const [pval] = things[i];
                let normalized = (i+1)*10
                let cur = copyProps[pval] && copyProps[pval].sortval && copyProps[pval].sortval
                let different = cur !== normalized
                if(different){
                    let thisSoul = configSoulFromChainPath(makeSoul({b,t,r,p:pval}))
                    addToPut(thisSoul,{sortval:normalized},configPuts)
                }
            }
            delete configObj.sortval
        }
    }
    
    function runNext(){
        if(run.length && !err){
            let [fn, args] = run[0]
            run.shift()
            util[fn](...args)
        }else if(!err){
            validateConfigPut()
        }
        
    }
    function validateConfigPut(){
        //stringify keys that are objects(should all be arrays)
        //check format with the final propType/dataType values
        try {
            checkFormat()
            deDupAndCheckTypes()
        } catch (error) {
            throwErr(error)
            return
        }
        done()

    }
    function done(){
        if(err !== undefined)return
        let dataToPut = Object.keys(toPut).length
        if(internalCB && internalCB instanceof Function){
            internalCB.call(this,{path,configPuts,toPut})
        }else{
            putConfigs()
            if(!isNew && dataToPut){
                console.log('Data changed from config: ',toPut)
                for (const nodeID in toPut) {//data soul = dataID, (!#$ || !-$) or it is lookupNexts !#$[lookup
                    const putObj = toPut[nodeID];
                    putData(gun, gb, getCell, cascade, timeLog, timeIndex, false, nodeID, putObj, {own:true}, function(err){
                        if(err){
                            throwErr(err)
                            return
                        }
                        dataToPut--
                    })
                }
            }
        }

        
        function putConfigs(){
            console.log('putting configs',configPuts)  
            for (const csoul in configPuts) {//put all configs in
                const cObj = configPuts[csoul];
                if(!Object.keys(cObj).length)continue
                if(CONFIG_SOUL.test(csoul))timeLog(csoul,cObj)
                //merge before put so putData will work
                let cpath = configPathFromChainPath(csoul)
                setValue(cpath,cObj,gb,true)
                gun.get(csoul).put(cObj)
            }
            cb.call(cb,undefined)
        }
    }
    function checkFormat(){
        //must jive with propType/dataType
        //use the GBASE FUNCTION library
        //rounding, join, etc
        //formatting date would need to be added... 
        //could be done easily, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString can JSON.stringify(options)
        let error = false
        //logic to check format works with whatever propType && dataType is present in cPut
        if(error){
            err = new Error(error)
            cb.call(cb,err)
            throw err
        }
    }
    function checkHumanIdentifier(){
        let tcon = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb)
        for (const pval in tcon) {
            const {humanIdentifier} = tcon[pval];
            if(humanIdentifier && pval !== p){//make any other identifer false, allows a simple change over.
                addToPut(configSoulFromChainPath(makeSoul({b,t,r,p:pval})),{humanIdentifier: false},configPuts)
            }
        }
    }
    function deDupAndCheckTypes(){
        //only catch any properties that were arrays and make them JSON
        for (const csoul in configPuts) {
            const cObj = configPuts[csoul];
            let curC = getValue(configPathFromChainPath(csoul),gb) || {}

            for (const key in cObj) {
                let v = cObj[key];
                let curv = curC[key]
                if(Array.isArray(v)){
                    cObj[key] = v = JSON.stringify(v)
                }
                if(Array.isArray(curv)){
                    curv = JSON.stringify(curv)
                }
                if(curv === v){
                    delete configPuts[csoul][key]
                    continue
                }                    
            }
                
        }
    }
    function throwErr(errmsg){
        errmsg = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = errmsg
        cb.call(cb,errmsg)
        console.log(errmsg)
    }
    function addToPut(soul,putObj,collector){
        if(!collector[soul]){
            collector[soul] = putObj
        }else{
            Object.assign(collector[soul],putObj)
        }
    }
}


//FN STUFF
function basicFNvalidity(fnString){
    let replaceBackTicks = fnString.replace(/`.*`/g,0)//things in backticks could contain ",<>=!()" would break things, replace with 0
    let args = replaceBackTicks.split(',')
    let lpar = 0
    let rpar = 0
    for (let i = 0; i < replaceBackTicks.length; i++) {
        const char = replaceBackTicks[i];
        if(char === '('){
            lpar++
        }else if(char === ')'){
            rpar++
        }
    }
    if(lpar !== rpar){
        throw new Error('Check Equation, the parenthesis are unbalanced.')
    }
    for (let i = 0; i < args.length; i++) {
        let block = args[i]
        let operators = /(>=|=<|!=|>|<|=)/g
        let str = block.replace(/\s/g,"")
        let found = [...str.matchAll(operators)]
        if(found.length > 1)throw new Error('Can only have one comparison operator per T/F block: '+ block)
    }
    return true
}
function checkForCirc(gb, origpath, checkpathArr){//see if add this function will create a circular reference
    // get an object of all columns and their usedIn
    //while lookForArr is not empty >> foreach lookForArr Fullcollector.push && whileCollector.push all new links, set lookForArr = whileCollector??
    //after while loop stops, all usedIn's are traversed.
    //fullcollector should not include origpath
    let cols = {}
    let {b} = parseSoul(origpath)
    let {usedIn} = getValue(configPathFromChainPath(origpath),gb)
    let {props, relations} = getValue(configPathFromChainPath(makeSoul(b)),gb)
    if(usedIn.length === 0){return true}
    for (const t in props) {
        let pprops = props[t]
        for (const p in pprops) {
            const {usedIn} = pprops[p];
            let thisPath = makeSoul({b,t,p})
            cols[thisPath] = usedIn
        }
    }
    for (const r in relations) {
        let pprops = relations[r]
        for (const p in pprops) {
            const {usedIn} = pprops[p];
            let thisPath = makeSoul({b,r,p})
            cols[thisPath] = usedIn
        }
    }
    let lookFor = usedIn
    let collector = []
    let safety = 0
    //console.log(cols)
    while (lookFor.length !== 0 && safety < 500) {//will get stuck if there is already a circular reference
        safety++
        let nextLook = []
        for (let i = 0; i < lookFor.length; i++) {
            const link = lookFor[i];
            if(cols[link]){
                collector = collector.concat(cols[link])
                nextLook = nextLook.concat(cols[link])
            }
        }
        lookFor = nextLook
    }
    if(safety >= 500){
        throw new Error('Already existing ciruclar reference detected')
    }
    console.log(collector, safety)
    for (let i = 0; i < checkpathArr.length; i++) {
        const path = checkpathArr[i];
        if(collector.includes(path)){
            let err = 'Adding this function will create a cirular reference through: '+ path
            throw new Error(err)
        }
    }
    return true
}
const makehandleFNColumn = (gun,gb,gunSubs,cache,loadColDataToCache, cascade, solve) => function handlefncol(path,configObj,cb){//DEPRECATED
    //parse equation for all links
    try{
        cb = (cb instanceof Function && cb) || function(){}
        let [base,tval,pval] = path.split('/')
        loadColDataToCache(base,tval,pval)
        let cpath = configPathFromChainPath(path)
        let thisColConfig = getValue(cpath,gb)
        let thisColConfigSoul = configSoulFromChainPath(path)
        let fn = configObj.fn
        let oldfn = thisColConfig.fn
        verifyLinksAndFNs(gb,path,fn)
        let allLinkPattern = new RegExp(ALL_LINKS_PATTERN)
        let links = []
        let checkmatch
        while (checkmatch = allLinkPattern.exec(fn)) {
            let path = checkmatch[1]
            links.push(path.split(','))
        }
        let usedInLinks = []
        for (let i = 0; i < links.length; i++) {
            const linkArr = links[i];
            let link
            if (linkArr.length === 1){
                link = linkArr[0]
            }else{
                link = linkArr[1]
            }
            usedInLinks.push(link)
        }
        checkForCirc(gb,path,usedInLinks)
        let oldLinksTo = []
        let newLinksTo = []
        let match
        while (match = allLinkPattern.exec(oldfn)) {
            let path = match[1]
            oldLinksTo = oldLinksTo.concat(path.split(','))
        }
        while (match = allLinkPattern.exec(fn)) {
            let path = match[1]
            newLinksTo = newLinksTo.concat(path.split(','))
        }
        let remove = oldLinksTo.filter(val => !newLinksTo.includes(val))
        let add = newLinksTo.filter(val => !oldLinksTo.includes(val))
        //console.log(add, remove)
        let usedIn = {}
        let result = {}
        let inMemory = true
        for (let i = 0; i < add.length; i++) {
            const link = add[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = getValue(cpath,gb)
            newUsedIn.push(path)
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        for (let i = 0; i < remove.length; i++) {
            const link = remove[i];
            let csoul = configSoulFromChainPath(link)
            let cpath = configPathFromChainPath(link)
            cpath.push('usedIn')
            let newUsedIn = removeFromArr(path,getValue(cpath,gb))
            let uniq = [ ...new Set(newUsedIn) ]
            usedIn[csoul] = {usedIn: JSON.stringify(uniq)}
        }
        //console.log(usedIn)
        for (let i = 0; i < newLinksTo.length; i++) {
            const link = newLinksTo[i];
            let [base,tval,pval] = link.split('/')
            let soul = link
            if(!gunSubs[soul]){
                inMemory = false
                loadColDataToCache(base,tval,pval)
            }
        }
        let data = getValue([base,tval,pval], cache)
        if(!inMemory){
            //console.log(data)
            setTimeout(handlefncol,1000,path,configObj,cb)
            return
        }else{
            for (const rowid in data) {
                let val = solve(rowid, fn)
                result[rowid] = val
            }
            // console.log(usedIn)

            for (const csoul in usedIn) {//update all usedIn's effected
                let val = usedIn[csoul]
                gun.get(csoul).put(val)
            }
            if(configObj.GBtype && configObj.GBtype !== thisColConfig.GBtype){//update the config type, this is a changeColType
                gun.get(thisColConfigSoul).put({GBtype: 'function'})
            }
            gun.get(thisColConfigSoul).put({fn: fn})//add fn to config
            let colSoul = [base,tval,pval].join('/')
            //console.log(result)
            gun.get(colSoul).put(result)//put the new calc results in to gun

            //need to check if this col is used in anything else and manually start the cascades
            let triggers = thisColConfig.usedIn
            if(triggers.length){
                let rows = getValue([base,'props',tval,'rows'])
                //console.log(rows, pval)
                for (const rowid in rows) {
                    cascade(rowid, pval)
                }
            }
            cb.call(this,undefined)
        }
    }catch(e){
        console.log(e)
        cb.call(this, e)
        return
    }
}


function handleNewLinkColumn(gun, gb, gunSubs, newColumn, loadColDataToCache, prev, next,cb){//DEPRECATED
    // let prevConfig = {path,colSoul, data: prevPutObj}
    // let nextConfig = {path: configObj.linksTo,nextLinkCol: backLinkCol, data: nextPutObj}
    cb = (cb instanceof Function && cb) || function(){}
    gunSubs[prev.colSoul] = false
    if(next.colSoul){//all data
        gunSubs[next.colSoul] = false
        gun.get(next.colSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            //gun.get(next.colSoul).put(next.data)
            let [base,tval,pval] = next.colSoul.split('/')
            for (const rowid in next.data) {
                const linksObj = next.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: next.nextLinkCol})
        if (prev.data !== undefined) {
            //gun.get(prev.colSoul).put(prev.data)
            let [base,tval,pval] = prev.colSoul.split('/')
            for (const rowid in prev.data) {
                const linksObj = prev.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
        cb.call(this,undefined)
    }else{//create new next col on linksTo sheet
        console.log(next.path)
        let [nextb,nextt] = next.path.split('/')
        let call = newColumn(next.path)
        let [pbase,ptval]=prev.path.split('/')
        let {alias} = getValue([pbase,'props',ptval],gb)
        let nextP = call(alias)
        if(next.data === undefined){
            next.data = false
        }
        console.log(nextP)
        if(nextP[0] !== 'p'){return console.log('did not return a new pval for new next col')}
        let nextColSoul = [nextb,nextt,nextP].join('/')
        gun.get(nextColSoul + '/config').put({GBtype: 'next', linksTo: prev.path})
        if (next.data !== undefined) {
            //gun.get(nextColSoul).put(next.data)
            for (const rowid in next.data) {
                const linksObj = next.data[rowid];
                let linkSoul = rowid +'/links/'+nextP
                gun.get(linkSoul).put(linksObj)
            }
            gunSubs[nextColSoul] = false
            let [base,tval,pval]=nextColSoul.split('/')
            loadColDataToCache(base,tval,pval)
        }
        

        gun.get(prev.colSoul + '/config').put({GBtype: 'prev', linksTo: nextColSoul})
        if (prev.data !== undefined) {
            //gun.get(prev.colSoul).put(prev.data)
            let [base,tval,pval] = prev.colSoul.split('/')
            for (const rowid in prev.data) {
                const linksObj = prev.data[rowid];
                let linkSoul = rowid +'/links/'+pval
                gun.get(linkSoul).put(linksObj)
            }
            loadColDataToCache(base,tval,pval)
        }
        cb.call(this, undefined)
    }
    
}


//IMPORT STUFF
const handleImportColCreation = (altgb, path, colHeaders, datarow, opts)=>{
    // create configs
    let {b,t,r} = parseSoul(path)
    let {props:cols} = (t || r) && getValue(configPathFromChainPath(path), altgb) || {}
    let {externalID,labels,source,target,append} = opts || {}
    let newConfigs = []
    let aliasLookup = {}
    let externalIDidx = externalID && colHeaders.indexOf(externalID)
    let labelIDidx = labels && colHeaders.indexOf(labels)
    let sourceIDidx = source && colHeaders.indexOf(source)
    let targetIDidx = target && colHeaders.indexOf(target)

    for (let i = 0; i < colHeaders.length; i++) {
        let col = colHeaders[i]
        let p = cols && findID(cols, col)
        let propType, dataType
        if((cols === undefined || p === undefined) && append){//need to create a new property
            p = newID(altgb,makeSoul({b,t,r,p:true})) 
            const palias = String(col);
            let enforceUnique = (externalIDidx === i) ? true : false
            let val = (datarow[i] === undefined) ? '' : datarow[i]//default to string
            dataType = typeof val//if from tsv parse, can only be string or number, if user passed in an array, could be anything
            if(dataType === 'string'){
                try {//if anything is JSON, attempt to get the real data value
                    val = JSON.parse(val)
                } catch (error) {
                    //nope, leave as is
                }
            }
            if(typeof val === 'number')dataType = 'number'
            else if(Array.isArray(val))dataType = 'array'
            else if(typeof val === 'boolean')dataType = 'boolean'
            else if(typeof val === 'object')dataType = 'string'//will stringify the object
            propType = 'data'
            //overrides vvvv
            if(labelIDidx === i){
                propType = 'labels'
                dataType = 'unorderedSet'
            }else if(sourceIDidx === i){
                propType = 'source'
                dataType = 'string'
            }else if(targetIDidx === i){
                propType = 'target'
                dataType = 'string'
            }

            let pconfig = (t) ? newNodePropConfig({alias: palias, propType, dataType,enforceUnique}) : newRelationshipPropConfig({alias: palias, propType, dataType,enforceUnique})
            pconfig.id = p
            setValue(configPathFromChainPath(makeSoul({b,t,r,p})),pconfig,altgb,true)
            newConfigs.push(pconfig)
        }
        aliasLookup[col] = p
    }
    return [newConfigs,aliasLookup]
}


const loadAllConfigs = (gbGet,path,cb) =>{
    //will load full configs from depth specified, downwards
    let cPath = configPathFromChainPath(path)
    let {b,t,r} = parseSoul(path)
    let gb = gbGet()
    let {relations,props} = getValue(cPath,gb)//if it is a base, then relations will have something , else only props
    let output = []

    if(!t && !r){//if this is asking to load in the whole base...
        output.push([path,Object.keys(newNodeTypeConfig())])
    }
    if(relations){
        let rK = Object.keys(newRelationshipConfig())
        for (const rval in relations) {
            const pObj = relations[rval].props;
            let rSoul = makeSoul({b,r:rval})
            output.push([rSoul,rK])
            let rpK = Object.keys(newRelationshipPropConfig())
            for (const pval in pObj) {
                let rpSoul = makeSoul({b,r:rval,p:pval})
                output.push([rpSoul,rpK])
            }
        }
    }
    if(props && !t && !r){
        let tK = Object.keys(newNodeTypeConfig())
        for (const tval in props) {
            const pObj = props[tval].props;
            let tSoul = makeSoul({b,t:tval})
            output.push([tSoul,tK])
            let rpK = Object.keys(newNodePropConfig())
            for (const pval in pObj) {
                let tpSoul = makeSoul({b,t:tval,p:pval})
                output.push([tpSoul,rpK])
            }
        }
    }else if(props){//just a prop
        let ks = t && Object.keys(newNodePropConfig()) || r && Object.keys(newRelationshipPropConfig())
        for (const pval in props) {
            let pSoul = makeSoul({b,t,r,p:pval})
            output.push([pSoul,ks])
        }

    }
    gbGet(output,cb)
}

const gbGet = (gb) => (gun) => (pathArgs,cb) =>{
    //pathArgs = [[path, [arrOfProps] || falsy(getAll)]]
    if(cb === undefined)return gb//short circuit so we can access gb to grab ids
    let needed = [] //[[soul,prop],[soul,prop]]

    for (const [path,requestedKeys] of pathArgs) {
        let cSoul = configSoulFromChainPath(path)
        if(!CONFIG_SOUL.test(cSoul))continue
        let type = IS_CONFIG(cSoul)
        let allKeys
        if(type === 'baseConfig')allKeys = Object.keys(newBaseConfig())
        else if(type === 'thingConfig' && path.includes('#'))allKeys = Object.keys(newNodeTypeConfig({alias:path}))
        else if(type === 'thingConfig' && path.includes('-'))allKeys = Object.keys(newRelationshipConfig({alias:path}))
        else if(type === 'propConfig' && path.includes('#'))allKeys = Object.keys(newNodePropConfig({alias:path}))
        else if(type === 'propConfig' && path.includes('-'))allKeys = Object.keys(newRelationshipPropConfig({alias:path}))
        if(!allKeys)continue//something invalid?
        let pathArr = configPathFromChainPath(path)
        let has = getValue(pathArr,gb)
        for (const key of allKeys) {
            let thisPath = pathArr.slice()
            thisPath.push(key)
            if(requestedKeys){
                if(!requestedKeys.includes(key))continue //looking for specific keys, but not this one
                if(has && has[key] !== undefined)continue
                let thisPath = pathArr.slice()
                thisPath.push(key)
                needed.push([cSoul,key,thisPath])
            }else{
                if(has && has[key] !== undefined)continue
                needed.push([cSoul,key,thisPath])
            }
        }
    }
    if(!needed.length)cb(gb)
    else{
        const get = gunGet(gun)
        let toGet = needed.length
        for (const [soul,prop,pathArr] of needed) {
            get(soul,prop,function(value){
                //will be type config or prop config 
                if(value === undefined){//should never happen?
                    setValue(pathArr,null,gb)
                }else{
                    if(['usedIn','pickOptions'].includes(prop))value = JSON.parse(value)
                    setValue(pathArr,value,gb)
                }
                toGet--
                if(!toGet)cb(gb)
            })
        }
    }
}


module.exports = {
    newBaseConfig,
    newNodeTypeConfig,
    newRelationshipConfig,
    newRelationshipPropConfig,
    newNodePropConfig,
    handleConfigChange,
    handleImportColCreation,
    checkConfig,
    basicFNvalidity,
    gbGet,
    loadAllConfigs
}