//GBASE UTIL FUNCTIONS

const IS_CONFIG_SOUL = /^![a-z0-9]+(((#|-)[a-z0-9]+)|((#|-)[a-z0-9]+.[a-z0-9]+))%/i
const INSTANCE_OR_ADDRESS = /^![a-z0-9]+(#|-)[a-z0-9]+((.[a-z0-9]+\$[a-z0-9_]+)|\$[a-z0-9_]+)/i
const ALL_INSTANCE_NODES = /^![a-z0-9]+(#|-)[a-z0-9]+\$[a-z0-9_]+/i
const DATA_INSTANCE_NODE = /^![a-z0-9]+#[a-z0-9]+\$[a-z0-9_]+/i
const RELATION_INSTANCE_NODE = /^![a-z0-9]+-[a-z0-9]+\$[a-z0-9_]+/i
const DATA_PROP_SOUL = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/i
const RELATION_PROP_SOUL = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/i
const PROPERTY_PATTERN = /^![a-z0-9]+(#|-)[a-z0-9]+\.[a-z0-9_]+/i
const ISO_DATE_PATTERN = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+Z/
const ENQ_LOOKUP = /^\u{5}![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/iu
const LABEL_ID = /\d+f[a-z0-9]+/i
const NULL_HASH = hash64(JSON.stringify(null))
const ENQ = String.fromCharCode(5) //enquiry NP char. Using for an escape to say the value that follow is the node to find this prop on
function bufferPathFromSoul(rowID, pval){
    //buffer is the same structure as cache
    let node = parseSoul(rowID)
    if(pval)Object.assign(node,{'p':pval})
    let thisPath = makeSoul(node) //get format in to the right order
    if(thisPath.includes('.') && !thisPath.includes('$'))throw new Error('Must specify a row to get this prop')
    let pathArgs = parseSoul(thisPath)
    let order = ['b','t','r','i','p']//put i before p
    let depth = []
    for (const arg of order) {
        let hasID = pathArgs[arg]
        if(hasID){
            if(arg === 't'){
                depth.push('nodeTypes')
                depth.push(hasID)
            }else if(arg === 'r'){
                depth.push('relations')
                depth.push(hasID)
            }else{
                depth.push(hasID)
            }
        }
    }
    return depth
}
function cachePathFromRowID(rowID, pval){//currently not used, flattened cache
    //rowID should be !#$ or !-$
    //pval should be just an id
    let node = parseSoul(rowID)
    if(pval)Object.assign(node,{'p':pval})
    let stringPath = makeSoul(node) //get format in to the right order
    let cpath = cachePathFromChainPath(stringPath)
    return cpath
}
function cachePathFromChainPath(thisPath){//currently not used, flattened cache
    //valid paths: !, !#, !-, !#.$, !-.$
    if(thisPath.includes('.') && !thisPath.includes('$'))throw new Error('Must specify a row to get this prop')
    let pathArgs = parseSoul(thisPath)
    let order = ['b','t','r','i','p']//put i before p
    let depth = []
    for (const arg of order) {
        let hasID = pathArgs[arg]
        if(hasID){
            if(arg === 't'){
                depth.push('nodeTypes')
                depth.push(hasID)
            }else if(arg === 'r'){
                depth.push('relations')
                depth.push(hasID)
            }else if(arg === 'i'){
                depth.push(thisPath)
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
    //valid paths: !, !#, !-, !^, !&, !#., !-.
    //group is always reference by alias, never by ID
    let {b,t,r,p,g,l} = parseSoul(thisPath)
    let configpath = [b]
    if(thisPath.includes('#')){//nodeType
        configpath = [...configpath, 'props']
        if(typeof t === 'string')configpath.push(t)
    }else if(thisPath.includes('-')){
        configpath = [...configpath, 'relations']
        if(typeof r === 'string')configpath.push(r)
    }
    if(thisPath.includes('.')){//nodeType
        configpath = [...configpath, 'props']
        if(typeof p === 'string')configpath.push(p)
    }else if(thisPath.includes('^')){
        configpath = [...configpath, 'groups']
        if(typeof g === 'string')configpath.push(g)
    }else if(thisPath.includes('&')){
        configpath = [...configpath, 'labels']
        if(typeof l === 'string')configpath.push(l)
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
function collectPropIDs(gb,path,name,isNode){
    //alias could be the actual ID, in which case it will simply just return {[id]:id}
    //need path for baseID
    let {b} = parseSoul(path)
    let type = (isNode) ? 'props' : 'relations'
    let sym = (isNode) ? 't' : 'r'
    let things = getValue([b,type],gb)
    let out = {}
    for (const thing in things) {
        const {props} = things[thing];
        for (const p in props) {
            const {alias} = props[p];
            if([String(alias),String(thing)].includes(String(name))){
                let st = makeSoul({b,[sym]:thing})
                setValue([st,alias],p,out)
            }
        }
    }
    return out
}
function lookupID(gb,alias,path){//used for both alias change check, and new alias
    const checkAgainst = {t:{'#':true},l:{'&':true},r:{'-':true},g:{'^':true}}
    let pathObj = parseSoul(path)
    if(pathObj.p){//prop, simple check
        return findID(gb,alias,path)
    }else{
        let {b,t,r} = pathObj
        for (const checkType in checkAgainst) {
            let type = checkAgainst[checkType]
            if(t && typeof t === 'string' && checkType === 't')type['#'] = t //this will pass along exact path to ignore
            if(r && typeof r === 'string' && checkType === 'r')type['-'] = r //we do this, so if you check alias on the same thing, without changing, it works
            let checkPath = makeSoul(Object.assign({},{b},type))
            let found = findID(gb,alias,checkPath)
            if(found !== undefined){
                return found
            }
        }
    }
}
const findID = (objOrGB, name, path) =>{//obj is level above .props, input human name, returns t or p value
    //if !path, then objOrGB should be level above
    //if path, objOrGb should be gb, path must be !#, !-, !^, !&, !#., !-. 
   
    let gbid //return undefined if not found
    let {g,l} = parseSoul(path)
    let cPath = configPathFromChainPath(path)
    let ignore
    let gOrL = (g || l) ? true : false 
    if(!['groups','props','relations','labels'].includes(cPath[cPath.length-1]))ignore=cPath.pop()
    search = (!path) ? objOrGB : getValue(cPath,objOrGB)
    for (const key in search) {
        if(gOrL){
            const id = search[key]
            if(String(id) === String(name) || String(key) === String(name)){
                gbid = id
                break
            }
        }else{
            if(ignore && String(key) === String(ignore))continue
            const {alias} = search[key]
            if(String(alias) === String(name) || String(key) === String(name)){
                gbid = key
                break
            }
        }
        
    }
    return gbid
    
}
const newID = (gb, path) =>{
    //should be base or base, node (creating new prop) thing we are creating should be parsed as boolean
    //props will be an incrementing integer + noise so no alias conflict: Number() + 'x' + rand(2)
    let {b,t,r,p,f,g} = parseSoul(path)
    let n = 0
    let things
    let delimiter
    let byName = false
    if(p === true){//new prop
        let {props} = getValue(configPathFromChainPath(makeSoul({b,t,r})),gb) || {}
        things=props
        delimiter = 'p'
    }else if(t === true){
        let {props} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
        things = props
        delimiter = 't'
    }else if(r === true){
        let {relations} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
        things = relations
        delimiter='i'
    }else if(f === true){
        let {labels} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
        things = labels
        delimiter='f'
        byName = true
    }else if(g === true){
        let {groups} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
        things = groups
        delimiter='g'
        byName = true
    }else{
        return rand(10) //base or anything that doesn't work
    }
    for (const id in things) {
        let [val] = (!byName) ? id.split(delimiter) : things[id].split(delimiter)
        val = val*1 //get to a number
        if(isNaN(val))continue
        if(n <= val) n = val
    }
    n++
    return n + delimiter + rand(2)
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
function putData(gun, gb, getCell, cascade, timeLog, timeIndex, relationIndex, nodeID, putObj, opts, cb){
    let IDobj = parseSoul(nodeID) 
    let {own,mirror,isNew,ctx,noRelations,internalCB} = opts
    let deleteThis,archive,unarchive
    //own is for editing, it will write putObj to variant even if values match prototype
    //could use own for newFrom as well? would basically be 'copyFrom'
    //noRelations will not copy relationships in that array to the new node
    //internalCB will basically do all logic, but instead of put data to db, will return all of the things to the CB?
    let ctxType = false
    let {b,t,r,i} = IDobj
    let isNode = !r
    let thingType = makeSoul({b,t,r})
    let {props,log,parent,variants,labels} = getValue(configPathFromChainPath(nodeID),gb)
    let {relations} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
    let addedSets = [], refChanges = [], setState = false //contains what user requested in putObj
    if(ctx && isNew){
        if(DATA_INSTANCE_NODE.test(ctx)){
            let {t:ct} = parseSoul(ctx)
            if(t !== ct){//must be of same type to make a newFrom
                throw new Error('NodeID specified for making new node from, is not the same type')
            }
            ctxType = 'from'

        }else{
            throw new Error('Invalid NodeID specified for linking new node to its parent')
        }
    }

    initialCheck()
    //findIDs and convert userValues to correct value type
    let timeIndices = {}, logObj = {}, run = [], toPut = {}, err
    let allProps = getAllActiveProps(gb,nodeID), putProps = Object.keys(putObj)
    let newRelations = [], relationsToPut = {}, addRemoveRelations = {}
    
    let ctxValues = {},ctxRaw = {}, existingValues = {}, existingRaw = {}
    if(refChanges.length && !isNew){
        run.push(['getRawNodeVals',[makeSoul({b,t,i}),putProps,existingRaw]])
        run.push(['handleRefChange',[null]])
        //looks at putObj pval's for those that changes are requested on
        //for each 
        //  if removing removeRef, simply put false for whatever id was marked false
        //  if adding, will need to verify:
        //      the nodeID exists/not archived,

    }

    //if new, the goal is to construct an object given the params and user putObj
    //we will keep updating/mutating putObj through this function
    //once it is 'done' we run it through most of the things that an 'edit' would
    //using the isNew flag we can avoid reading before writing (we would have already done that)



    if(deleteThis){
        //null value on created idx
        //null all values on the node
        //if linked/has relationships, set all those to null
        if(isNode){
            run.push(['deleteNode',[null]])
        }else{
            run.push(['deleteRelationship',[r]])
        }
        

    }else if(archive){
        //set state idx value to `false`
        run.push(['changeArchive',[true]])
       
    }else if(unarchive){
        //inverse of archive
        run.push(['changeArchive',[false]])

    }else if(isNew){
        if(isNode){
            if(!ctx){//just creating a regular new node
                //gbase.base(b).nodeType(root:'').newNode()
                //check userVals
                run.push(['constraintCheck',[null]])
            }else if(ctxType === 'from'){
                run.push(['getCells',[ctx,allProps,ctxValues,false]])
                if(!own)run.push(['getRawNodeVals',[ctx,allProps,ctxRaw]])
                run.push(['getRelations',[null]])
                run.push(['cleanCopyCtx',[null]])
                run.push(['handleRefChanges',[null]])
                run.push(['constraintCheck',[null]])

            }
        }else if(!isNode){//creating a new relationshipNode
            //gbase.node(SRC).relatesTo(TRGT,relationship,props)
            //putObj should have at least two props: source, target
            run.push(['constraintCheck',[null]])//need to make this work with relations..
            run.push(['setupRelationship',[r,putObj]])//need to break it out like this since isNew datanode uses the same function
            //setupRelationship -> 
            //  Need to add data to src and trgt dataNodes in appropriate places for this relation
            //  Also need to index this relation node
        }
        
    }else if(isNode){//editing a dataNode
        run.push(['getRawNodeVals',[nodeID,putProps,existingRaw]])
        if(!own){
            run.push(['getCells',[nodeID,putProps,existingValues,false]])
            run.push(['cleanPut',[null]])
        }
        run.push(['handleRefChanges',[null]])
        run.push(['constraintCheck',[null]])

    }else if(!isNode){//editing a relation
        run.push(['getRawNodeVals',[nodeID,putProps,existingRaw]])
        run.push(['constraintCheck',[null]])
    }
  
    
    
    
    const util = {
        getRawNodeVals: function(soul,pvals,collector){
            let {b,t} = parseSoul(soul)
            let toGet = pvals.length
            for (const p of pvals) {
                let {dataType} = getValue(configPathFromChainPath(makeSoul({b,t,p})),gb)
                gun.get(soul).get(p, function(msg,eve){
                    eve.off()
                    val = msg.put
                    if(dataType === 'array'){
                        val = JSON.parse(val)
                    }
                    if(typeof val === 'object' && val !== null){//unorderedSet
                        val = JSON.parse(JSON.stringify(val))
                        delete val['_']
                    }
                    Object.assign(collector,{[p]:val})
                    toGet--
                    if(!toGet){
                        runNext()
                    }
                })
            }
        },
        getCells: function(id,pvals,collector,ownProp){
            let toGet = pvals.length
            for (const p of pvals) {
                getCell(id,p,function(value,from){
                    if(!ownProp || (ownProp && from === id)){
                        //get all sets to {}?? Need to diff with raw,prev,new. raw and new should be objects already..
                        setValue([p],value,collector)
                    }
                    toGet--
                    if(!toGet){
                        runNext()
                    }
                },true)
            }
        },
        getRelations: function(){
            let {b,t,i} = parseSoul(ctx)
            let idxSoul = makeSoul({b,t,r:true,i})
            gun.get(idxSoul).once(function(firstIdx){
                let firstGets = []
                for (const key in firstIdx) {
                    if(key === '_')continue
                    if(typeof firstIdx[key] === 'object' && !noRelations.includes(key))firstGets.push(key)
                }
                if(firstGets.length){
                    let secondGets = []
                    for (const secondGet of firstGets) {
                        gun.get(firstIdx).get(secondGet).once(function(list){
                            for (const key in list) {
                                if(key === '_')continue
                                const [dir] = key.split(','), isRef = list[key];
                                if(typeof isRef === 'object' && dir === '>')secondGets.push(isRef['#'])
                            }
                            if(secondGets.length){
                                let count = secondGets.length
                                for (const relationSoul of secondGets) {
                                    gun.get(relationSoul).once(function(relationNode, soul){
                                        let data = JSON.parse(JSON.stringify(relationNode))
                                        delete data['_']
                                        data.source = nodeID
                                        let {r} = parseSoul(soul)
                                        run.unshift(['setupRelationship',[r,data]])
                                        count--
                                        if(!count){
                                            runNext()
                                        }
                                    })
                                }
                            }else{
                                runNext()
                            }
                        })
                    }
                }else{
                    runNext()
                }
            })
    
                // .map((node,key) =>{
                //     firstCount++
                //     if(noRelations.includes(key)){//key should be the rtID
                //         return undefined
                //     }else{
                //         firstPassed++
                //         return node
                //     }
                // }).map((rtNode, key) => {
                //     let [dir] = key.split(',')
                //     if(dir === '>'){//we only copy relations where this node is the source
                //         count++
                //         return rtNode
                //     }else{
                //         return undefined
                //     }
                // }).once(function(relationNode, soul){
                //     let data = JSON.parse(JSON.stringify(relationNode))
                //     delete data['_']
                //     data.source = nodeID
                //     let {r} = parseSoul(soul)
                //     run.unshift(['setupRelationship',[r,data]])
                //     count--
                //     if(!count){
                //         runNext()
                //     }
                // })
        
        },
        verifyNewChild: function(){

            let curVal = Object.values(ctxValues)[0]//will only ever have a single value if this fn is running
            let {b: cb,t: ct,i,p} = parseSoul(ctx)
            let ctxNodeID = makeSoul({b: cb,t: ct,i})
            let {allowMultiple} = getValue(configPathFromChainPath(makeSoul({b: cb,t: ct,p})),gb)
            let [parentPval] = hasPropType(gb,makeSoul({b,t}),'parent') || []
            if(!parentPval){
                let e = new Error('Cannot find the "parent" property for this child node')
                throwError(e)
                return
            }
            //curVal could be Enq, undefined, null, string(!multi), object(multi)
            if([undefined,null].includes(curVal)){
                //we can perform this create, given any settings
                //if multi need to addToPut a gun ref to the new unordered set
            }else if(!allowMultiple && DATA_INSTANCE_NODE.test(curVal)){
                let e = new Error('Cannot add a new node until you remove the old child')
                throwError(e)
            }else if(isEnq(curVal)){
                changeEnq(false,ctxNodeID,curVal.slice(1),p)

            }
            if(allowMultiple && typeof curVal !== 'object'){
                addToPut(ctxNodeID,{[p]:{'#':makeSoul({b: cb,t: ct,i,p})}})

            }
            putObj[parentPval] = ctxNodeID//other than an import, this is the only time/way to set this value

            runNext()
        },
        cleanCopyCtx: function(){//kind of like cleanPut, but for isNew
            let temp = {}
            console.log(props,ctxValues,ctxRaw)
            for (const pval in ctxValues) {
                let {autoIncrement,enforceUnique,propType,dataType} = props[pval]
                let val = ctxValues[pval];
                let raw = ctxRaw[pval]
                let userVal = putObj[pval]
                if(['lookup','child'].includes(propType)){
                    val = convertValueToType(ctxValues[pval],dataType)
                    userVal = (userVal) ? convertValueToType(userVal,dataType) : undefined
                }
                if(propType === 'parent'){
                    if(userVal && DATA_INSTANCE_NODE.test(userVal) && parseSoul(userVal).t === parseSoul(parent).t){
                        temp[pval] = userVal
                    }else if(!userVal){
                        temp[pval] = val
                    }else{
                        let e = new Error('Value specified for "parent" is of incorrect type')
                        throwError(e)
                        break
                    }
                }else if(!own && variants && (userVal === undefined || userVal && userVal === val) && !enforceUnique && !autoIncrement){
                    if(isEnq(raw) && mirror){
                        temp[pval] = raw //directly look at the reference on the other node (parallel links)
                    }else{
                        temp[pval] = makeEnq(ctx) //no user input, we will inheit from ref (potentially serial links)
                    }
                }else if((own || !variants) && userVal === undefined && !enforceUnique && !autoIncrement){
                    temp[pval] = val
                }else if(userVal){//user values always go
                    temp[pval] = userVal
                }
            }
            putObj = temp
            for (const newRelation in newRelations) {
                const rObj = newRelations[newRelation];
                
            }
            runNext()
        },
        cleanPut: function(){//ran on edit
            let cleanPutObj = {}
            for (const p in putObj) {
                const userVal = putObj[p], existingR = existingRaw[p], enqV = existingValues[p]
                console.log(userVal,existingR,enqV)
                if(own || (isEnq(existingR) && enqV !== userVal) || (!isEnq(existingR) && existingR !== userVal)){
                    //if (prop is currently inherited but different) or (fOwns it already and userval is different)
                    cleanPutObj[p] = userVal
                }
            }
            putObj = cleanPutObj

            runNext()
        },
        handleRefChanges: function(){
            //go through putObj
            //if isNew, simply addEnq when found
            //  else need to removeEnq if changing a enq

            //user could directly pass in an isEnq userVal? It would have gotten to here without being handled yet.
            //would need to verify it is of same nodeType is all.

            for (const pval in putObj) {
                let {dataType} = props[pval]
                const val = putObj[pval];
                let curR = existingRaw[pval]//always undefined if isNew
                let enqV = existingValues[pval]
                
                if(isEnq(val)){//making new val an enq (or changing it)
                    let childAddress = val.slice(1)
                    if(isEnq(curR)){
                        let removeAddress = curR.slice(1)
                        changeEnq(false,nodeID,removeAddress,pval)
                    }
                    changeEnq(true,nodeID,childAddress,pval)
                }
                
                if(isEnq(curR) && dataType === 'unorderedSet' && !isEnq(val)){
                    addedSets.push(pval)
                    if(typeof val === 'object' && val !== null && typeof enqV === 'object' && enqV !== null ){ //?? Not sure...
                        putObj[pval] = Object.assign({},enqV,val)
                    }
                }
            }

            runNext()
        },
        constraintCheck: function(){
            for (const pval in props) {
                let input = putObj[pval]
                let pconfig = props[pval]
                let {required,defaultval,autoIncrement, enforceUnique, alias, dataType} = pconfig
                if(input !== undefined//user putting new data in
                    || (isNew 
                    && (required || autoIncrement !== ""))//need to have it or create it
                    ){//autoIncrement on this property
                    if(isNew){
                        if(required 
                            && input === undefined 
                            && defaultval === null 
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
                    if(dataType === 'unorderedSet' && (addedSets.includes(pval) || typeof putObj[pval] === 'object')){//make sure set node is refd on node pval
                        //have to addToPut directly, because putObj contains the actual set on that pval prop
                        addToPut(nodeID,{[pval]:{'#':makeSoul({b,t,i,r,p:pval})}})
                    }
                }else{//value undefined
                    if(dataType === 'unorderedSet' && isNew){//for new nodes, always put some value in for unorderedSets
                        putObj[pval] = null
                    }
                }
            }
            runNext()
        },
        checkUnique(pval){
            let pconfig = props[pval]
            let {start,inc} = parseIncrement(pconfig.autoIncrement) || {inc:false}
            let {b,t,r} = parseSoul(nodeID)
            let {enforceUnique, alias, dataType} = pconfig//dataType can only be 'string' or 'number' w/ enforceUnique:true || 'number' w/ inc
            let putVal
            let listID = makeSoul({b,t,r,p:pval})
            try {
                putVal = (inc) ? putObj[pval] : convertValueToType(putObj[pval],dataType)
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
                let {b,t,r,p} = parseSoul(whatPath)
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
                    for (const soul of soulList) {
                        getCell(soul,p,function(val,from){
                            toGet--
                            toObj[from] = val
                            if(!toGet){
                                cb.call(cb,toObj)
                            }
    
                        },true)
                    }
                })
            }
        },
        setupRelationship: function(relationType, rtInstancePut){
            let {source,target} = rtInstancePut
            let r = relationType
            if(!DATA_INSTANCE_NODE.test(source)){
                let e = new Error('Invalid Source')
                throwError(e)
                return
            }
            if(!DATA_INSTANCE_NODE.test(target)){
                let e = new Error('Invalid Target')
                throwError(e)
                return
            }
            let newRelationSoul = makeSoul({b,r,i:newRelationID(source,target)})
            addToPut(newRelationSoul,rtInstancePut,relationsToPut)
            addRemoveRelations[newRelationSoul] = true
            {
                let {b,t,i} = parseSoul(source)
                let srcIdx = makeSoul({b,t,r:true,i})
                let rtSoul = makeSoul({b,t,r,i})
                addToPut(srcIdx,{[r]:{'#':rtSoul}})//probably redundant, but can avoid a read this way
                let key = '>,'+newRelationSoul
                addToPut(rtSoul,{[key]:{'#':newRelationSoul}})
            }
            {
                let {b,t,i} = parseSoul(target)
                let trgtIdx = makeSoul({b,t,r:true,i})
                let rtSoul = makeSoul({b,t,r,i})
                addToPut(trgtIdx,{[r]:{'#':rtSoul}})//probably redundant, but can avoid a read this way
                let key = '<,'+newRelationSoul
                addToPut(rtSoul,{[key]:{'#':newRelationSoul}})
            }
        },
        deleteRelationship: function(relationID){
            let {source,target} = rtInstancePut
            let r = relationID
            if(!DATA_INSTANCE_NODE.test(source)){
                let e = new Error('Invalid Source')
                throwError(e)
                return
            }
            if(!DATA_INSTANCE_NODE.test(target)){
                let e = new Error('Invalid Target')
                throwError(e)
                return
            }
            let newRelationSoul = makeSoul({b,r,i:newRelationID(source,target)})
            addToPut(newRelationSoul,rtInstancePut,relationsToPut)
            addRemoveRelations[newRelationSoul] = true
            {
                let {b,t,i} = parseSoul(source)
                let srcIdx = makeSoul({b,t,r:true,i})
                let rtSoul = makeSoul({b,t,r,i})
                addToPut(srcIdx,{[r]:{'#':rtSoul}})//probably redundant, but can avoid a read this way
                let key = '>,'+newRelationSoul
                addToPut(rtSoul,{[key]:{'#':newRelationSoul}})
            }
            {
                let {b,t,i} = parseSoul(target)
                let trgtIdx = makeSoul({b,t,r:true,i})
                let rtSoul = makeSoul({b,t,r,i})
                addToPut(trgtIdx,{[r]:{'#':rtSoul}})//probably redundant, but can avoid a read this way
                let key = '<,'+newRelationSoul
                addToPut(rtSoul,{[key]:{'#':newRelationSoul}})
            }
        },
        deleteNode: function(){

        },
        changeArchive: function(archiving){
            let [stateP] = hasPropType(gb,thingType,'state')
            let state = (archiving && 'archived') || 'active'
            putObj = {[stateP]:state}
            let stateSoul = makeSoul({b,t,r,i:true})
            addToPut(stateSoul,{[nodeID]:!archiving})
            runNext()
        }
    }
    runNext()
    function initialCheck(){//verifies everything user has entered to ensure it is valid, also finds id's for any alias' used in the obj
        let coercedPutObj = {}
        noRelations = noRelations || []
        //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
        for (const palias in putObj) {
            let pval = findID(props, palias) 
            let v = putObj[palias]
            if (!pval)throw new Error('Cannot find property with name: '+ palias +'. Edit aborted')
            let {alias,propType,dataType} = props[pval]
            
            let cVal = convertValueToType(v,dataType,alias)
            if(dataType === 'array'){
                cVal = JSON.parse(cVal)//convert value will stringify arrays so they are gun ready
            }
            if(isEnq(cVal) && parseSoul(cVal.slice(1)).t !== t){
                //should it error?
                //For now, just remove?
                throw new Error('Invalid inheritance marker on prop: '+ alias)
            }else if(isEnq(cVal)){
                refChanges.push(cVal)
            }
            if(propType === 'labels'){
                //cVal should be an obj with {label: t/f}
                let temp = {}
                for (const label in cVal) {
                    let labelID = (LABEL_ID.test(label)) ? label : labels[label]
                    if(labelID){//no error, just clean incorrect links
                        temp[labelID] = cVal[label]
                    }else{
                        console.warn('Invalid reference ['+label+'] on prop: '+alias+', removing from request and continuing.')
                    }
                }
                if(Object.keys(temp).length){
                    cVal = temp
                }else{
                    continue
                }
            }else if(propType === 'state'){//need to do what the 'state' says
                let validStates = ['active','archived','deleted']
                if(!validStates.includes(cVal))throw new Error('Invalid state. Must be on of: '+validStates.join(', '))
                if(cVal === 'archived')archive = true
                if(cVal === 'active' && !isNew)unarchive = true
                if(cVal === 'deleted')deleteThis = true
                setState = true
                //if(archived > active) need to truthy on all indices
                //if(active> archived) need to falsy on all indices
                //if( ... > deleted) ignore all values from user and make all props = null (including metaData, unorderedSets, relationships (delete those as well))
            }else if(propType === 'date'){
                let testDate = new Date(cVal)
                if(testDate.toString() === 'Invalid Date'){
                    let err = new Error('Cannot understand the date string in value, edit aborted! Try saving again with a valid date string (hh:mm:ss is optional): "mm/dd/yyyy, hh:mm:ss"')
                    throw err
                }
            }
            
            coercedPutObj[pval] = cVal
            
        }
        if(!setState && isNew){
            let [stateP] = hasPropType(gb,nodeID,'state')
            coercedPutObj[stateP] = 'active'
        }
        let found = []
        for (const relation of noRelations) {
            let rtID = findID(relations, relation) 
            if (rtID) {
                found.push(rtID)
            }else{
                let err = ' Cannot find relation with name: '+ relation +'. Edit aborted'
                throw new Error(err)
            }
        }
        putObj = coercedPutObj
        noRelations = found
    }
    function runNext(){
        if(run.length && !err){
            let [fn, args] = run[0]
            run.shift()
            util[fn](...args)
        }else if (!err){
            let sorted
            try {
                sorted = sortPutObj(gb,nodeID,putObj)
            } catch (error) {
                throwError(error)
            }
            Object.assign(toPut,sorted.toPut)
            timeIndices = sorted.tIdx
            logObj = sorted.logObj
            done()
        }
    }
    function done(){
        console.log(toPut)
        //return

        if(isNode){
            
            Object.assign(logObj,addRemoveRelations)
            if(log)timeLog(nodeID,logObj)//log changes
            if(isNew){//if new add to 'created' index for that thingType
                let {b,t} = parseSoul(nodeID)
                let typeSoul = makeSoul({b,t})
                let stateIdx = makeSoul({b,t,i:true})
                console.log('new created', typeSoul, nodeID)
                timeIndex(typeSoul,nodeID,new Date())
                gun.get(stateIdx).put({[nodeID]:true})
            }

            //run cascade here?????
    
        }else{//relations
            //HANDLE ARCHIVE OR DELETE HERE?
        }
         
        for (const soul in toPut) {
            const putObj = toPut[soul];
            if(Object.keys(putObj).length)continue
            gun.get(soul).put(putObj)
        }
        for (const soul in relationsToPut) {
            const putObj = relationsToPut[soul];
            if(Object.keys(putObj).length)continue
            let {source,target} = putObj
            let {t:st} = parseSoul(source)
            let {t:tt} = parseSoul(target)
            relationIndex(gun,soul,st,tt)
            //STILL NEED TO HANDLE ARCHIVE OR DELETING OF A RELATIONSHIP
            gun.get(soul).put(putObj)
        }
        for (const key in timeIndices) {//for each 'date' column, index
            const unixTS = timeIndices[key];
            timeIndex(key,nodeID,new Date(unixTS))
            console.log('indexing prop', key, unixTS)
        }
        cb.call(this, undefined, nodeID)
    }
    function throwError(errmsg){
        let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
        err = error
        console.log(error)
        cb.call(cb,error)
    }
    function changeEnq(add,parentID,childID,pval){
        //verify parent and child are of the same nodeType
        if(!DATA_INSTANCE_NODE.test(parentID) && !isEnq(parentID)){
            let err = 'Invalid parent ID referenced for an inheritance'
            throwError(err)
            return
        }
        if(!DATA_INSTANCE_NODE.test(childID) && !isEnq(childID)){
            let err = 'Invalid child ID referenced for an inheritance'
            throwError(err)
            return
        }
        parentID = (DATA_INSTANCE_NODE.test(parentID)) ? parentID : isEnq(parentID)//make sure it is in soul form
        childID = (DATA_INSTANCE_NODE.test(childID)) ? childID : isEnq(childID)
        let {b,t,i} = parseSoul(parentID)
        parentID = makeSoul({b,t,i})
        let {b:cb,t:ct,i:cr} = parseSoul(childID)
        let p = pval
        if(t !== ct){
            let err = 'Can only inherit values from nodes of the same type'
            throwError(err)
            return
        }

        let childUP = makeSoul({b:cb,t:ct,i:cr,p,'/':'UP'})
        let pputVal = (add) ? {[p]:makeEnq(childID)} : {[p]:null}
        let cputVal = {[parentID] : !!add}
        addToPut(parentID,pputVal)
        addToPut(childUP,cputVal)
    }
    function changeLabel(add,labelID){
        let labelIndex = makeSoul({b,t,f:labelID})
        let putVal = {[nodeID]:false}
        if(add){
            let labelList =  makeSoul({b,t,f:true})
            addToPut(labelList,{[listID]:true})
            putVal = {[nodeID]:{'#':nodeID}}
        }
        addToPut(labelIndex,putVal)
    }
    function addToPut(soul,putObj,obj){
        obj = obj || toPut
        if(!obj[soul])obj[soul] = putObj
        else Object.assign(obj[soul],putObj)
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
        let specials =  ['function']//["source", "target", "parent", "child", "lookup", "function"]//propTypes that can't be changed through the edit API

        if(propType === undefined || dataType === undefined){
            let err = new Error('Cannot find prop types for column: '+ alias +' ['+ pval+'].')
            throw err
        }
        if(propType === 'date'){
            tIdx[propPath] = value
            addToPut(nodeID,{[pval]:value})
            logObj[pval] = value
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
            if(v === null){
                addToPut(nodeID,{[pval]: v})
            }else{
                addToPut(propPath,v)
            }
            logObj[pval] = v

        }else if(!specials.includes(propType) || fromConfig){
            addToPut(nodeID,{[pval]: v})
            logObj[pval] = v
       
        }

    }
    return {toPut,tIdx,logObj}


    function addToPut(putSoul,obj){
        if(!toPut[putSoul]) toPut[putSoul] = {}
        Object.assign(toPut[putSoul],obj)
    }
}
function isEnq(val){
    if(typeof val === 'string' && ENQ_LOOKUP.test(val)){
        return val.slice(1)
    }
    return false
}
function makeEnq(nodeOrAddress,p){
    let soul = nodeOrAddress
    if(p && DATA_INSTANCE_NODE.test(nodeOrAddress)){
        soul = makeSoul(Object.assign({},parseSoul(nodeOrAddress),{p}))
    }
    if(!PROPERTY_PATTERN.test(soul))throw new Error('Must specify a full address for a substitute.')
    return ENQ+soul
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
    let uniques = ['sortval']
    let configPath = configPathFromChainPath(path)
    let endPath = configPath.pop()//go up one level
    let things = getValue(configPath, gb)
    if(!path.includes('#') && !path.includes('-') && !path.includes('.')){
        return true //base nothing unique
    }
    let isNotUnique = lookupID(gb,cObj.alias,path)
    let err = {}
    if(isNotUnique)err[isNotUnique] = true
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
            cObj.sortval = sorts+10
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
const nextSortval = (gb,path,pval)=>{
    //pval is only used if curIDsPath fails
    let curIDsPath = configPathFromChainPath(path)
    curIDsPath.push('props')
    let psort = (pval && pval.split('p')[0]*10) || 10
    let curIDs = getValue(curIDsPath, gb) || {[pval]:psort}
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
    if(isEnq(value))return value//this is a lookup value, just return it.
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
                temp = DATA_INSTANCE_NODE.test(value) ? [value] : value.split(delimiter)
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
function hasPropType(gb, tPathOrPpath, type){
    let {b,t} = parseSoul(tPathOrPpath)
    let tPath = makeSoul({b,t})
    let {props} = getValue(configPathFromChainPath(tPath), gb) || {}
    let cols = []
    for (const pval in props) {
        const {propType} = props[pval];
        if(propType === type){
            cols.push(pval)
        }
    }
    if(cols.length){
        return cols
    }else{
        return false
    }
}
function getAllActiveProps(gb, tpath){
    let {b,t,r} = parseSoul(tpath)
    let {props} = getValue(configPathFromChainPath(makeSoul({b,t,r})), gb)
    let out = []
    for (const p in props) {
        const {archived,deleted,sortval} = props[p];
        if (!archived && !deleted) {
            out[sortval] = p
        }
    }
    return out.filter(n => n!==undefined)
}
function getAllActiveNodeTypes(gb, bpath){
    let {b} = parseSoul(bpath)
    let {props} = getValue(configPathFromChainPath(makeSoul({b})), gb)
    let out = []
    for (const t in props) {
        const {archived,deleted} = props[t];
        if (!archived && !deleted) {
            out.push(t)
        }
    }
    return out
}
function getAllActiveRelations(gb, bpath){
    let {b} = parseSoul(bpath)
    let {relations} = getValue(configPathFromChainPath(makeSoul({b})), gb)
    let out = []
    for (const t in relations) {
        const {archived,deleted} = relations[t];
        if (!archived && !deleted) {
            out.push(t)
        }
    }
    return out
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
function newDataNodeID(id,unix_ms){
    let i = id || rand(3)
    let t = unix_ms || Date.now()
    return i+'_'+t
}
function newRelationID(src,trgt){
    return hash64(src+trgt)
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

const SOUL_ALIAS = {'!':'b','#':'t','-':'r','$':'i','.':'p','^':'g','&':'l'}//makes it easier to type out...
const SOUL_SYM_ORDER = '!#-><.$&^*|%[;@:/?' // "," is used internally for splitting souls, _ is reserved for simple splits in ids
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
function toAddress(node,p){
    return makeSoul(Object.assign(parseSoul(node),{p}))
}
function intersect(setA, setB) {
    var _intersection = new Set();
    for (var elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem);
        }
    }
    return _intersection
}

const soulSchema = {
    /* legend
    !: [b] base id
    #: [t] label/table/nodeType id
    -: [r] relation id
    .: [p] prop id
    $: [i] instance id
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


function Cache(){}
Object.defineProperty(Cache.prototype, "watch", {
    enumerable: false
  , configurable: true
  , writable: false
  , value: function (prop, handler) {
        const getter = function () {
            let val = this[prop]
            let lookup = isEnq(val)
            if(lookup){
                return this[lookup]
            }else{
                return [prop, val]
            }
        }
        const setter = function (newval) {
            this[prop] = newval;
            //we cannot check to see if it has changed automatically
            //must do that by other means before setting value
            //once set, callback will fire
            let get = this[prop] //if isEnq, will not be the same as newval, getter is different
            handler.call(this,prop,get);
        }
        Object.defineProperty(this, prop, {
            get: getter
            , set: setter
            , enumerable: true
            , configurable: true
        });
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
    Cache,
    allUsedIn,
    removeFromArr,
    hasPropType,
    getRowPropFromCache,
    cachePathFromRowID,
    setRowPropCacheValue,
    bufferPathFromSoul,
    getAllActiveProps,
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
    PROPERTY_PATTERN,
    ISO_DATE_PATTERN,
    NULL_HASH,
    sortPutObj,
    newID,
    hash64,
    newDataNodeID,
    ENQ,
    INSTANCE_OR_ADDRESS,
    IS_CONFIG_SOUL,
    isEnq,
    makeEnq,
    toAddress,
    lookupID,
    getAllActiveNodeTypes,
    getAllActiveRelations,
    collectPropIDs,
    intersect
}