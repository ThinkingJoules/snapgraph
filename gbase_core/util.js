//GBASE UTIL FUNCTIONS
const ALL_INSTANCE_NODES = /![a-z0-9]+(#|-)[a-z0-9]+\$[a-z0-9]+\&([a-z0-9]+)?/i
const DATA_INSTANCE_NODE = /![a-z0-9]+#[a-z0-9]+\$[a-z0-9]+\&([a-z0-9]+)?/i
const RELATION_INSTANCE_NODE = /![a-z0-9]+-[a-z0-9]+\$[a-z0-9]+\&([a-z0-9]+)?/i
const PROTO_NODE_SOUL = /![a-z0-9]+(#|-)[a-z0-9]+\$[a-z0-9]+\&[^a-z0-9]+/i
const DATA_PROP_SOUL = /![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9]+\&([a-z0-9]+)?/
const RELATION_PROP_SOUL = /![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9]+\&([a-z0-9]+)?/
const PROPERTY_PATTERN = /![a-z0-9]+(#|-)[a-z0-9]+\.[a-z0-9]+/i
const ISO_DATE_PATTERN = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+Z/
const NULL_HASH = hash64(JSON.stringify(null))
function bufferPathFromSoul(rowID, pval){
    //buffer is the same structure as cache
    let cpath = cachePathFromRowID(rowID,pval)
   
    return cpath
}
function cachePathFromRowID(rowID, pval){
    //rowID should be !#$ or !-$
    //pval should be just an id
    let node = parseSoul(rowID)
    if(pval)Object.assign(node,{'p':pval})
    let stringPath = makeSoul(node) //get format in to the right order
    let cpath = cachePathFromChainPath(stringPath)
    return cpath
}
function cachePathFromChainPath(thisPath){
    //valid paths: !, !#, !-, !#.$&, !-.$&
    if(thisPath.includes('.') && !thisPath.includes('$'))throw new Error('Must specify a row to get this prop')
    let pathArgs = parseSoul(thisPath)
    let order = ['b','t','rt','r','p']//put r before p
    let depth = []
    for (const arg of order) {
        let hasID = pathArgs[arg]
        if(hasID){
            if(arg === 't'){
                depth.push('nodeTypes')
                depth.push(hasID)
            }else if(arg === 'rt'){
                depth.push('relations')
                depth.push(hasID)
            }else if(arg === 'r'){
                let{r,f} = pathArgs
                depth.push(makeSoul({r,f}))
            }else{
                depth.push(hasID)
            }
        }
    }
    return depth
}
function configPathFromSoul(soul){
    //redundant now since chain path === soul (in this case)
    //stubbing this so all code works
    //TODO: remove
    let configpath = configPathFromChainPath(soul)
    return configpath

}
function configPathFromChainPath(thisPath){
    //valid paths: !, !#, !-, !^, !#., !-.
    //group is always reference by alias, never by ID
    let {b,t,rt,p,g} = parseSoul(thisPath)
    let configpath = [b]
    if(thisPath.includes('#')){//nodeType
        configpath = [...configpath, 'props',t]
    }else if(thisPath.includes('-')){
        configpath = [...configpath, 'relations',rt]
    }
    if(thisPath.includes('.')){//nodeType
        configpath = [...configpath, 'props',p]
    }else if(thisPath.includes('^')){
        configpath = [...configpath, 'groups']
        if(typeof g === 'string')configpath.push(g)
    }

    return configpath

}
function configSoulFromChainPath(thisPath){
    //should just need to append % to end if they are in right order..
    //should parse, then make soul to be safe
    let parse = parseSoul(thisPath)
    Object.assign(parse,{'%':true})
    let soul = makeSoul(parse)
    return soul

}
const findID = (obj, name) =>{//obj is level above .props, input human name, returns t or p value
    let out //return undefined if not found
    for (const key in obj) {
        const {alias} = obj[key]
        if(String(alias) === String(name) || String(key) === String(name)){
            out = key
            break
        }
    }
    return out
}
const newID = (gb, path) =>{
    //should be base or base, node (creating new prop) thing we are creating should be parsed as boolean
    //props will be an incrementing integer + noise so no alias config: Number() + 'x' + rand(2)
    let {b,t,rt,p} = parseSoul(path)
    let n = 0
    let things
    if(p === true){//new nodeType
        let {props} = getValue(configPathFromChainPath(makeSoul({b,t,rt})),gb)
        things=props
    }else if(t === true){
        let {props} = getValue(configPathFromChainPath(makeSoul({b})),gb)
        things = props
    }else if(rt === true){
        let {relations} = getValue(configPathFromChainPath(makeSoul({b})),gb)
        things = relations
    }else{
        return rand(10) //base or anything that doesn't work
    }
    for (const id in things) {
        let [val] = id.split('I')
        val = val*1 //get to a number
        if(isNaN(val))continue
        if(n <= val) n = val
    }
    n++
    return n + 'I' + rand(2)
}
const allUsedIn = gb =>{//could move this to a getter on the gb object?
    let out = {}
    for (const base in gb) {
        out[base] = {}
        const tables = gb[base].props;
        for (const t in tables) {
            const tconfig = tables[t];
            for (const p in tconfig.props) {
                let thispath = [base,t,p].join('/')
                const usedIn = t.props[p].usedIn;//should be an array of paths
                out[base][thispath] = usedIn
            }
        }
    }
    return out
}
const gbForUI = (gb) =>{
    let output = {}
    for (const bid in gb) {
        output[bid] = {}
        const tableobj = Gun.obj.copy(gb[bid].props);
        for (const tval in tableobj) {
            let tvis = tableobj[tval].vis
            if(tvis){
                let tsort = tableobj[tval].sortval
                output[bid][tsort] = {[tval]: {}}

                for (const pval in tableobj[tval].props) {
                    const pconfig = tableobj[tval].props[pval];
                    if(pconfig.vis){
                        let psort = pconfig.sortval
                        output[bid][tsort][tval][psort] = pval
                    }
                }
            }
        }

    }
    return output
}
const gbByAlias = (gb) =>{
    let output = Gun.obj.copy(gb)
    for (const bid in gb) {
        const tableobj = Gun.obj.copy(gb[bid].props);
        for (const tval in tableobj) {
            let tconfig = tableobj[tval]
            //byAlias
            let talias = tconfig.alias
            let prev = output[bid].props[tval]
            let newdata = Object.assign({},prev)
            newdata.alias = tval
            output[bid].props[talias] = newdata
            delete output[bid].props[tval]
            delete output[bid].props[talias].rows
            if(tconfig.rows){//Invert Key/Values in HID Alias obj
                for (const rowID in tconfig.rows) {
                    if (tconfig.rows[rowID]) {
                        const GBalias = tconfig.rows[rowID];
                        setValue([bid,'props',talias,'rows', GBalias], rowID, output)
                        output[bid].props[talias].rows[GBalias] = rowID
                    }
                }
            }

            const columnobj = Gun.obj.copy(tableobj[tval].props);
        
            for (const pval in columnobj) {
                const palias = columnobj[pval].alias;
                let prev = output[bid].props[talias].props[pval]
                let newdata = Object.assign({},prev)
                newdata.alias = pval
                output[bid].props[talias].props[palias] = newdata
                delete output[bid].props[talias].props[pval]
            }
        }

    }
    return output
}
const linkColPvals = (gb,base,tval)=>{//PROBABLY COULD BE USED AGAIN, NEEDS UPDATE
    let obj = getValue([base,'props',tval,'props'], gb)
    let result = {}
    for (const key in obj) {
        let {linksTo,GBtype,archived,deleted,associatedWith} = obj[key]
        if ((linksTo || associatedWith) && !archived && !deleted && ['prev','next','association'].includes(GBtype)) {
            const link = obj[key].linksTo
            result[key] = link
        }
    }
    return result
}
function setValue(propertyPath, value, obj){
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {
        if (!obj.hasOwnProperty(propertyPath[0]) || typeof obj[propertyPath[0]] !== "object") obj[propertyPath[0]] = {}
        return setValue(propertyPath.slice(1), value, obj[propertyPath[0]])
    } else {
        obj[propertyPath[0]] = value
        return true // this is the end
    }
}
function setMergeValue(propertyPath, value, obj){
    let properties = Array.isArray(propertyPath) ? propertyPath : propertyPath.split("/")
    if (properties.length > 1) {// Not yet at the last property so keep digging
      // The property doesn't exists OR is not an object (and so we overwritte it) so we create it
      if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "object") obj[properties[0]] = {}
        // We iterate.
      return setMergeValue(properties.slice(1), value, obj[properties[0]])
        // This is the last property - the one where to set the value
    } else {
      // We set the value to the last property
      if(Array.isArray(value)){
        if (!obj.hasOwnProperty(properties[0]) || !Array.isArray(obj[properties[0]])) obj[properties[0]] = []
        obj[properties[0]] = obj[properties[0]].concat(value)
      }else if(typeof value === 'object'){
        if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "object") obj[properties[0]] = {}
        obj[properties[0]] = Object.assign(obj[properties[0]], value)
      }else if(typeof value === 'number'){
        if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "number") obj[properties[0]] = 0
        obj[properties[0]] += value
      }else{
        obj[properties[0]] = value
      }
      return true // this is the end
    }
}
function setRowPropCacheValue(propertyPath, value, obj){
    //same as setValue currently
    //TODO:remove
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {
        if (!obj.hasOwnProperty(propertyPath[0]) || typeof obj[propertyPath[0]] !== "object") obj[propertyPath[0]] = {}
        return setRowPropCacheValue(propertyPath.slice(1), value, obj[propertyPath[0]])
    } else {
        obj[propertyPath[0]] = value
        return true // this is the end
    }
}
function getValue(propertyPath, obj){
    if(typeof obj !== 'object' || Array.isArray(obj) || obj === null)return undefined
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {// Not yet at the last property so keep digging
      if (!obj.hasOwnProperty(propertyPath[0])){
          return undefined
      }
      return getValue(propertyPath.slice(1), obj[propertyPath[0]])
    }else{
        return obj[propertyPath[0]]
    }
}
function getRowPropFromCache(propertyPath, obj){//DUPLICATE, BUT CURRENTLY USED
    //same as getValue currently
    //TODO:remove
    if(typeof obj !== 'object' || Array.isArray(obj) || obj === null)return undefined
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {// Not yet at the last property so keep digging
      if (!obj.hasOwnProperty(propertyPath[0])){
          return undefined
      }
      return getRowPropFromCache(propertyPath.slice(1), obj[propertyPath[0]])
    }else{
        return obj[propertyPath[0]]
    }
}
function putData(gun, gb, cascade, timeLog, timeIndex, nodeID, isNew, childOf, putObj, cb){
    let IDobj = parseSoul(nodeID) //this is only for data Nodes, not relation nodes
    let {b,t,r,f} = IDobj
    let {props,log,parent} = getValue(configPathFromChainPath(nodeID),gb)
    findPropIDs()
    let timeIndices = {}, logObj = {}, run = [],  pending = {}, toPut = {}, linkChange = {}, err
    let isPrototype = (f !== undefined && f !== '') ? false : true, isRoot = (parent === undefined || parent === '') ? true : false
    if(isNew && !isRoot){//check childOf value
        if(!ALL_INSTANCE_NODES.test(childOf)){
            throw new Error('Invalid NodeID specified for linking new node to its parent')
        }
        let {t:ct} = parseSoul(childOf)
        let {t:tp} = parseSoul(parent)
        if(tp !== ct){//should point at each other
            throw new Error('NodeID specified for linking new node to, is not the "parent" type')
        }
    }
    let fOwns, proto = {}
    if(!isPrototype && !isNew){
        let protoSoul = makeSoul({b,t,r,f:''})
        let allProps = Object.keys(putObj)
        run.push(['getF',[null]])
        run.push(['getProps',[protoSoul, allProps, proto]])
        run.push(['cleanPut',[null]])
    }
    run.push(['initialCheck',[null]])
    const util = {
        getProps: function(soul, pvals, collector){
            let look = pvals.length
            let done = 0
            for (const p of pvals) {
                gun.get(soul).get(p).get(function(msg,eve){
                    eve.off()
                    let v = (msg.put === undefined || msg.put === null) ? null : msg.put
                    if(v !== null){
                        collector[p] = v
                    }
                    done++
                    if(done === look){
                        runNext()
                    }
                })
            }
        },
        getF: function(){
            gun.get(nodeID).once(function(node){
                if(node === undefined){
                    isNew = true
                    fOwns = {}
                }else{
                    let c = JSON.parse(JSON.stringify(node))
                    delete c['_']
                    fOwns = c
                }
                runNext()
            })
        },
        updateParentLinks: function(){
            let protoNextSoul = makeSoul({b,t,r,f:'','<':true})
            let {p:linkProp} = parseSoul(parent)
            let parentNode
            gun.get(protoNextSoul).get('next').get(function(msg,eve){
                eve.off()
                parentNode = msg.put
                if(parentNode === undefined){let e = new Error('Prototype is an unconnected node! (not sure how, or what to do...)');throwError(e)}
            
                let {b,t,r} = parseSoul(parentNode)
                let baseSoul = {b,t,r}
                let wProp = Object.assign({},baseSoul,{p:linkProp})
                let parentVariantLinkSoul = makeSoul(Object.assign({},wProp,{f}))
                gun.get(parentVariantLinkSoul).once(function(node){
                    if(node !== undefined){
                        fixLinks(node,false)
                    }else{
                        let parentProtoLinkSoul = makeSoul(Object.assign({},baseSoul,{f:''}))
                        gun.get(parentProtoLinkSoul).once(function(node){
                            if(node !== undefined){
                                fixLinks(node,true)
                            }else{
                                let e = new Error('Cannot find parent link node. Edit Aborted')
                                throwError(e)
                                return
                            }
                        })
                    }
                })
                function fixLinks(nodeObj, copy){
                    for (const key in nodeObj) {
                        if(key === '_')continue
                        const v = nodeObj[key];
                        if(v !== null && typeof v === 'object'){
                            //this is a current link
                            let childSoul = v['#']
                            let {b,t,r} = parseSoul(childSoul)
                            let lID = makeSoul(b,t,r)
                            let compare = makeSoul(baseSoul)
                            if(copy && lID !== compare){
                                addToPut(parentVariantLinkSoul,{[key]:v},linkChange)
                            }else if(lID === compare){//this is the child node we are changing
                                addToPut(parentVariantLinkSoul,{[nodeID]:{'#': nodeID}},linkChange)
                                if(!copy){//if not copying, then we need to falsy this since node already existed
                                    addToPut(parentVariantLinkSoul,{[key]:false},linkChange)
                                }
                            }
                            
                        }
                    }
                    runNext()
                }
            })
            
        },
        cleanPut: function(){
            let cleanPutObj
            for (const p in putObj) {
                const userVal = putObj[p], fVal = fOwns[p], prVal = proto[p]
                if([undefined,null].includes(fVal) && prVal !== userVal || ![undefined,null].includes(fVal) && fVal !== userVal){
                    //if (prop is currently inherited but different) or (fOwns it already and userval is different)
                    cleanPutObj[p] = userVal
                }
            }
            putObj = cleanPutObj
            if(!isRoot && isNew){
                run.unshift(['updateParentLinks',[null]])
            }else{
    
            }
            runNext()
        },
        initialCheck: function(){
            for (const pval in props) {
                let input = putObj[pval]
                let pconfig = props[pval]
                let {required,defaultval,autoIncrement, enforceUnique, alias} = pconfig
                if(input !== undefined//user putting new data in
                    || (isNew 
                    && (required || autoIncrement !== ""))//need to have it or create it
                    ){//autoIncrement on this property
                    pending[pval] = true
                    if(isNew){
                        if(required 
                            && input === undefined 
                            && defaultval === null 
                            && (f === true || (f !== true && enforceUnique)) //is not a newFrom() or is a newFrom() w/enforceUnique and required
                            && !autoIncrement){//must have a value or autoIncrement enabled
                            throw new Error('Required field missing: '+ alias)
                        }
                        if(input === undefined && defaultval !== null){
                            putObj[pval] = defaultval
                        }
                    }
                    if ((enforceUnique && putObj[pval] !== null && putObj[pval] !== undefined)//must be unique, and value is present OR
                        || (autoIncrement !== "" && putObj[pval] === undefined && isNew)){//is an autoIncrement, no value provided and is a new node
                        run.unshift(['checkUnique',[pval]])
                    }
                }
            }
            runNext()
        },
        checkUnique(pval){
            let pconfig = props[pval]
            let {start,inc} = parseIncrement(pconfig.autoIncrement) || {inc:false}
            let {b,t,rt} = parseSoul(nodeID)
            let {enforceUnique, alias, dataType} = pconfig//dataType can only be 'string' or 'number' w/ enforceUnique:true || 'number' w/ inc
            let putVal
            let listID = makeSoul({b,t,rt,p:pval})
            try {
                putVal = convertValueToType(putObj[pval],dataType)
            } catch (error) {
                throwError(error)
            }
            getList(listID,function(list){
                list = list || {}
                let incVals = {}
                for (const idOnList in list) {
                    if(['_'].includes(idOnList))continue//anything to skip, add to this array
                    const value = list[idOnList];
                    if(inc){//this is an incrementing value, this method should also make it unique.
                        incVals[value] = true
                    }
                    if(enforceUnique 
                        && putVal !== undefined
                        && putVal !== null
                        && putVal !== ""//will allow multiple 'null' fields
                        && String(value) === String(putVal) 
                        && idOnList !== nodeID){//other value found on a different soul
                        err = new Error('Non-unique value on property: '+ alias)
                        throwError(err)
                        break
                    }
                }
                if(!err){
                    if(inc && isNew && putVal === undefined){
                        let checkVal = start, current
                        while (current === undefined) {//look for open `start += increment` 'slots' to fill, reuse values that user edited or for 'deleted' items.
                            if(incVals[checkVal] === undefined){
                                current = checkVal
                            }
                            checkVal += inc
                        }
                        putObj[pval] = current
                    }
                    runNext()
                }
            })
            function getList(whatPath,cb){
                let {b,t,rt,p} = parseSoul(whatPath)
                let createdSoul = makeSoul({b,t,rt,':':true})
                let toObj = {}
                gun.get(createdSoul).once(function(data){
                    if(data === undefined){cb.call(cb,toObj); return}//for loop would error if not stopped
                    for (const soul in data) {
                        if(!ALL_INSTANCE_NODES.test(soul))continue
                        if(data[soul] !== null){//not Deleted
                            //this means `false` will pass through, so archived items will still keep increment and unique values enforced
                            soulList.push(soul)
                        }
                    }
                    let toGet = soulList.length
                    for (const soul of soulList) {
                        getCell(soul,p,function(val,from){
                            toGet--
                            toObj[from] = val
                            if(toGet <= 0){
                                cb.call(cb,toObj)
                            }
    
                        },true)
                    }
                })
            }
        }
    }
    runNext()
    function findPropIDs(){
        let coercedPutObj = {}
        //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
        for (const palias in putObj) {
            let pval = findID(props, palias) 
            if (pval) {
                coercedPutObj[pval] = putObj[palias]; 
            }else{
                let err = ' Cannot find column with name: '+ palias +'. Edit aborted'
                throw new Error(err)
            }
        }
        putObj = coercedPutObj
    }
    function runNext(){
        if(run.length){
            let [fn, args] = run[0]
            run.shift()
            util[fn](...args)
        }else{
            let sorted
            try {
                sorted = sortPutObj(gb,nodeID,putObj)
            } catch (error) {
                throwError(error)
            }
            toPut = sorted.toPut
            timeIndices = sorted.tIdx
            logObj = sorted.logObj
            done()
        }
    }
    function done(){
        let {b,t} = parseSoul(nodeID)
        let typeSoul = makeSoul({b,t})
        if(log)timeLog(nodeID,logObj)//log changes
        if(isNew){//if new add to 'created' index for that thingType
            console.log('new created', typeSoul, nodeID)
            timeIndex(typeSoul,nodeID,new Date())
        }
        for (const key in timeIndices) {//for each 'date' column, index
            const unixTS = timeIndices[key];
            timeIndex(key,nodeID,new Date(unixTS))
            console.log('indexing prop', key, unixTS)
        }
        for (const soul in toPut) {
            let {p} = parseSoul(soul)
            let {dataType} = props[p]
            const putObj = toPut[soul];
            if(dataType === 'unorderedSet' && putObj === null){
                gun.get(soul).once(function(setItems){
                    if(setItems !== undefined){
                        for (const item in setItems) {
                            if(item === '_')continue
                            gun.get(soul).get(item).put(false)
                        }
                    }
                })
            }else{
                gun.get(soul).put(putObj)
            }
            
        }
        for (const soul in linkChange) {
            const putObj = linkChange[soul];
            gun.get(soul).put(putObj)
        }

        //run cascade here?????



        cb.call(this, undefined, nodeID)
    }
    function throwError(errmsg){
        let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        console.log(error)
        cb.call(cb,error)
    }

}
function sortPutObj(gb, nodeID, putObj, opts){
    opts = opts || {}
    let pathObj = parseSoul(nodeID)
    let {fromConfig} = opts
    let {props} = getValue(configPathFromChainPath(nodeID),gb)
    let toPut = {}, tIdx = {}, logObj = {}
    for (const pval in putObj) {
        let propPath = makeSoul(Object.assign({},pathObj,{p:pval}))
        let value = putObj[pval]
        let {propType, dataType, alias, pickOptions} = props[pval]
        let v = convertValueToType(value,dataType,nodeID)//Will catch Arrays, and stringify, otherwise probably unneccessary
        let specials = ["source", "target", "parent", "child", "lookup", "function"]//propTypes that can't be changed through the edit API

        if(propType === undefined || dataType === undefined){
            let err = new Error('Cannot find prop types for column: '+ alias +' ['+ pval+'].')
            throw err
        }
        if(propType === 'date'){
            let testDate = new Date(value)
            if(testDate.toString() === 'Invalid Date'){
                let err = new Error('Cannot understand the date string in value, edit aborted! Try saving again with a valid date string (hh:mm:ss is optional): "mm/dd/yyyy, hh:mm:ss"')
                throw err
            }else{
                let unix = testDate.getTime()
                tIdx[propPath] = unix
                addToPut(nodeID,{[pval]:unix})
                logObj[pval] = unix
            }
        }else if(dataType === 'unorderedSet' && (!specials.includes(propType) || fromConfig)){
            if(propType === 'pickMultiple' && v !== null){
                for (const pick in v) {
                    const boolean = v[pick];
                    if(boolean && !pickOptions.includes(pick)){//make sure truthy ones are currently valid options
                        let err = new Error('Invalid Pick Option. Must be one of the following: '+ pickOptions.join(', '))
                        throw err
                    }
                }
            }
            addToPut(propPath,v)
            logObj[pval] = v

        }else if(!specials.includes(propType) || fromConfig){
            addToPut(nodeID,{[pval]: v})
            logObj[pval] = v
       
        }

    }
    return {toPut,tIdx,logObj}


    function addToPut(putSoul,obj){
        let pobj = toPut[putSoul]
        if(!pobj) pobj = {}
        Object.assign(pobj,obj)
    }
}
function parseIncrement(incr){
    let out = {}
    if (incr !== ""){
        out.inc = incr.split(',')[0]*1
        out.start = (incr.split(',')[1]) ? incr.split(',')[1]*1 : 0
        return out
    }else{
        return false
    }
}
const checkUniques = (gb,path, cObj)=>{//for config vals that must be unique among configs
    let uniques = ['alias','sortval']
    let configPath = configPathFromChainPath(path)
    let endPath = configPath.pop()//go up one level
    let things = getValue(configPath, gb)
    if(!path.includes('#') && !path.includes('-') && !path.includes('.')){
        return true //base nothing unique
    }
    let err = {}
    let sorts = 0
    if(things !== undefined){
        for (const id in things) {
            if(id === endPath)continue
            const thingPropConfig = things[id];
            for (const prop of uniques) {
                let cVal = thingPropConfig[prop]
                if(prop === 'sortval'){
                    sorts = (sorts < cVal) ? cVal : sorts
                }
                let compare = cObj[prop]
                if(cVal !== undefined && compare !== undefined && (String(cVal) === String(compare) || String(id) === String(compare))){
                    err[prop] = true
                }
            
            }
        }
        if(err.sortval){
            cObj.sortval = sorts++
            delete err.sortval
        }
        let keys = Object.keys(err)
        if(keys.length){
            throw new Error('Non-unique value found on key(s): '+keys.join(', '))
        }
        return true
    }else{
        let errmsg = 'Cannot find config data at path: ' + configPath
        throw new Error(errmsg)
    }
}
const nextSortval = (gb,path)=>{
    let curIDsPath = configPathFromChainPath(path)
    curIDsPath.push('props')
    let curIDs = getValue(curIDsPath, gb)
    let nextSort = 0
    for (const key in curIDs) {
        const sortval = curIDs[key].sortval;
        //console.log(sortval, nextSort)
        if(sortval && sortval >= nextSort){
            nextSort = sortval
        }
    }
    nextSort += 10
    return nextSort
}
function convertValueToType(value, toType, rowAlias, delimiter){
    let out
    if(value === undefined) throw new Error('Must specify a value in order to attempt conversion')
    if(toType === undefined) throw new Error('Must specify what "type" you are trying to convert ' + value + ' to.')
    delimiter = delimiter || ', '

    if(toType === 'string'){
        if(value === null) return null
        let wasJSON
        if(typeof value === 'string'){//could be a JSON string
            try {
                value = JSON.parse(value)//in case it is a string, that is stringified. Want to get rid of the the JSON
                wasJSON = true
            } catch (error) {
                //do nothing, it is not JSON, `value` should still be the original 'string'
            }
        }
        let type = typeof value
        if(type === 'string'){//already a string (or was a stringified 'string')
            out = value
        }else if(wasJSON || type === 'object'){//if they passed in anything that wasn't a string, it will be now,
            out = JSON.stringify(value)
        }else{//for number, boolean (technically should be valid JSON?)
            out = String(value)
        }
        
    }else if(toType === 'number'){
        if(value === null || value === ""){
            out = null
        }else if(typeof value === 'number'){
            out = value
        }else{
            if(typeof value === 'string'){//could be a JSON string
                try {
                    value = JSON.parse(value)
                } catch (error) {
                    //do nothing, it is not JSON, `value` should still be 'string'
                }
            }
            if(Array.isArray(value))value = value.length 
            //??? Anything that is an array going to a number is going to be hard. Would avoid having to convert to string, modify all vals manually
            //user probably wants to wipe out data if they are trying to go to a number. "count" would be only logical data extraction from an array
            
            let num = value*1
            if(isNaN(num)){
                //maybe a string of a date (mm/dd/yyyy), final attempt before error
                let d = new Date(value)
                if(d.toString() === 'Invalid Date'){
                    let err = 'Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to a number. Fix and try again'
                    throw new Error(err)
                }else{
                    out = d.getTime()
                }
            }else{
                out = num
            }
        }
    }else if(toType === 'boolean'){
        if(value === null){
            out = null
        }else{
            if(typeof value === 'string'){//could be a JSON string
                try {
                    value = JSON.parse(value)
                } catch (error) {
                    
                }
            }
            if(Array.isArray(value))value = value.join(delimiter)//empty array would be falsy
            //any object is true (should never be an object passed as a value)
            //everything should follow javascript truthy or falsy
            let type = typeof value
            if(type === 'string' && !["true","false"].includes(value)){
                throw new Error('Cannot parse string in to boolean, only accepted strings are: "true" or "false".')
                //must fail, only dataType that can't fail is 'string'
            }else if(type === 'number' && ![0,1].includes(value)){
                throw new Error('Cannot parse number in to boolean, only accepted numbers are: 0 (false) or 1 (true).')
            }
            //valid = true, false, "true", "false", 0, 1, [] (length = 0), [withOneElement] (length = 1)
            out = !!value //boolean conversion to make sure
        }
        
    }else if(toType === 'array'){
        if (value === null){
            out = null
        }else if(typeof value === 'string'){
            try {//is it already valid JSON?
                out = JSON.stringify(JSON.parse(value))
            } catch (error) {//nope, make array from split
                out = JSON.stringify(value.split(delimiter))//arrays are stored as strings on puts
            }
        }else if (Array.isArray(value)){
            out = JSON.stringify(value)
        }else{
            let err = 'Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to an Array. Value must be a string with a delimiter (default delimiter: ", ")'
            throw new Error(err)
        }
    }else if(toType === 'unorderedSet'){
        let temp
        if (value === null){
            return null //needs special handling.
        }else if(typeof value === 'string'){
            try {
                let o = JSON.parse(value)
                if((typeof o === "object" && Object.getPrototypeOf(o) === Object.getPrototypeOf({})) || Array.isArray(o)){
                    temp = o
                }else{//is not set like, but valid JSON
                    let err = 'Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to an unorderedSet. Value must be a string with a delimiter (default delimiter: ", "), or an Array, or an Object with truthy,falsy values'
                    throw new Error(err)
                }
            } catch (error) {
                temp = value.split(delimiter)
            }
        }else if(Array.isArray(value))temp=value
        
        if (!Array.isArray(temp)){
            let o = {}
            for (const key in temp) {
                if(ALL_INSTANCE_NODES.test(key)){//link set
                    let boolean = temp[key]//convert boolean
                    if(boolean){
                        o[key] = {'#': key}
                    }else{
                        o[key] = boolean //falsy, could use null, 0 or other falsy values for 'archived' or 'deleted' markers?
                    }
                }else{
                    o[key] = !!temp[key]//convert boolean
                }
            }
            out = o
        }else if (Array.isArray(temp)){
            //assuming array is to be added (for example, like on linking conversion from imported data)
            let o = {}
            for (const val of value) {
                if(ALL_INSTANCE_NODES.test(val)){
                    o[val] = {'#': val}
                }else{
                    o[val] = true
                }
            }
            out = o
        }
    }else{
        throw new Error('Can only attempt to convert value to "string", "number", "boolean", "array", or "unorderedSet" using this function')
    }
    return out
}
const isMulti = (gb,colStr)=>{
    let cpath = configPathFromChainPath(colStr)
    let {allowMultiple} = getValue(cpath,gb) || {}
    if(allowMultiple){
        return true
    }
    return false
}
const getPropType = (gb,propPath)=>{
    let cpath = configPathFromChainPath(propPath)
    let {propType} = getValue(cpath,gb) || {}
    if(propType !== undefined){
        return propType
    }
    return false
}
const getDataType = (gb,propPath)=>{
    let cpath = configPathFromChainPath(propPath)
    let {dataType} = getValue(cpath,gb) || {}
    if(dataType !== undefined){
        return dataType
    }
    return false
}
function tsvJSONgb(tsv){
    let lines=tsv.split("\r\n");
    let result = [];
    let headers=lines[0].split("\t");
    for(let i=0;i<lines.length;i++){
      result[i] = []
        let currentline=lines[i].split("\t");
        for(let j=0;j<headers.length;j++){
        let value = currentline[j]
        let valType = value*1 || String(value) //if it is number, make it a number, else string
        result[i][j] = valType;
        } 
    }
     
    return result; //JavaScript object
    //return JSON.stringify(result); //JSON
}
function removeFromArr(item,arr){
    let position = arr.indexOf(item);

    if(~position){
        arr.splice(position, 1);
    }
    return arr
}
function hasColumnType(gb, tPathOrPpath, type){
    let [base,tval] = tPathOrPpath.split('/')
    let tPath = [base,tval].join('/')
    let cpath = configPathFromChainPath(tPath)
    let {props} = getValue(cpath, gb) || {}
    let cols = []
    for (const pval in props) {
        const {GBtype} = props[pval];
        if(GBtype === type){
            cols.push(pval)
        }
    }
    if(cols.length){
        return cols
    }else{
        return false
    }
}
function getAllColumns(gb, tpath){
    let {b,t,rt} = parseSoul(tpath)
    let {props} = getValue(configPathFromChainPath(makeSoul({b,t,rt})), gb)
    let out = []
    for (const p in props) {
        const {archived,deleted,sortval} = props[p];
        if (!archived && !deleted) {
            out[sortval] = p
        }
    }
    return out.filter(n => n!==undefined)
}
function addAssociation(gun,gb,getCell,path,toPath, cb){
    // getCell has changed!



    cb = (cb instanceof Function && cb) || function(){}
    //gbaseGetRow = gbase[base][tval][rowID]
    let [base,tval,r] = path.split('/')
    let [pval, lpval,assocMult] = findAssociatedCol(gb,path,toPath)
    let {associateMultiple} = getValue(base,'props',tval,'props',pval)
    let nodata = false
    if(!associateMultiple){//link single, check for no current links
        let links = null
        if(!associateMultiple){
            links = getCell(path, pval)
        }
        if(links === undefined){
            nodata = true
        }else if(links.length !== 0){
            throw new Error('Cannot link another row, as the column settings only allow a single link')
        }
    }
    if(!assocMult){//link single, check for no current links
        let llinks = null
        if(!assocMult){
            llinks = getCell(toPath, lpval)
        }
        if(llinks === undefined){
            nodata = true
        }else if(llinks.length !== 0){
            throw new Error('Cannot link another row, as the column settings only allow a single link')
        }
    }
    if(nodata){
        setTimeout(addAssociation,100,gun,gb,path,toPath, cb)
        return false
    }
    let pathLinkSoul = path + '/associations/' + pval
    let lpathLinkSoul = toPath + '/associations/' + lpval
    gun.get(pathLinkSoul).get(toPath).put(true)
    gun.get(lpathLinkSoul).get(path).put(true)
    cb.call(this, undefined)
}
function removeAssociation(gun,gb,path,toPath,cb){
    cb = (cb instanceof Function && cb) || function(){}
    //gbaseGetRow = gbase[base][tval][rowID]
    let [pval, lpval,assocMult] = findAssociatedCol(gb,path,toPath)
    let pathLinkSoul = path + '/associations/' + pval
    let lpathLinkSoul = toPath + '/associations/' + lpval
    gun.get(pathLinkSoul).get(toPath).put(false)
    gun.get(lpathLinkSoul).get(path).put(false)
    cb.call(this, undefined)

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
const multiCompare = (sortQueries,colKey, a, b)=>{
    let [pval,order] = sortQueries[0].SORT
    let idx = colKey.indexOf(pval)
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
        if(sortQueries.lenth > 1){
            comparison = multiCompare(sortQueries.slice(1), colKey,a,b)
        }
    }
    return (
        (order == 'dsc') ? (comparison * -1) : comparison
        );
}
const compareSubArr = (sortQueries, colKey) => (a,b) => {
    //a and b should be [id, [p0Val,p1Val, etc..]]
    //sortQueries = [{SORT:['p0']}, {SORT:['p1']}]
    return multiCompare(sortQueries,colKey,a,b)
}
function formatQueryResults(results, qArr, colArr){//will export this for as a dev helper fn
    //results = [rowID [val,val,val]]
    let sorts = []
    let group = [] //can only have one???
    for (const argObj of qArr) {
        if(argObj.SORT){
            sorts.push(parseSort(argObj))
        }else if(argObj.GROUP){
            if(group.length > 1)throw new Error('Can only group by one columns? Could change this...')
            group.push(parseGroup(argObj))
        }
        
    }
    if(sorts.length === 0){
        sorts.push({SORT:[colArr[0]]})
    }
    results.sort(compareSubArr(sorts,colArr))
    if(group.length){
        let out = {}
        let groupPval = group[0].GROUP[0]
        let idx = colArr.indexOf(groupPval)
        for (const el of results) {
            let [rowID, propArr] = el
            let gVal = propArr[idx]
            if(!Array.isArray(out[gVal])) out[gVal] = []
            out[gVal].push(el)
        }
        return out
    }else{
        return results
    }
}

