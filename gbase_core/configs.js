const {convertValueToType,
    configPathFromChainPath,
    configSoulFromChainPath,
    findRowID,
    findID,
    getValue,
    setMergeValue,
    removeFromArr,
    handleRowEditUndo,
    checkUniques,
    findHIDprop,
    rand,
    makeSoul,
    parseSoul,
    NODE_SOUL_PATTERN,
    PROPERTY_PATTERN,
    sortPutObj
} = require('../gbase_core/util')

const {verifyLinksAndFNs, ALL_LINKS_PATTERN} = require('../function_lib/function_utils')

//CONFIG FUNCTIONS
const newBaseConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Base'
    let archived = config.archived || false
    let deleted = config.deleted || false
    let inheritPermissions = config.inheritPermissions || true
    return {alias, archived, deleted,inheritPermissions}
}
const newNodeTypeConfig = (config) =>{
    config = config || {}
    let alias = config.alias || 'New Node Type ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    let log = config.log || false
    let parent = config.parent || ''
    let variants = config.variants || false //newFrom()
    let externalID = config.externalID || '' //pval of which prop is an ID
    return {alias, log, archived, deleted, parent, variants, externalID}
}
const newNodePropConfig = (config) =>{
    config = config || {}
    let defType = {data:'string',date:'number',link:'string',pickList:'string',lookup:'string',file:'string'}
    let defMulti = {link:true,lookup:false}
    let alias = config.alias || 'New property ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    let propType = config.propType || 'data' //data, date, pickList, pickMultiple, prev ,next, lookup, ids
    let allowMultiple = config.allowMultiple || defMulti[propType] || false
    let linksTo = config.linksTo || ""
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

    if(allowMultiple){
        dataType = 'unorderedSet'
    }else if(autoIncrement){
        dataType = 'number'
    }

    return {alias, archived, deleted, propType, dataType, linksTo, sortval, required, defaultval, autoIncrement, enforceUnique, fn, usedIn, pickOptions, format, allowMultiple}
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
    let defType = {data:'string',date:'number',pickList:'string',lookup:'string'}
    let alias = config.alias || 'New property ' + rand(2)
    let archived = config.archived || false
    let deleted = config.deleted || false
    let propType = config.propType || 'data' //lookup is basically prev, but it is only a one-way link (next is stored as a relation?)
    let dataType = config.dataType || defType[propType] || 'string' //string,number,boolean,set
    let required = config.required || false 
    let defaultval = config.defaultval || null 
    let format = config.format || ""
    let pickOptions = config.pickOptions || JSON.stringify([])
    let allowMultiple = config.allowMultiple || false
    return {alias, archived, deleted, propType, dataType, required, defaultval, pickOptions, format, allowMultiple}
}
const validDataTypes = ["string", "number", "boolean", "unorderedSet", "array"]
const validNodePropTypes = ["data", "date", "pickList", "pickMultiple", "link", "lookup", "function", "file"]
const validRelationPropTypes = ["data", "date", "pickList", "pickMultiple", "lookup"]
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
                let err = vTypeof + ' !== '+ tTypeof + ' at: '+key
                throw new Error(err)
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
            console.log(validObj,testObj)
            let err = key + ' does not match valid keys of: '+ Object.keys(validObj).join(', ')
            throw new Error(err)
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