function buildPermObj(type, curPubKey, usersObj,checkOnly){
    curPubKey = curPubKey || false
    let types = ['base','table','row','group']
    usersObj = usersObj || {}
    if(!types.includes(type)){
        throw new Error('First Argument must be one of: '+types.join(', '))
    }
    if(typeof usersObj !== 'object')usersObj = {}
    let defaults = {}
    defaults.base = {owner:curPubKey,create:'admin',read:'admin',update:'admin',destroy:'admin',chp:'admin'}
    defaults.table = {owner:curPubKey,create:'admin',read:'admin',update:'admin',destroy:'admin',chp:'admin'}
    defaults.row = {owner:curPubKey,create:null,read:null,update:null,destroy:null,chp:null}
    defaults.group = {add: 'admin', remove: 'admin', chp: 'admin'}
    let valid = Object.keys(defaults[type])
    for (const key in usersObj) {
        const putKey = usersObj[key];
        if(!valid.includes(putKey)){
            delete usersObj[putKey]
        }

    }
    let out
    if(!checkOnly){//add missing properties
        out = Object.assign({},defaults[type],usersObj)
    }else{
        out = usersObj
    }
    return out
}

function rand(len, charSet){
    var s = '';
    len = len || 24; // you are not going to make a 0 length random number, so no need to check type
    charSet = charSet || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz'
    while(len > 0){ s += charSet.charAt(Math.floor(Math.random() * charSet.length)); len-- }
    return s;
}
function hash64(string){
    let h1 = hash(string)
    return h1 + hash(h1 + string)
}
function hash(key, seed) {
	var remainder, bytes, h1, h1b, c1, c2, k1, i;
	
	remainder = key.length & 3; // key.length % 4
	bytes = key.length - remainder;
	h1 = seed;
	c1 = 0xcc9e2d51;
	c2 = 0x1b873593;
	i = 0;
	
	while (i < bytes) {
	  	k1 = 
	  	  ((key.charCodeAt(i) & 0xff)) |
	  	  ((key.charCodeAt(++i) & 0xff) << 8) |
	  	  ((key.charCodeAt(++i) & 0xff) << 16) |
	  	  ((key.charCodeAt(++i) & 0xff) << 24);
		++i;
		
		k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

		h1 ^= k1;
        h1 = (h1 << 13) | (h1 >>> 19);
		h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
		h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
	}
	
	k1 = 0;
	
	switch (remainder) {
		case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
		case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
		case 1: k1 ^= (key.charCodeAt(i) & 0xff);
		
		k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
		h1 ^= k1;
	}
	
	h1 ^= key.length;

	h1 ^= h1 >>> 16;
	h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
	h1 ^= h1 >>> 13;
	h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
	h1 ^= h1 >>> 16;

	return h1 >>> 0;
}

const SOUL_ALIAS = {'!':'b','#':'t','-':'rt','$':'r','.':'p','^':'g','&':'f'}//makes it easier to type out...
const SOUL_SYM_ORDER = '!#-.$&^*|%[;@:/?' // "," is used internally for splitting souls, _ is reserved for _source _target as special prop IDs
function makeSoul(argObj){
    let length = {'!':10,'#':6,'-':6,'$':10,'.':6,'^':5,'&':7}
    let soul = ''
    for (const sym of SOUL_SYM_ORDER) {
        let val = argObj[sym] || argObj[SOUL_ALIAS[sym]]
        if(val !== undefined || (sym === '&' && val === '')){
            soul += sym
            if(val === 'new' && length[sym])val=rand(length[sym])
            if((typeof val === 'string' && val !== '') || typeof val === 'number'){//if no val for key, then val will be boolean `true` like just adding | or % for permission or config flag
                soul += val
            }
        }
    }
    return soul
}
function parseSoul(soul){
    //first character of soul MUST be some symbol, or this won't work
    let out = {}
    let last = 0
    let curSym = [soul[0]]
    let idx
    for (const char of SOUL_SYM_ORDER) {
        if(char === soul[0])continue
        idx = soul.indexOf(char)
        if(idx !== -1){
            toOut()
            last = idx
            curSym.push(char)
        }
    }
    //get last segment out, since the end of string will not find add last arg to info
    toOut(soul.length)
    function toOut (toIdx){
        toIdx = toIdx || idx
        let s = curSym.pop()
        let al = SOUL_ALIAS[s]
        let args = soul.slice(last+1,toIdx) || true //"", which we want for variants, else `true` for no args
        if(s === '&' && args===true)args = ''
        out[s] = args
        if(al)out[al] = args //put both names in output?
    }
    return out
}