const makehandleConfigChange = (gun,gb,getCell,cascade,solve,timeLog) => function cChange(configObj, path, from, cb){
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    //this._path from wherever config() was called
    from = from || 'config' //could be from 'linkProp', 'lookupProp', ?'createNodesFrom'?
    cb = (cb instanceof Function && cb) || function(){}
    let {b,t,rt,p} = parseSoul(path)
    let cpath = configPathFromChainPath(path)
    let csoul = configSoulFromChainPath(path)
    let thisConfig = getValue(cpath,gb)
    let toPut = {},configPuts={}, cPut = configPuts[csoul] = {}, tempStore = {},soulList = [],run = [],prevHIDs= {},nextHIDs= {}
    let getData = false, convertData = false,err, typeChange = false, indexVals = false
    let pType = (configObj.propType !== undefined) ? configObj.propType : thisConfig.propType
    let delimiter = configObj.delimiter || ', '
    verifyConfig()//attempts to throw errors if anything is invalid and sets the dataType it should be.
    let dType = (configObj.propType !== undefined) ? convertData || configObj.dataType : thisConfig.dataType
    
    let configAPIPropType = ['data','date','pickList']
    let simpleConfigs = ['inheritPermissions','log','alias','sortval','required','defaultval','humanIdentifier','pickOptions','format','allowMultiple']
    let setValKeys = ['autoIncrement','enforceUnique','humanIdentifier']
    for (const key in configObj) {//split config obj based on keys
        const value = configObj[key];
        if(simpleConfigs.includes(key))cPut[key] = value//these config vals have no additional checks needed
        if(setValKeys.includes(key) && value)indexVals = true //if either of these keys are truthy, will turn this flag on, used in done()
        if(['enforceUnique','humanIdentifier'].includes(key) && value)run.push(['checkUnique',[tempStore]])
        if(key === 'propType' && value !== thisConfig.propType && configAPIPropType.includes(value))typeChange = value
    }

    //below is the config router, can only take one 'path', but can have more than one 'utilCall'
    if(configObj.deleted){
        run.push(['delete',[null]])
    }else if(configObj.archived){
        run.push(['archive',[null]])
    }else if(from === 'createNodesFrom'){//special API's first
        run.push(['changePropType',[null]])
        /*
        for each node> 
            for each array object> 
                stringify object
                hash value
                store array of hashes on parentSoul[pval] = [hash, hash]
                store hash and object newNodes[hash] = JSON object

        only need to do the hash thing if variant:true?
        If imported as JSON we probably already deduped the the variant data from the prototype
        ^^^^above stuff would be more for the import w/ variant:true

        */


    }else if(from === 'linkTo'){//special API's first
        run.push(['changePropType',[null]])


    }else if(from === 'lookup'){//special API's first
        run.push(['changePropType',[null]])


    }else if(typeChange){//change propType
        run.push(['changePropType',[null]])
    }else if(configObj.fn && thisConfig.propType === 'function'){//update function
        run.push(['handleFN',[configObj]])
    }else if(configObj.dataType && thisConfig.propType === 'data'){//only changing dataType
        run.push(['changeDataType',[configObj.dataType]])
    }else if(!run.length){
        throw new Error('Cannot make changes specified. Be sure to use the correct API for linking/lookup changes.')
    }
    const util = {
        getList: function(whatPath,toObj,listOnly){
            //whatPath must be !#. It should be base,nodeType/relationType,prop
            //Check to make sure soul is correct
            let {b,t,rt,p} = parseSoul(whatPath)
            let createdSoul = makeSoul({b,t,rt,':':true})
            gun.get(createdSoul).once(function(data){
                if(data === undefined){runNext(); return}//for loop would error if not stopped
                for (const soul in data) {
                    if(!NODE_SOUL_PATTERN.test(soul))continue
                    if(data[soul]){//truthy
                        //(if something is archived we won't be operating on that data... good? bad? not sure)
                        //in unarchive, we can run through .edit api and it will attempt to convert values to current types
                        soulList.push(soul)
                    }
                }
                if(!listOnly){
                    let toGet = soulList.length
                    for (const soul of soulList) {
                        getCell(soul,p,function(val){
                            toGet--
                            toObj[soul] = val
                            if(toGet <= 0){
                                runNext()
                            }
    
                        },true)
                    }
                }else{
                    runNext()
                }
                
            })
        },
        getUniques: function(whatPath,toObj,byValue){
            //whatPath must be !#. It should be base,nodeType/relationType,prop
            //Check to make sure soul is correct
            let {b,t,rt,p} = parseSoul(whatPath)
            let dataIndex = makeSoul({b,t,rt,p})//uniques, soul
            gun.get(dataIndex).once(function(data){
                if(data === undefined){runNext(); return}//for loop would error if not stopped
                for (const soul in data) {
                    if(!NODE_SOUL_PATTERN.test(soul))continue
                    let v = data[soul]
                    if(v !== null && v !== ''){
                        if(byValue){
                            toObj[v] = soul
                        }else{
                            toObj[soul] = v
                        }
                    }
                }
                runNext()
            })
        },
        changeDataType: function(toType){//only used to convert all values for property this config() was called for. any others need manual conversion
            let from = thisConfig.dataType
            let toSingle = (configObj.allowMultiple === false && thisConfig.allowMultiple === true) ? true : false
            if(['unorderedSet','array'].includes(from) && !['unorderedSet','string','array'].includes(toType)){
                //would not be running this call if from === to
                throwErr('Can only change unorderedSet to: "array" or "string". Can only change an array to: "unorderedSet" or "string"')
                return
            }
            for (const soul in tempStore) {
                const value = tempStore[soul];
                if(Array.isArray(value) && toSingle && value.length > 1){
                    throwErr('Too many values in Array for {allowMultiple: false} setting')
                    return
                }
                try {
                    let v = convertValueToType(value,toType,soul,delimiter)
                    tempStore[soul] = v
                    addToPut(soul,{[p]:v},toPut)//might be overwritten later, but if not, this is the only time it is added to the output
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
        },
        checkUnique: function(){
            let vals = Object.values(tempStore)
            let set = new Set(vals)
            if(set.size !== vals.length){
                throwErr('Non-Unique values already exist. Remove duplicates and try again. Expected: '+vals.length+' unique values. Found: '+set.size)
            }
            for (const nodeID in tempStore) {
                const value = tempStore[nodeID];
                addToPut(nodeID,{[p]:value}, toPut)
            }
            runNext()
        },
        changePropType: function(){
            //determine from type > to type, determine if it is possible or what calls are needed
            let {propType:fType} = thisConfig

            //undo stuff
            if(['link'].includes(fType)){//changing a link column to non-link, need to find the linked one
                if(dType !== 'string' || dType === 'array'){throwErr('Link property can only be converted to a string or an array');return}
                if(thisConfig.usedIn.length !== 0){throwErr('Cannot change this property. A function references it');return}
                run.unshift(['handleLinking',['unlink']])
            }else if(fType === 'lookup'){
                if(dType !== 'string' || dType === 'array'){throwErr('Lookup property can only be converted to a string or an array');return}
                if(thisConfig.usedIn.length !== 0){throwErr('Cannot change this property. A function references it');return}
                run.unshift(['handleLookup',['unlink']])
            }else if(fType === 'function'){//clear out old fn values (remove all usedIn)
                run.unshift(['handleFN',[{fn:''}]])//can be ran in any order
            }
            
            //new stuff
            if (['link'].includes(pType)){//parse values for linking
                if(thisConfig.humanIdentifier){throwErr('Cannot create link on the Human Identifier property');return}
                let {b:lb,t:lt,p:lp} = (configObj.linksTo) ? parseSoul(configObj.linksTo) : {b:false}
                if(!lb || !lt || !lp){throwErr('You must specify another nodeType and what property matches the link values in this column');return}
                let linkConfig = getValue(configPathFromChainPath(configObj.linksTo), gb)
                if(linkConfig && ['string','number','array'].includes(linkConfig.dataType)){//check linksTo is valid table
                    run.unshift(['handleLinking',['link']])
                    //handleLinkColumn(path, configObj, backLinkCol,cb) 
                }else{
                    throwErr('config({linksTo: '+configObj.linksTo+' } is either not defined or of invalid dataType. Should be a property on another nodeType')
                }            
            }else if (pType === 'lookup'){//
                if(thisConfig.humanIdentifier){throwErr('Cannot create lookup on the Human Identifier property');return}
                let {b:lb,t:lt} = (configObj.linksTo) ? parseSoul(configObj.linksTo) : {b:false}
                if(!lb || !lt){throwErr('You must specify another nodeType to lookup values on.');return}
                let linkHID = findHIDprop(gb,makeSoul({b:lb,t:lt}))
                let linkConfig = getValue(configPathFromChainPath(linkHID), gb)
                if(linkConfig && ['string','number'].includes(linkConfig.dataType)){//check linksTo is valid table
                    run.unshift(['handleLookup',['link']])
                    //handleLinkColumn(path, configObj, backLinkCol,cb) 
                }else{
                    throwErr('config({linksTo: '+configObj.linksTo+' } is either not defined or of invalid dataType. Should be a property on another nodeType')
                }        
            }else if (pType === 'function'){//parse equation and store
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
            }else if (pType === 'pickList'){//parse equation and store
                let opts = configObj.pickOptions
                if(!opts){throwErr('Must specify an array of options for {pickOptions: ["option 1","option 2"]}');return}
                cPut.pickOptions = opts
            }else if (pType === 'date'){
                //don't really need to do anything more? maybe something with format?
                //this would have the special format requirements
                if(!configObj.format)console.warn('A date format is suggested but not required. Will currently return a unix timestamp.')
            }else{
                throwErr('propType specified is not editable')//Should never run because checkConfig verifies it's valid (only 'source' and 'target' could get here)
            }
            cPut.propType = pType
            runNext()
        },
        handleLinking: function(dir){
            if(configObj.linkNodeTypes === undefined && dir === 'link'){throwErr('Must use the ".linkNodeTypes" API to make a property a link'); return}
            let prevHID = findHIDprop(gb,path)
            let linkPath = (dir === 'link') ? configObj.linksTo : thisConfig.linksTo
            let nextHID = findHIDprop(gb,linkPath) 
            if(!prevHID || !nextHID){throwErr('Cannot find HID Prop'); return}
           
            run.unshift(['parseLinkData',[dir,nextHID]])
            if(Object.keys(tempStore).length === 0){
                runNext()
                return console.log('No data to convert, config updated')
            }
            //if there is data, need to go get a bunch more data
            let byValue = (dir==='unlink') ? false : true
            if(dir === 'unlink'){//only need prev HIDs on an unlink
                run.unshift(['getUniques',[prevHID,prevHIDs,false]])
            }
            run.unshift(['getUniques',[nextHID,nextHIDs,byValue]])

            runNext()    
        }, 
        parseLinkData: function(dir,nextPath){
            //dir = 'link' || 'unlink'
            //if dir='link' prev/nextHIDs are keys of HID and values of souls
            let {p:lp} = parseSoul(nextPath)
            if(dir === 'link'){
                addToPut(configSoulFromChainPath(nextPath),{propType:'next',dataType:'string',allowMultiple:false,linksTo:path},configPuts)
                cPut.linksTo = nextPath
            }else{
                addToPut(configSoulFromChainPath(nextPath),{propType:'data',dataType:'string',linksTo:""},configPuts)
                cPut.linksTo = ""
            }
            let prevObj = {}
            let nextObj = {}
            for (const parentSoul in tempStore) {
                let links = tempStore[parentSoul]
                let parentHID = (dir==='unlink') ? prevHIDs[parentSoul] : false //don't need this for linking
                const linkArr = (Array.isArray(links)) ? links : (typeof links === 'string' && links[0] === "[") ? JSON.parse(links) : links.split(delimiter)
                if(linkArr.length){
                    prevObj[parentSoul] = {}
                    for (let i = 0; i < linkArr.length; i++) {//build new objects of GBids, prev and next links
                        const ID = String(linkArr[i]);//could be either a soul or a HID, depending on `dir`
                        let linkHID = (dir==='unlink') ? nextHIDs[ID] : ID
                        let linkSoul = (dir==='unlink') ? ID : nextHIDs[ID]
                        let found = (dir==='unlink') ? linkHID : linkSoul
                        let parentKey = (dir==='unlink') ? parentHID : parentSoul
                        let linkKey = (dir==='unlink') ? linkHID : linkSoul
                        if(found){
                            if(!nextObj[linkSoul]){nextObj[linkSoul] = {}}
                            if(!prevObj[parentSoul]){prevObj[parentSoul] = {}}
                            prevObj[parentSoul][linkKey] = true
                            nextObj[linkSoul][parentKey] = true
                        }else if(ID !== 'null'){
                            if(!confirm('Cannot find: '+ HID + '  Continue linking?')){
                                let err = 'LINK ABORTED: Cannot find a match for: '+ HID + ' on table: ' + targetTable
                                throw new Error(err)
                            }
                        }
                    }
                }
            }
            //prepare and place in toPut
            for (const nodeID in prevObj){
                const value = prevObj[nodeID];
                let val = (dir === 'unlink') ? {[p]:Object.keys(value).join(delimiter)}: value
                addToPut(nodeID,val,toPut)
            }
            for (const nodeID in nextObj){
                const value = nextObj[nodeID];
                let nexts = Object.keys(value)
                if(nexts.length > 1 && dir === 'link'){throwErr('Linked to records must be exclusive, too many parent items linked to a child node')}
                let val = {[lp]: nexts.join(delimiter)}
                addToPut(nodeID,val,toPut)
            }
            runNext()
        },
        handleLookup: function(dir){
            if(configObj.createLookup === undefined && dir === 'link'){throwErr('Must use the ".createLookup" API to make a property a lookup'); return}
            let linkPath = (dir === 'link') ? configObj.linksTo : thisConfig.linksTo
            let nextHID = findHIDprop(gb,linkPath) 
            if(!nextHID){throwErr('Cannot find HID Prop'); return}
           
            run.unshift(['parseLookupData',[dir,nextHID]])
            if(Object.keys(tempStore).length === 0){
                runNext()
                return console.log('No data to convert, config updated')
            }
            //if there is data, need to go get more data
            let byValue = (dir==='unlink') ? false : true
            run.unshift(['getUniques',[nextHID,nextHIDs,byValue]])

            runNext()    
        },
        parseLookupData: function(dir,nextPath){
            //dir = 'link' || 'unlink'
            //if dir='link' prev/nextHIDs are keys of HID and values of souls
            let {p:lp} = parseSoul(nextPath)
            if(dir === 'link'){
                cPut.linksTo = nextPath
            }else{
                cPut.linksTo = ""
            }
            let prevObj = {}
            let nextObj = {}
            for (const parentNodeID in tempStore) {
                let links = tempStore[parentNodeID]
                const linkArr = (Array.isArray(links)) ? links : (typeof links === 'string' && links[0] === "[") ? JSON.parse(links) : links.split(delimiter)
                if(linkArr.length){
                    prevObj[parentNodeID] = {}
                    for (let i = 0; i < linkArr.length; i++) {//build new objects of GBids, prev and next links
                        const ID = String(linkArr[i]);//could be either a soul or a HID, depending on `dir`
                        let linkHID = (dir==='unlink') ? nextHIDs[ID] : ID
                        let linkID = (dir==='unlink') ? ID : nextHIDs[ID]
                        let {b,t,rt,r} = parseSoul(linkID)
                        let linkSoul = makeSoul({b,t,rt,r,'[':'lookup'})
                        let found = (dir==='unlink') ? linkHID : linkID
                        let linkKey = (dir==='unlink') ? linkHID : linkID
                        if(found){
                            if(!nextObj[linkSoul]){nextObj[linkSoul] = {}}
                            prevObj[parentNodeID][linkKey] = true
                            nextObj[linkSoul][parentNodeID] = (dir==='unlink') ? false : true
                        }else if(ID !== 'null'){
                            if(!confirm('Cannot find: '+ HID + '  Continue linking?')){
                                let err = 'LINK ABORTED: Cannot find a match for: '+ HID + ' on table: ' + targetTable
                                throw new Error(err)
                            }
                        }
                    }
                }
            }
            //prepare and place in toPut
            for (const nodeID in prevObj){
                const value = prevObj[nodeID];
                let val = (dir === 'unlink') ? {[p]:Object.keys(value).join(delimiter)}: value
                addToPut(nodeID,val,toPut)
            }
            for (const lookupNextSoul in nextObj){
                const value = nextObj[lookupNextSoul];
                addToPut(lookupNextSoul,value,toPut)
            }
            runNext()
        },
        handleFN: function(argObj){
            //parse equation for all links
            let fn = argObj.fn
            let oldfn = thisColConfig.fn
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
            let toSolve = soulList.length
            for (const rowid of soulList) {
                solve(rowid,fn,function(val){
                    addToPut(rowid,{[p]:val},toPut)
                    toSolve--
                    if(toSolve <= 0){
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
        }
    }
    //start logic
    console.log(run)
    runNext()

    
    function verifyConfig(){
        for (const key in configObj) {
            const value = configObj[key];
            const cur = thisConfig[key]
            if(value === cur){
                delete configObj[key]
            }
        }
        let validConfig
        let type = (path.includes('#')) ? 'node' : 'relation'
        if(path.includes('.') && path.includes('#')){//node Prop
            validConfig = newNodePropConfig()
        }else if(path.includes('.') && path.includes('-')){//relation prop
            validConfig = newNodePropConfig()
        }else if(path.includes('#')){//nodeType
            validConfig = newNodeTypeConfig()
        }else if(path.includes('-')){//relationType
            validConfig = newRelationshipConfig()
        }else{//base (or row, but validConfig is not called)
            validConfig = newBaseConfig()
        }
        //these should throw errors and stop the call if they don't pass
        checkConfig(validConfig, configObj,type) //SHOULD ADD VALIDATION FOR SPECIAL PROP STRING FORMATTING (autoIncrement, format)
        checkUniques(gb, path, configObj)//will pass if alias/sortval is not present
        
        //config obj has valid keys/values, next is figuring out if the dataType is valid
        let dType = (configObj.dataType !== undefined) ? configObj.dataType : thisConfig.dataType

        let allowMultiple = (configObj.allowMultiple !== undefined) ? configObj.allowMultiple : thisConfig.allowMultiple
        let enforceUnique = (configObj.enforceUnique !== undefined) ? configObj.enforceUnique : thisConfig.enforceUnique
        let autoIncrement = (configObj.autoIncrement !== undefined) ? configObj.autoIncrement : thisConfig.autoIncrement
        enforceUnique = (configObj.humanIdentifier) ? true : false//must be unique in order to be a HID
        let requiredType = requiredTypes()
        if(!requiredType.includes(dType)){
            dType = requiredType[0]//take first (or only) one
            if(configObj.dataType && configObj.dataType !== dType){
                console.warn('Setting dataType to: '+dType+'. Instead of the requested type: '+configObj.dataType)
            }
        }
        let listOnly = false
        if(dType !== thisConfig.dataType){//need to change the dataType
            convertData = dType
            getData = true
        }else if((enforceUnique && !thisConfig.enforceUnique) || configObj.humanIdentifier){//turning on enforceUnique, dataType is already correct
            getData = true
        }else if(configObj.fn){
            listOnly = true
        }
        if(getData)run.push(['getList',[path,tempStore,listOnly]])
        if(convertData)run.push(['changeDataType',[convertData]])
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
            if(pType === 'data')return ['string','number','boolean','unorderedSet','array']
            if(pType === 'date')return ['number']
            if((pType === 'link' || pType === 'lookup' || pType === 'pickList') && allowMultiple)return ['unorderedSet']
            if((pType === 'pickList' && !allowMultiple) || pType === 'function')return ['string','number']
            if(((pType === 'link' || pType === 'lookup') && !allowMultiple) || pType === 'next')return ['string']
            return ['string']
        }
    }
    function runNext(){
        if(run.length){
            let [fn, args] = run[0]
            run.shift()
            util[fn](...args)
        }else{
            validateConfigPut()
        }
        
    }
    function validateConfigPut(){
        //stringify keys that are objects(should all be arrays)
        //check format with the final propType/dataType values
        try {
            checkFormat()
            checkHumanIdentifier()
            deDupAndCheckTypes()
        } catch (error) {
            throwErr(error)
            return
        }
        done()

    }
    function done(){
        if(err !== undefined)return
        let timeIndices = {}, dataPut = {}, setPut = {}, uniques = {}, lookupNexts = {}
        try {
            for (const nodeID in toPut) {//data soul = dataID, (!#$ || !-$) or it is lookupNexts !#$[lookup
                const putObj = toPut[nodeID];
                let {b,t,rt,r} = parseSoul(nodeID)
                for (const pval in putObj) {//stole most of this from .edit()/putData()/runValidation()
                    let p = pval
                    let uIndex = makeSoul({b,t,rt,p})
                    let propPath = makeSoul({b,t,rt,r,p}), pconfigsoul = configSoulFromChainPath(uIndex)
                    let updatedConfig = configPuts[pconfigsoul] || {} //must merge updated values since gb has not been updated yet
                    let {propType, dataType, alias, pickOptions,enforceUnique} = Object.assign({},getValue(configPathFromChainPath(uIndex),gb),updatedConfig)
                    let value = putObj[pval]
                    if(propType === undefined || dataType === undefined){
                        let err = 'Cannot find prop types for column: '+ alias +' ['+ pval+'].'
                        throw new Error(err)
                    }
    
                    if(propType === 'date'){
                        let testDate = new Date(value)
                        if(testDate.toString() === 'Invalid Date'){
                            throw new Error ('Cannot understand the date string in value, edit aborted! Try saving again with a valid date string (hh:mm:ss is optional): "mm/dd/yyyy, hh:mm:ss"')
                        }else{
                            timeIndices[propPath] = value = testDate.getTime()
                            addToPut(nodeID,{[pval]:value},dataPut)//put in to data put
                        }
                    }else if(dataType === 'unorderedSet'){
                        if(propType === 'pickMultiple'){
                            for (const pick in value) {
                                const boolean = value[pick];
                                if(boolean && !pickOptions.includes(pick)){//make sure truthy ones are currently valid options, falsy are fine
                                    throw new Error('Invalid Pick Option. Must be one of the following: '+ pickOptions.join(', '))
                                }
                            }
                        }
                        setPut[propPath] = value
                    }else if((nodeID.includes('['))){//is lookupNext
                        addToPut(nodeID,{[pval]:!!value},lookupNexts)
                    }else{//straight up data on the regular node
                        addToPut(nodeID,{[pval]:convertValueToType(value,dataType,nodeID)},dataPut)//Will catch Arrays, and stringify, otherwise probably unneccessary
                    }
    
                    if(enforceUnique)addToPut(uIndex,{[nodeID]:value},uniques)//will catch any unique data
                }
            }
        } catch (error) {
            throwErr(error)
            return
        }
        
        if(!err){//log config changes
            //putConfigs()
            //putData()
            testOutput()
            console.log(tempStore)
        }
        let triggers = cPut.usedIn || []
        if(triggers.length){
            for (const nodeid of soulList) {
                //cascade(nodeid,p)//fire cascade? always?
            }
        }
        function putConfigs(){
            for (const csoul in configPuts) {//put all configs in
                const cObj = configPuts[csoul];
                timeLog(csoul,cObj)
                gun.get(csoul).put(cObj)
            }
        }
        function putData(){//stole most of this from .edit()/putData()/done()
            if(Object.keys(dataPut).length){
                for (const nodeID in dataPut) {
                    const putObj = dataPut[nodeID];
                    gun.get(nodeID).put(putObj)
                }
            }
            if(Object.keys(timeIndices).length){
                for (const nodePropPath in timeIndices) {//for each 'date' column, index
                    const unixTS = timeIndices[nodePropPath];
                    timeIndex(nodePropPath,path,new Date(unixTS))
                }
            }
            if(Object.keys(setPut).length){
                for (const nodePropPath in sets) {//for each 'set' column, put data on the prop soul (instead of the node soul)
                    const setObj = setPut[nodePropPath];
                    if(setObj === null){//handle nulling out the set (remove everything from set)
                        gun.get(nodePropPath).once(function(setItems){
                            if(setItems === undefined)return
                            for (const item in setItems) {
                                if(item === '_')continue
                                gun.get(nodePropPath).get(item).put(false)
                            }
                        })
                    }else{
                        gun.get(nodePropPath).put(setObj)
                    }
                }
            }
            if(Object.keys(uniques).length){
                for (const uIndex in uniques) {
                    const uObj = uniques[uIndex];
                    gun.get(uIndex).put(uObj)
                }
            }
            for (const nodeID in toPut) {
                let {b,t,rt} = parseSoul(nodeID)
                let {log} = getValue(configPathFromChainPath(makeSoul({b,t,rt})),gb)
                if(log && !nodeID.includes('[')){//ignore next puts
                    const nodeChanges = toPut[nodeID];
                    timeLog(nodeID,nodeChanges)
                }
                
                    
            }
            
        }
        function testOutput(){//stole most of this from .edit()/putData()/done()
            let log = {}
            if(Object.keys(dataPut).length){
                log.dataPut = dataPut
            }
            if(Object.keys(timeIndices).length){
                log.timeIndices = timeIndices
            }
            if(Object.keys(setPut).length){
                log.setPut = setPut
            }
            if(Object.keys(uniques).length){
                log.uniques = uniques
            }
            log.timelog = {}
            for (const nodeID in toPut) {
                let {b,t,rt} = parseSoul(nodeID)
                let {log} = getValue(configPathFromChainPath(makeSoul({b,t,rt})),gb)
                if(log && !nodeID.includes('[')){//ignore next puts
                    const nodeChanges = toPut[nodeID];
                    addToPut(nodeID,nodeChanges,log.timeLog)
                }
            }
            console.log('OUTPUT:',log)
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
        let tcon = getValue(configPathFromChainPath(makeSoul({b,t,rt})),gb)
        for (const pval in tcon) {
            const {humanIdentifier} = tcon[pval];
            if(humanIdentifier && pval !== p){//make any other identifer false, allows a simple change over.
                addToPut(configSoulFromChainPath(makeSoul({b,t,rt,p:pval})),{humanIdentifier: false},configPuts)
            }
        }
    }
    function deDupAndCheckTypes(){
        //only catch any properties that were arrays and make them JSON
        for (const csoul in configPuts) {
            const cObj = configPuts[csoul];
            let curC = getValue(configPathFromChainPath(csoul),gb)
            for (const key in cObj) {
                const v = cObj[key];
                const curv = curC[key]
                if(curv === v){
                    delete configPuts[csoul][key]
                    continue
                }
                if(Array.isArray(v)){
                    cObj[key] = JSON.stringify(v)
                }
                    
            }
                
        }
    }
    function throwErr(errmsg){
        let e = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = e
        cb.call(cb,err)
        console.log(e)
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
    let args = fnString.split(',')
    let lpar = 0
    let rpar = 0
    for (let i = 0; i < fnString.length; i++) {
        const char = fnString[i];
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
        const arg = args[i];
        let toks = 0
        for (let j = 0; j < arg.length; j++) {
            const argchar = arg[j];
            if("!<>".indexOf(argchar) !== -1){
                toks++
                if(arg[j+1] === '='){//skip next char
                    j++
                }
            }else if(argchar === '='){
                toks++
            }
        }
        if(toks > 1){
            throw new Error('Check your arguments, this one has more than one logical comparison in it: '+ args[i])
        }
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
    for (const rt in relations) {
        let pprops = relations[rt]
        for (const p in pprops) {
            const {usedIn} = pprops[p];
            let thisPath = makeSoul({b,rt,p})
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

const handleImportColCreation = (gb, b, t, colHeaders, datarow, variant, eID, append, addBackLink)=>{
    // create configs
    let path = makeSoul({b, t})
    let gbpath = configPathFromChainPath(path)
    let colspath = gbpath.slice()
    colspath.push('props')
    let cols = getValue(colspath, gb)
    addBackLink = !!addBackLink
    let aliasLookup = {}
    let newPconfigs = {}
    let externalIDidx
    if(eID){
        let i = colHeaders.indexOf(eID)
        externalIDidx = (i === -1) ? false : i
    }
    if(addBackLink){
        colHeaders.push('Parent Node')
    }
    for (let i = 0; i < colHeaders.length; i++) {
        let col = colHeaders[i]
        let p = findID(cols, col),sortval
        if(cols === undefined || (p === undefined && append)){//need to create a new property
            try {
                //both will fail on cols === undefined (first import)
                p = newID(gb,makeSoul({b,t,p:true})) 
                sortval = nextSortval(gb,path)
            } catch (error) {
                p = i + 'I' + rand(2)
                sortval = i*10
            }
            const palias = String(col);
            if(variant && palias === 'PROTOTYPE')continue//importing a table with variants, this column is metadata
            let enforceUnique = (externalIDidx === i) ? true : false
            let val = (datarow[i] === undefined) ? '' : datarow[i]//default to string
            let dataType = typeof val//if from tsv parse, can only be string or number, if user passed in an array, could be anything
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
            let propType = 'data'

            let pconfig = newNodePropConfig({alias: palias, propType, dataType,enforceUnique, sortval})
            checkConfig(newNodePropConfig(), pconfig,'node')
            
            newPconfigs[p] = pconfig
        }
        aliasLookup[col] = p
    }
    return {newPconfigs,aliasLookup}
}
const handleTableImportPuts = (gun, resultObj, cb)=>{
    cb = (cb instanceof Function && cb) || function(){}
    for (const rowID in resultObj) {//put alias on row node
        const data = resultObj[rowID]
        gun.get(rowID).put(data)

        //put data in through edit?? would handle timeIndex and timeLog..


    }
    
    cb.call(this, undefined)
}
module.exports = {
    newBaseConfig,
    newNodeTypeConfig,
    newRelationshipConfig,
    newRelationshipPropConfig,
    newNodePropConfig,
    makehandleConfigChange,
    handleImportColCreation,
    handleTableImportPuts,
    checkConfig,
    basicFNvalidity
}