const soulSchema = {
    /* legend
    !: [b] base id
    #: [t] label/table/nodeType id
    -: [rt] relation id
    .: [p] prop id
    $: [r] instance id
    ^: [g] group id 
    *: pubkey (symbol followed by a pubkey)
    |: permissions (just has to be present, nothing follows symbol)
    %: config (just has to be present, nothing follows symbol)
    :: timeBlock (followed by unix timestamp of beginning of block (if no timestamp, then this node contains first and last block and 'last' times for all nodeIDs))
    [: Array/List node. Will have keys of hashes and values of JSON values
    &: Variant/Fork ID (blank ID means this is the prototype)
    ;: expansion
    @: expansion
    /: scope (symbol followed by a string (allows for extention of soul name spacing)) always second to last
    ?: args (symbol followed by a string. This string is additional arguments or parameters to be used with any symbol) Must be last in soul (can contain any char)
    */
    "!" : "just a base ID, unordered set of all table/relation IDs?",

    "!#" : "base and table, unordered set of all prop IDs",
    "!-" : "base and relation, unordered set of all prop IDs",
    "!%" : "base config",
    "!^" : "group in base (contains the list of pubkeys). If not followed by ID, then list of {ids:alias}",
    "!|" : "base level permissions",
    "!|super" : "super admin of this base",
    
    "!%:" : "base config timelog of changes??",
    "!#." : "base, table, column. Data on this is used for enforceUnique/autoIncrement, keys of nodeIDs and values of the value.",
    "!-." : "base, relation, column. no data at this soul, but could be?",
    "!#%" : "nodeType config",
    "!-%" : "relation config",
    "!#$" : "node ID. contains variant information {[!#$&]: true/false}. unordered set of currently active variants",
    "!-$" : "relationNode (required keys of '_src' & '_trgt', optional '@' if target is snapshotted)",
    "!#|" : "table permissions",
    "!#-" : "????base table relation, (if no relation ID after '-', then this soul contains a list of all connected/outgoing relations for this tableID)",
    "!^|" : "group permissions (who can add/remove/chp)",
    "!#:" : "table time index for node 'created' (also considered 'active' list (if deleted this is falsy on list))",
    "!^*" : "user defined group list (pubkeys : t/f)",


    "!#%:" : "timelog of nodeType CONFIG changes??",
    "!-%:" : "timelog of relation CONFIG changes??",
    "!#.%" : "node prop config",
    "!-.%" : "relation prop config",
    "!#.:" : "nodes indexed by a 'Date' property",
    "!-.:" : "relations indexed by a 'Date' property (not sure use case, I don't think this should be valid. How/when would you query based on relation?)",
    "!#$:" : "timelog (history of edits to this node) Need to include relationship edits here, since they 'define' this node",
    "!^*|" : "user defined group permissions (add, remove, chp)",
    "!#$|" : "permissions on node itself (owner, create, read, update, destroy, chp)",
    "!#$;" : "';' is followed by a hash value of the array value",
    
    "!#$-" : "contains keys of ('<' || '>') + [relationship ID] + [!-$ realtionSoul] and values of (t/f)",
    "!#$&" : "prototype data node. If '&' has numbers after it, it is the variant ID",
    

    "!#.%:" : "timelog of prop config changes??",
    "!-.%:" : "timelog of relation prop config changes??",
    "!#.$&" : "node unordered set data or array hash map and length for '.' property",//if propType = 'data' dataType = 'array' and enforceUnique, it is an ordered Set
    "!-.$&" : "relation unordered set data",

    "!#.$&[" : "Will have 'length', keys of 0,1..., and hashes as keys with the values of JSON"
    
    
    }


function watchObj(){
}
Object.defineProperty(watchObj.prototype, "watch", {
    enumerable: false
  , configurable: true
  , writable: false
  , value: function (prop, handler) {
      var
        oldval = this[prop]
      , getter = function () {
          return oldval;
      }
      , setter = function (newval) {
          if (oldval !== newval) {
              handler.call(this, newval, prop);
              oldval = newval;
          }
          else { return false }
      }
      ;
      
      if (delete this[prop]) { // can't watch constants
          Object.defineProperty(this, prop, {
                get: getter
              , set: setter
              , enumerable: true
              , configurable: true
          });
      }
  }
});

module.exports = {
    cachePathFromChainPath,
    configPathFromSoul,
    configPathFromChainPath,
    configSoulFromChainPath,
    findID,
    gbForUI,
    gbByAlias,
    linkColPvals,
    setValue,
    setMergeValue,
    getValue,
    checkUniques,
    nextSortval,
    convertValueToType,
    isMulti,
    getPropType,
    getDataType,
    tsvJSONgb,
    watchObj,
    allUsedIn,
    removeFromArr,
    hasColumnType,
    addAssociation,
    removeAssociation,
    getRowPropFromCache,
    cachePathFromRowID,
    setRowPropCacheValue,
    bufferPathFromSoul,
    getAllColumns,
    parseSort,
    parseGroup,
    formatQueryResults,
    buildPermObj,
    rand,
    makeSoul,
    parseSoul,
    putData,
    ALL_INSTANCE_NODES,
    DATA_INSTANCE_NODE,
    RELATION_INSTANCE_NODE,
    DATA_PROP_SOUL,
    RELATION_PROP_SOUL,
    PROTO_NODE_SOUL,
    PROPERTY_PATTERN,
    ISO_DATE_PATTERN,
    NULL_HASH,
    sortPutObj,
    newID,
    hash64
}