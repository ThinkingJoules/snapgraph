//REGEX STUFF
const regOr = (regArr) =>{
    let eval2 = eval
    let cur = ''
    for (const r of regArr) {
        cur += '(?:'+r.toString().slice(1,-2)+')' + '|'
    }
    cur = cur.slice(0,-1) //remove trailing '|'
    cur = '/'+cur+'/i'
    return eval2(cur)
}

//other regex
const ISO_DATE_PATTERN = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+Z/
const USER_SUB = /\$\{(![a-z0-9]+(?:#|-)[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+)\}/i
const LABEL_ID = /\d+l[a-z0-9]+/i

const LINK_LOOKUP = /^\u{5}![a-z0-9]+#[a-z0-9]+\$[a-z0-9_]+/iu
const LINK = String.fromCharCode(5) //enquiry NP char. enquire again for next node

const SUB_LOOKUP = /^\u{26}![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/iu
const SUB = String.fromCharCode(26) //substitute NP char. direct replacement, this value is inherited from another.


//gb CONFIG HELPERS
//object paths
function configPathFromChainPath(thisPath){
    //valid paths: !, !#, !-, !^, !&, !#., !-.
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

//alias-ID finders
function findConfigFromID(gb,path,someID){
    //look through base, then nodeTypes, then Relations, then Groups, then Labels, if still not found, look through all props
    let {b} = parseSoul(path)
    if(b === someID)return gb[b]
    else if(INSTANCE_OR_ADDRESS.test(someID) || ALL_TYPE_PATHS.test(someID))return getValue(configPathFromChainPath(someID),gb)
    else{//assumes someID has no symbols, only alphanumeric
        if(/[^a-z0-9]/i.test(someID))throw new Error('The ID given should be the alphanumeric id value, no symbols')
        let {props,relations,groups,labels} = gb[b]
        //return first found, or return undefined if it can't find anything
        if(props){
            for (const id in props) {
                const tconfig = props[id];
                if(id == someID)return tconfig
                if(tconfig.props){
                    for (const pid in tconfig.props) {
                        const pconfig = tconfig.props[pid];
                        if(pid == someID)return pconfig
                    }
                }
            }
        }
        if(relations){
            for (const id in relations) {
                const rconfig = relations[id];
                if(id == someID)return rconfig
                if(rconfig.props){
                    for (const pid in rconfig.props) {
                        const pconfig = rconfig.props[pid];
                        if(pid == someID)return pconfig
                    }
                }
            }
        }
        if(groups){
            for (const galias in groups) {
                const gid = groups[galias];
                if(gid == someID)return galias
            }
        }
        if(labels){
            for (const lalias in labels) {
                const lid = labels[lalias];
                if(lid == someID)return lalias
            }
        }
    }
}
function grabAllIDs(gb,baseID){
    let b = baseID
    let out = {}

    let {props,relations} = gb[b]
    for (const t in props) {
        let typePath = makeSoul({b,t})
        out[typePath] = grabThingPropPaths(gb,typePath)
    }
    for (const r in relations) {
        let typePath = makeSoul({b,r})
        out[typePath] = grabThingPropPaths(gb,typePath)
    }
    return out
}
function grabThingPropPaths(gb,thingPath){
    let {b,t,r} = parseSoul(thingPath) //could be t||r
    let thingType = makeSoul({b,t,r})
    let tPath = configPathFromChainPath(thingType)
    let {props} = getValue(tPath,gb)
    let out = []

    for (const p in props) {
        out.push(makeSoul({b,t,r,p}))
    }
    return out
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
            if([String(alias),String(p)].includes(String(name))){
                let st = makeSoul({b,[sym]:thing})
                setValue([st,alias],p,out)
            }
        }
    }
    return out
}
function lookupID(gb,alias,path){//used for both alias change check, and new alias
    const checkAgainst = {t:{'#':true},l:{'&':true},r:{'-':true}}
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
   
    let gbid,gOrL,cPath,ignore//return undefined if not found
    if(path){
        let {g,l} = parseSoul(path)
        cPath = configPathFromChainPath(path)
        gOrL = (g || l) ? true : false 
        if(!['groups','props','relations','labels'].includes(cPath[cPath.length-1]))ignore=cPath.pop()
    }
    let search = (!path) ? objOrGB : getValue(cPath,objOrGB)
    for (const key in search) {
        if(gOrL){
            const alias = search[key]
            if(key == name || alias == name){
                gbid = key
                break
            }
        }else{
            if(ignore && key == ignore)continue
            const {alias} = search[key]
            if(alias == name || key == name){
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
    let {b,t,r,p,l,g} = parseSoul(path)
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
        delimiter='r'
    }else if(l === true){
        let {labels} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
        things = labels
        delimiter='l'
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
function getAllActiveProps(gb, tpath,opts){
    let {b,t,r} = parseSoul(tpath)
    let {props} = getValue(configPathFromChainPath(makeSoul({b,t,r})), gb)
    let {hidden,archived,deleted} = opts || {}
    hidden = !!hidden
    archived = !!archived
    deleted = !!deleted
    let out = []
    let i = 0
    for (const p in props) {
        let {hidden:h,archived:a,deleted:d,sortval} = props[p];
        if ((h && hidden || !h) && (a && archived || !a) && (d && deleted || !d)) {
            if(sortval === undefined){sortval = i; i++}
            else {i = sortval+1}
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
function loadFullConfigFromPathDown(gb){

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

//getter and setters
function setValue(propertyPath, value, obj,merge){
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {
        if (!obj.hasOwnProperty(propertyPath[0]) || typeof obj[propertyPath[0]] !== "object") obj[propertyPath[0]] = {}
        return setValue(propertyPath.slice(1), value, obj[propertyPath[0]],merge)
    } else {
        if(merge && typeof value == 'object' && value !== null){
            if (!obj.hasOwnProperty(propertyPath[0]) || typeof obj[propertyPath[0]] !== "object") obj[propertyPath[0]] = {}
            for (const key in value) {
                obj[propertyPath[0]][key] = value[key]
            }
        }else{
            obj[propertyPath[0]] = value
        }
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
function mergeObj(oldO,newO){
    //console.log({oldO,newO})
    for (const key in newO) {
        const val = newO[key];
        if(typeof val === 'object' && val !== null && !Array.isArray(val)){
            if(typeof oldO[key] !== 'object')oldO[key] = {}
            mergeObj(oldO[key],newO[key])
        }
        oldO[key] = newO[key]
    }
}
//error handling
function throwError(cb,errmsg){
    let error = (errmsg instanceof Error) ? errmsg : new Error(errmsg)
    console.log(error)
    cb.call(cb,error)
    return error
}


//CHAIN COMMAND THINGS
function putData(gun, gb, getCell, cascade, timeLog, timeIndex, relationIndex, nodeID, putObj, opts, cb){
    let startTime = Date.now()
    console.log('starting Put',nodeID)
    let ido = snapID(nodeID) 
    let {own,inherit,isNew,ctx,noRelations,isUnique} = opts
    let deleteThis,archive
    // if(inherit && !['exact','reference'].includes(inherit)){
    //     throwError(new Error('if you are copying a node and inheriting, you must specify how to handle the inheritance links'))
    //     return
    // }
    
    //inherit is for newFrom, it will determine how to handle any enq values 
    //  (inherit = 'exact' for copying the exact link (parallel), otherwise anything truthy to make a new ref to the 'from' node(serial))
    //own is for editing, it will write putObj to variant even if values match prototype
    //isUnique will skip the unique check (used from config)
    //noRelations will not copy relationships in that array to the new node
    let ctxType = false
    let {b,t,r,i} = ido
    let isNode = !r
    let {props,externalID} = getValue(configPathFromChainPath(nodeID),gb)
    let {relations,labels} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
    let refChanges = [], setState = false //contains what user requested in putObj
    let err
    if(ctx && isNew){
        if(DATA_INSTANCE_NODE.test(ctx)){
            let {t:ct} = snapID(ctx)
            if(t !== ct){//must be of same type to make a newFrom
                throw new Error('NodeID specified for making new node from, is not the same type')
            }
            ctxType = 'from'

        }else{
            throw new Error('Invalid NodeID specified for linking new node to its parent')
        }
    }
    const put = gunPut(gun)
    initialCheck()
    //console.log(JSON.parse(JSON.stringify(putObj)))
    //findIDs and convert userValues to correct value type
    let timeIndices = {},  relationsIndices = {}, logs = {}, run = [], toPut = {}
    let allProps = getAllActiveProps(gb,nodeID), putProps = Object.keys(putObj)
    let addRemoveRelations = {}
    
    let ctxValues = {},ctxRaw = {}, existingValues = {}, existingRaw = {}

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
       
    }else if(isNew){
        if(isNode){
            if(!ctx){//just creating a regular new node
                //gbase.base(b).nodeType(root:'').newNode()
                //check userVals
                if(refChanges.length)run.push(['handleRefChanges',[null]])
                run.push(['constraintCheck',[null]])
            }else if(ctxType === 'from'){
                run.push(['getCells',[ctx,allProps,ctxValues,false]])
                if(inherit)run.push(['getRawNodeVals',[ctx,allProps,ctxRaw]])
                run.push(['copyCtxRelations',[null]])
                run.push(['cleanCopyCtx',[null]])
                if(refChanges.length)run.push(['handleRefChanges',[null]])
                run.push(['constraintCheck',[null]])

            }
        }else if(!isNode){//creating a new relationshipNode
            //gbase.node(SRC).relatesTo(TRGT,relationship,props)
            //putObj should have at least two props: source, target
            run.push(['constraintCheck',[null]])
            run.push(['setupRelationship',[nodeID,putObj]])//need to break it out like this since isNew (from) datanode uses the same function
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
        //see if putProps.includes(srcP && trgtP) if not, add them to the putProps? Add them to the putObj?
        let srcP = 'SRC'
        let trgtP = 'TRGT'
        if(!putProps.includes(srcP))run.push(['getAddPvalToPutObj',[srcP]])
        if(!putProps.includes(trgtP))run.push(['getAddPvalToPutObj',[trgtP]])

        run.push(['getRawNodeVals',[nodeID,putProps,existingRaw]])
        run.push(['constraintCheck',[null]])
    }
  
    
    
    
    const util = {
        getRawNodeVals: function(soul,pvals,collector){
            let {b,t} = parseSoul(soul)
            let toGet = pvals.length
            for (const p of pvals) {
                let {dataType} = getValue(configPathFromChainPath(makeSoul({b,t,r,p})),gb)
                gun.get(soul).get(p).once(function(val){
                    if(dataType === 'array'){
                        try {
                            val = JSON.parse(val)
                        } catch (error) {
                            
                        }
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
                        let {b,t,r} = parseSoul(id)
                        let propPath = makeSoul({b,t,r,p})
                        let {dataType} = getValue(configPathFromChainPath(propPath),gb)
                        //get all sets to {}?? Need to diff with raw,prev,new. raw and new should be objects already..
                        if(dataType === 'unorderedSet' && Array.isArray(value)){
                            let setObj = {}
                            for (const val of value) {
                                setObj[val] = true
                            }
                            value = setObj
                        }
                        setValue([p],value,collector)
                    }
                    toGet--
                    if(!toGet){
                        runNext()
                    }
                },true,true)
            }
        },
        getAddPvalToPutObj: function(pval){
            getCell(nodeID,pval,function(value){
                putObj[pval] = value
                runNext()
            },true,true)

        },
        copyCtxRelations: function(){
            let {b,t,i} = parseSoul(ctx)
            let idxSoul = makeSoul({b,t,r:true,i})
            let relationSouls = []
            gun.get(idxSoul).once(function(firstIdx){
                let hasRs = []
                for (const rID in firstIdx) {
                    if(rID === '_')continue
                    if(typeof firstIdx[rID] === 'object' && firstIdx[rID] !== null && !noRelations.includes(rID)){
                        hasRs.push(makeSoul({b,t,r:rID,i}))
                    }
                }
                let hasR = hasRs.length
                if(hasR){
                    for (const relationList of hasRs) {
                        gun.get(relationList).once(function(list){
                            for (const key in list) {
                                if(key === '_')continue
                                const [dir,rSoul] = key.split(','), isRef = list[key];
                                if(typeof isRef === 'object' && isRef !== null && dir === '>')relationSouls.push(rSoul)
                            }
                            hasR--
                            if(!hasR)getRelationNodes()
                        })
                    }
                }else{
                    runNext()
                }
            })
            function getRelationNodes(){
                let rToGet = relationSouls.length
                if(rToGet){
                    for (const relationSoul of relationSouls) {
                        gun.get(relationSoul).once(function(relationNode){
                            let data = JSON.parse(JSON.stringify(relationNode))
                            delete data['_']
                            let srcPval = 'SRC'
                            data[srcPval] = nodeID //should overwrite the existing 'source' nodeID
                            run.unshift(['setupRelationship',[relationSoul,data]])
                            rToGet--
                            if(!rToGet){
                                runNext()
                            }
                        })
                    }
                }else{
                    runNext()
                }
            }
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
        cleanCopyCtx: function(){//kind of like cleanPut, but for isNew (from)
            let temp = {}
            console.log(props,ctxValues,ctxRaw)
            for (const pval in ctxValues) {
                let {autoIncrement,enforceUnique} = props[pval]
                let val = ctxValues[pval];
                let raw = ctxRaw[pval]
                let userVal = putObj[pval]
                if(inherit && (userVal === undefined || userVal && userVal === val) && !enforceUnique && !autoIncrement){
                    if(isSub(raw) && inherit === 'exact'){
                        temp[pval] = raw //directly look at the reference on the other node (parallel links)
                    }else{
                        temp[pval] = makeEnq(ctx,pval) //no user input, we will inherit from ref (potentially serial links)
                    }
                }else if(!inherit && userVal === undefined && !enforceUnique && !autoIncrement){
                    temp[pval] = val
                }else if(userVal){//user values always go
                    temp[pval] = userVal
                }
            }
            putObj = temp
            runNext()
        },
        cleanPut: function(){//ran on edit
            let cleanPutObj = {}
            for (const p in putObj) {
                const userVal = putObj[p], existingR = existingRaw[p], enqV = existingValues[p]
                console.log(userVal,existingR,enqV)
                if(own || (isSub(existingR) && enqV !== userVal) || (!isSub(existingR) && existingR !== userVal)){
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
            let subAddr
            for (const pval in putObj) {
                let {dataType} = props[pval]
                const val = putObj[pval];
                let curR = existingRaw[pval]//always undefined if isNew
                let enqV = existingValues[pval]
                
                if((subAddr = isSub(val))){//making new val an enq (or changing it)
                    let thisAddr = toAddress(nodeID,pval)
                    let removeAddress
                    if((removeAddress=isSub(curR))){
                        changeEnq(false,thisAddr,removeAddress,pval)
                    }
                    changeEnq(true,thisAddr,subAddr,pval)
                }
                
                if(isSub(curR) && dataType === 'unorderedSet' && !isSub(val)){
                    if(typeof val === 'object' && val !== null){ //val must be an object
                        let refVal = (typeof enqV === 'object' && enqV !== null) ? enqV : {}
                        putObj[pval] = Object.assign({},refVal,val) //merge userVal with inherited value? Assumes user is giving partial changes to put on new Obj
                    }else if(val === null){//or null
                        putObj[pval] = val
                    }
                }
            }

            runNext()
        },
        constraintCheck: function(){
            for (const pval in props) {
                let input = putObj[pval]
                let {required,defaultval,autoIncrement, enforceUnique, alias, dataType} = props[pval]
                if(input !== undefined//user putting new data in
                    || (isNew 
                        && (required || autoIncrement))//need to have it or create it
                    ){//autoIncrement on this property
                    if(isNew){
                        if(required 
                            && input === undefined 
                            && defaultval === null 
                            && !autoIncrement){//must have a value or autoIncrement enabled
                            let e = new Error('Required field missing: '+ alias)
                            err = throwError(cb,e)
                            return
                        }
                        if(input === undefined && defaultval !== null){
                            putObj[pval] = defaultval
                        }
                        
                    }
                    if (!isUnique && ((enforceUnique && putObj[pval] !== null && putObj[pval] !== undefined)//must be unique, and value is present OR
                        || (autoIncrement && putObj[pval] === undefined && isNew))){//is an autoIncrement, no value provided and is a new node
                        run.unshift(['checkUnique',[pval]])
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
            let {enforceUnique, alias, dataType, autoIncrement} = props[pval]//dataType can only be 'string' or 'number' w/ enforceUnique:true || 'number' w/ inc

            let {start,inc} = parseIncrement(autoIncrement) || {inc:false}
            let {b,t,r} = parseSoul(nodeID)
            let putVal
            let listID = makeSoul({b,t,r,p:pval})
            let thisAddr = makeSoul({b,t,r,p:pval,i})
            try {
                putVal = (inc) ? putObj[pval] : convertValueToType(putObj[pval],dataType)
            } catch (error) {
                err = throwError(cb,error)
            }
            getList(listID,function(list){
                list = list || {}
                let incVals = {}
                for (const addrOnList in list) {
                    if(['_'].includes(addrOnList))continue//anything to skip, add to this array
                    const value = list[addrOnList];
                    if(inc){//this is an incrementing value, this method should also make it unique.
                        incVals[value] = true
                    }
                    if(addrOnList == thisAddr)console.log('THIS THING',value,putVal)
                    if(enforceUnique 
                        && putVal !== undefined
                        && putVal !== null
                        && putVal !== ""//will allow multiple 'null' fields
                        && value == putVal 
                        && addrOnList != thisAddr){//other value found on a different soul
                        err = new Error('Non-unique value on property: '+ alias)
                        throwError(cb,err)
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
                root.getNode(stateSoul,function(data){
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
                        root.getCell(soul,p,function(val,from){
                            toGet--
                            toObj[from] = val
                            if(!toGet){
                                cb.call(cb,toObj)
                            }
    
                        },true,true)
                    }
                })
            }
        },
        setupRelationship: function(relationTypepath, rtInstancePut){//create a relationship
            let {b,r} = parseSoul(relationTypepath)
            let sPval = 'SRC'
            let tPval = 'TRGT'
            let statePval = 'STATE'

            let source = rtInstancePut[sPval]
            let target = rtInstancePut[tPval]
            rtInstancePut[statePval] = 'active'

            if(!DATA_INSTANCE_NODE.test(source)){
                let e = new Error('Invalid Source')
                err = throwError(cb,e)
                return
            }
            if(!DATA_INSTANCE_NODE.test(target)){
                let e = new Error('Invalid Target')
                err = throwError(cb,e)
                return
            }
            let newRelationSoul = makeSoul({b,r,i:newRelationID(source,target)})


            //addToPut(newRelationSoul,rtInstancePut,relationsToPut)
            decomposePutObj(newRelationSoul,rtInstancePut,true)

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
            runNext()
        },
        deleteRelationship: function(relationID){
            //need to have get Node, then null source and target references to this relation
            //then get null allActiveProps for this type (leave source and target? state: 'deleted'?)
            
            addRemoveRelations[newRelationSoul] = false //for logObj??

        },
        deleteNode: function(){

        },
        changeArchive: function(archiving){
            let stateP = 'STATE'
            let state = (archiving && 'archived') || 'active'
            putObj[stateP] = state
            let stateSoul = makeSoul({b,t,r,i:true})
            addToPut(stateSoul,{[nodeID]:!archiving})
            if(!isNode){
                let toGet = 2
                getCell(nodeID,'SRC',function(val){
                    toGet--
                    putObj.SRC = val
                    if(!toGet)runNext()
                })
                getCell(nodeID,'TRGT',function(val){
                    toGet--
                    putObj.TRGT = val
                    if(!toGet)runNext()
                })

            }else{
                runNext()
            }
        }
    }
    runNext()
    function initialCheck(){//verifies everything user has entered to ensure it is valid, also finds id's for any alias' used in the obj
        let coercedPutObj = {}
        noRelations = noRelations || []
        //console.log(putObj)
        //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
        for (const palias in putObj) {
            let pval = findID(props, palias) 
            let v = putObj[palias]
            if (!pval)throw new Error('Cannot find property with name: '+ palias +'. Edit aborted')
            let {alias,propType,dataType,enforceUnique,pickOptions} = props[pval]
            
            let cVal = convertValueToType(v,dataType,alias)
            if(isSub(cVal) && !enforceUnique && externalID !== pval){//cannot inherit values on unique properties
                refChanges.push(cVal)
            }
            if(pval === 'LABELS'){
                //cVal should be an obj with {label: t/f}
                let temp = {}
                allLabels = Object.entries(labels)
                for (const label in cVal) {
                    let labelID = allLabels.filter(x=> x.includes(label))[0][0]
                    if(labelID){//no error, just clean incorrect links
                        temp[labelID] = cVal[label]
                    }else{
                        console.warn('Invalid reference ['+label+'] on prop: '+alias+', removing from request and continuing.')
                        console.warn(`To add a new label: snap.base('${b}').addLabel('${label}')`)
                    }
                }
                if(Object.keys(temp).length){
                    cVal = temp
                }else{
                    continue
                }
            }else if(pval === 'STATE'){//need to do what the 'state' says
                let validStates = ['active','archived','deleted']
                if(!validStates.includes(cVal))throw new Error('Invalid state. Must be one of: '+validStates.join(', '))
                if(cVal === 'archived')archive = true
                if(cVal === 'deleted')deleteThis = true
                setState = true
                //if(active> archived) need to falsy on all indices
                //if( ... > deleted) ignore all values from user and make all props = null (including metaData, unorderedSets, relationships (delete those as well))
            }else if(propType === 'date'){
                let testDate = new Date(cVal)
                if(testDate.toString() === 'Invalid Date'){
                    let err = new Error('Cannot understand the date string in value, edit aborted! Try saving again with a valid date string (hh:mm:ss is optional): "mm/dd/yyyy, hh:mm:ss"')
                    throw err
                }
            }else if(propType === 'pickList' && dataType !== 'unorderedSet'){
                if(!pickOptions.includes(cVal)){
                    let e = new Error('Invalid pick list option. Pick one of: '+pickOptions.join(', '))
                    err = throwError(cb,e)
                    return
                }
            }
            
            coercedPutObj[pval] = cVal
            
        }
        if(!setState && isNew){
            coercedPutObj.STATE = 'active'
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
        //console.log(JSON.stringify(run[0]))
        if(run.length && !err){
            let [fn, args] = run[0]
            run.shift()
            util[fn](...args)
        }else if (!err){



            decomposePutObj(nodeID,putObj,isNew)
            done()
        }
    }
    function decomposePutObj(id,putObj,isNew){
        let {b,t,r} = parseSoul(id)
        let isNode = !r
        let {log,props} = getValue(configPathFromChainPath(id),gb)
        let source,target,logObj = {}
        for (const pval in putObj) {
            let propPath = toAddress(id,pval)
            let value = putObj[pval]
            let {propType, dataType, alias, pickOptions} = props[pval]
            let v = convertValueToType(value,dataType,id)//Will catch Arrays, and stringify, otherwise probably unneccessary
            let specials =  ['function']//["source", "target", "parent", "child", "lookup", "function"]//propTypes that can't be changed through the edit API
    
            if(propType === undefined || dataType === undefined){
                err = throwError(cb,new Error('Cannot find prop types for property: '+ alias +' ['+ pval+'].'))
                return
            }
            if(propType === 'date'){
                let idxPath = makeSoul({b,t,r,p:pval})
                timeIndices[idxPath] = {value:id,unix:v}
                addToPut(id,{[pval]:value})
                logObj[pval] = value
            }else if(dataType === 'unorderedSet'){
                if(propType === 'pickList' && v !== null){
                    for (const pick in v) {
                        const boolean = v[pick];
                        if(boolean && !pickOptions.includes(pick)){//make sure truthy ones are currently valid options
                            let err = new Error('Invalid Pick Option. Must be one of the following: '+ pickOptions.join(', '))
                            throw err
                        }
                    }
                }else if(pval === 'LABELS' && v !== null){
                    for (const label in v) {
                        let labelIdx = makeSoul({b,t,l:label})
                        const boolean = v[label];
                        if(boolean){
                            let labelList =  makeSoul({b,t,l:true})
                            addToPut(labelList,{[label]:true})
                        }
                        addToPut(labelIdx,{[id]:!!boolean})
                    }
                }
                if(v === null){
                    addToPut(id,{[pval]: v})
                }else{
                    addToPut(propPath,v)
                    addToPut(id,{[pval]: {'#': propPath}})//make sure the set is linked to?
                }
                logObj[pval] = v
    
            }else if(pval === 'STATE'){
                let stateIdx = makeSoul({b,t,r,i:true})
                let stateValue
                if(v === 'active')stateValue = true
                else if(v === 'archived')stateValue = false
                else if(v === 'deleted')stateValue = null
                addToPut(stateIdx,{[id]:stateValue})
                addToPut(id,{[pval]: v})//also on node
                logObj[pval] = v
            }else if(!specials.includes(propType)){
                addToPut(id,{[pval]: v})
                logObj[pval] = v
           
            }
            if(pval === 'SRC')source = v
            if(pval === 'TRGT')target = v
    
        }

        //created index
        if(isNew && isNode){//if new add to 'created' index for that thingType
            let typeSoul = makeSoul({b,t})
            let [rand, created] = id.split('_')
            timeIndices[typeSoul] = {value:id,unix: created} 
        }
        if(isNew && !isNode){//if new add to 'created' index
            let {t:st} = parseSoul(source)
            let {t:tt} = parseSoul(target)
            relationsIndices[id] = {sourceT: st, targetT: tt} 
        }

        //logs
        if(isNode){
            if(log)addToPut(id,logObj,logs)
        }else{
            let {log:sLog} = getValue(configPathFromChainPath(source),gb)
            let {log:tLog} = getValue(configPathFromChainPath(target),gb)
            if(sLog || tLog)addToPut(id,logObj,logs)
        }
    }
    function done(){
        if(err)return
        //console.log(toPut)
        //return      
        

        for (const soul in toPut) {
            const putObj = toPut[soul];
            if(!Object.keys(putObj).length)continue
            //console.log(soul,putObj)
            put(soul,putObj)
        }
        for (const index in timeIndices) {
            const {value,unix} = timeIndices[index];
            timeIndex(index,value,new Date(unix*1))
        }
        for (const soul in relationsIndices) {
            const {sourceT,targetT} = relationsIndices[soul];
            relationIndex(gun,soul,sourceT,targetT)
        }

        for (const nodeIDtoLog in logs) {
            const logObj = logs[nodeIDtoLog];
            timeLog(nodeIDtoLog,logObj)
        }
        console.log(Date.now()-startTime+'ms to process put request')
        cb.call(cb, false, nodeID)
    }
    function changeEnq(add,parentAddr,childAddr){
        //verify parent and child are of the same nodeType
        if(!DATA_ADDRESS.test(parentAddr) && !isSub(parentAddr)){
            let e = 'Invalid parent ID referenced for an inheritance'
            err = throwError(cb,e)
            return
        }
        if(!DATA_ADDRESS.test(childAddr) && !isSub(childAddr)){
            let e = 'Invalid child ID referenced for an inheritance'
            err = throwError(cb,e)
            return
        }
        let cSoulObj = parseSoul(childAddr)

        let childUP = makeSoul(Object.assign(cSoulObj,{'/':'UP'}))
        //let pputVal = (add) ? {[p]:makeEnq(childProp)} : {[p]:null}
        let cputVal = {[parentAddr] : !!add}
        //addToPut(parentNode,pputVal) parent is always the node being edited/created so it's values are in the putObj
        addToPut(childUP,cputVal)
    }
    function addToPut(soul,putObj,obj){
        obj = obj || toPut
        if(!obj[soul])obj[soul] = putObj
        else Object.assign(obj[soul],putObj)
    }

}


function StringCMD(path,appendApiToEnd){
    let self = this
    this.curCMD = (path) ? 'gbase.base' : 'gbase'
    this.configPath = path && configPathFromChainPath(path) || []
    let cPath = this.configPath
    if(appendApiToEnd)cPath = [...cPath,appendApiToEnd]
    for (let i = 0; i < cPath.length; i++) {
        const get = cPath[i];
        if(i == cPath.length-1 && appendApiToEnd)this.curCMD+='.'+appendApiToEnd
        else if(!(i%2))this.curCMD+=`('`+get+`')`
        else if(i === 1 && get === 'props')this.curCMD+='.nodeType'
        else if(i === 1 && get === 'relations')this.curCMD+='.relation'
        else if(i === 3)this.curCMD+='.prop'
        
    }
    this.appendReturn = function(string,asIs){
        if(asIs)return self.curCMD+string
        return self.curCMD+"('"+string+"')"
    }
}

//CONVERSION THINGS
function convertValueToType(value, toType, rowAlias, delimiter){
    let out
    if(value === undefined) throw new Error('Must specify a value in order to attempt conversion')
    if(isSub(value))return value//this is a lookup value, just return it.
    if(USER_SUB.test(value)){//convert user specified enq '${!#.$}' to gbase Enq
        return makeEnq(value)
    }
    if(toType === undefined) throw new Error('Must specify what "type" you are trying to convert ' + value + ' to.')
    
    if(typeof value === 'string' &&  /^\$\{(.+)\}/.test(value))return value//if this is an imported user enq, leave as is.
    delimiter = delimiter || ', '
    //console.log('BEFORE',JSON.parse(JSON.stringify(value)))

    if(toType === 'string'){
        let test
        if(value === null) return null
        if(typeof value === 'string'){//could be a JSON string
            try {
                test = JSON.parse(value)//in case it is a string, that is stringified. Want to get rid of the the JSON
            } catch (error) {
                //do nothing, it is not JSON, `value` should still be the original 'string'
            }
        }
        if(test === null)return null
        else if(typeof test === 'string') value = test
        let type = typeof value
        if(type === 'string'){//already a string (or was a stringified 'string')
            out = value
        }else if(type === 'object'){//if they passed in anything that wasn't a string, it will be now,
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
                value = JSON.parse(value)
            } catch (error) {//nope, make array from split
                value = value.split(delimiter)//arrays are stored as strings on puts
            }
        }else if(!Array.isArray(value)){
            let err = 'Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to an Array. Value must be a string with a delimiter (default delimiter: ", ")'
            throw new Error(err)
        }
        out = JSON.stringify(value)
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
        }else if(Array.isArray(value) || typeof value == 'object')temp=value
        //is an object at this point, could be an array
        //console.log('TO O',temp)
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
            for (const val of temp) {
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
    //console.log('AFTER',JSON.parse(JSON.stringify(out)))

    return out
}
function tsvJSONgb(tsv){//Need to make better so it can be a csv, tsv, \r || \r\n without any issues
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

//CONFIG STUFF
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

//FUNCTION UTIL
function findTruth(ifFirstArg,FILTERtruth){
    if(!FILTERtruth){
        let r = /IF\(/
        let match = r.exec(ifFirstArg)
        if(match !== null){
            throw new Error('Cannot have an IF statement as the first argument in an IF Statement')
        }
    }
    let containsInvalidChars = /[^()+\-*/0-9.\s<>=!]/g.test(ifFirstArg)
    let valid = (containsInvalidChars) ? parseTruthStr(ifFirstArg, 'string') : parseTruthStr(ifFirstArg, 'number')
    let solver = new MathSolver()
    let output = solver.solveAndCompare(valid)
    return output
    function parseTruthStr(TFstr, compType){
        //check to ensure there is only one logical operator
        let operators = /(>=|=<|!=|>|<|=)/g
        let str = TFstr.replace(/\s/g,"")
        let found = [...str.matchAll(operators)]
        if(found.length !== 1){
            let err = 'Can only have one comparison operator per T/F block: '+ TFstr
            throw new Error(err)
        }
        if(compType === 'number'){
            str = str.slice(0,found[tok[0]])+')'+tok[0]+'('+str.slice(found[tok[0]]+ tok[0].length, str.length)
            str = '(' + str
            str += ')'
        }
        return str
    }
}
function MathSolver() {

    this.infixToPostfix = function(infix) {
        var outputQueue = "";
        var operatorStack = [];
        var operators = {
            "^": {
                precedence: 4,
                associativity: "Right"
            },
            "/": {
                precedence: 3,
                associativity: "Left"
            },
            "*": {
                precedence: 3,
                associativity: "Left"
            },
            "+": {
                precedence: 2,
                associativity: "Left"
            },
            "-": {
                precedence: 2,
                associativity: "Left"
            }
        }
        infix = infix.replace(/\s+/g, "");
        infix = clean(infix.split(/([\+\-\*\/\^\(\)])/))
        for(var i = 0; i < infix.length; i++) {
            var token = infix[i];
            if(isNumeric(token)) {
                outputQueue += token + " ";
            } else if("^*/+-".indexOf(token) !== -1) {
                var o1 = token;
                var o2 = operatorStack[operatorStack.length - 1];
                while("^*/+-".indexOf(o2) !== -1 && ((operators[o1].associativity === "Left" && operators[o1].precedence <= operators[o2].precedence) || (operators[o1].associativity === "Right" && operators[o1].precedence < operators[o2].precedence))) {
                    outputQueue += operatorStack.pop() + " ";
                    o2 = operatorStack[operatorStack.length - 1];
                }
                operatorStack.push(o1);
            } else if(token === "(") {
                operatorStack.push(token);
            } else if(token === ")") {
                while(operatorStack[operatorStack.length - 1] !== "(") {
                    outputQueue += operatorStack.pop() + " ";
                }
                operatorStack.pop();
            }
        }
        while(operatorStack.length > 0) {
            outputQueue += operatorStack.pop() + " ";
        }
        return outputQueue;
    }
    this.solvePostfix = function postfixCalculator(expression) {
        if (typeof expression !== 'string') {
          if (expression instanceof String) {
            expression = expression.toString();
          } else {
            return null;
          }
        }
    
        var result;
        var tokens = expression.split(/\s+/);
        var stack = [];
        var first;
        var second;
        var containsInvalidChars = /[^()+\-*/0-9.\s]/gi.test(expression);
    
        if (containsInvalidChars) {
          return null;
        }
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            if (token === '*') {
                second = stack.pop();
                first = stack.pop();
        
                if (typeof first === 'undefined') {
                first = 1;
                }
        
                if (typeof second === 'undefined') {
                second = 1;
                }
        
                stack.push(first * second);
            } else if (token === '/') {
                second = stack.pop();
                first = stack.pop();
                if(second === 0){//can't divide by 0...
                    throw new Error('Cannot divide by zero')
                }
                stack.push(first / second);
            } else if (token === '+') {
                second = stack.pop();
                first = stack.pop();
                stack.push(first + second);
            } else if (token === '-') {
                second = stack.pop();
                first = stack.pop();
                stack.push(first - second);
            } else {
                if (isNumeric(token)) {
                stack.push(Number(token));
                }
            }
        }
    
        result = stack.pop();
    
        return result;
    }
    this.infixToPostfixCompare = function(infix) {
        infix = this.swapOperators(infix)
        var outputQueue = "";
        var operatorStack = [];
        var operators = {
            "^": {
                precedence: 4,
                associativity: "Right"
            },
            "/": {
                precedence: 3,
                associativity: "Left"
            },
            "*": {
                precedence: 3,
                associativity: "Left"
            },
            "+": {
                precedence: 2,
                associativity: "Left"
            },
            "G": {
                precedence: 1,
                associativity: "Left"
            },
            "L": {
                precedence: 1,
                associativity: "Left"
            },
            "E": {
                precedence: 1,
                associativity: "Left"
            },
            "N": {
                precedence: 1,
                associativity: "Left"
            },
            "P": {
                precedence: 1,
                associativity: "Left"
            },
            "M": {
                precedence: 1,
                associativity: "Left"
            }
        }
        infix = infix.replace(/\s+/g, "");
        infix = clean(infix.split(/([\+\-\*\/\^\(\)GLENPM])/))
        for(var i = 0; i < infix.length; i++) {
            var token = infix[i];
            if(isNumeric(token)) {
                outputQueue += token + " ";
            } else if("^*/+-GLENPM".indexOf(token) !== -1) {
                var o1 = token;
                var o2 = operatorStack[operatorStack.length - 1];
                while("^*/+-GLENPM".indexOf(o2) !== -1 && ((operators[o1].associativity === "Left" && operators[o1].precedence <= operators[o2].precedence) || (operators[o1].associativity === "Right" && operators[o1].precedence < operators[o2].precedence))) {
                    outputQueue += operatorStack.pop() + " ";
                    o2 = operatorStack[operatorStack.length - 1];
                }
                operatorStack.push(o1);
            } else if(token === "(") {
                operatorStack.push(token);
            } else if(token === ")") {
                while(operatorStack[operatorStack.length - 1] !== "(") {
                    outputQueue += operatorStack.pop() + " ";
                }
                operatorStack.pop();
            }
        }
        while(operatorStack.length > 0) {
            outputQueue += operatorStack.pop() + " ";
        }
        return outputQueue;
    }
    this.swapOperators = function(infix){
        infix = infix.replace(/<=/g, 'M')
        infix = infix.replace(/>=/g, 'P')
        infix = infix.replace(/!=/g, 'N')
        infix = infix.replace(/>/g, 'G')
        infix = infix.replace(/</g, 'L')
        infix = infix.replace(/=/g, 'E')
        return infix
    }
    this.evaluatePostfix = function (expression) {
        if (typeof expression !== 'string') {
          if (expression instanceof String) {
            expression = expression.toString();
          } else {
            return null;
          }
        }
    
        var result;
        var tokens = expression.split(/\s+/);
        var stack = [];
        var first;
        var second;
        var containsInvalidChars = /[^()+\-*/0-9.\sGLENPM]/g.test(expression);
        if (containsInvalidChars) {
          return null;
        }
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            if("GLENPM".indexOf(token) !== -1){//should always be only one, at end of stack
                second = stack.pop()
                first = stack.pop()
                if(token === 'G'){
                    if(first > second){
                        return true
                    }else{
                        return false
                    }
                }
                if(token === 'L'){
                    if(first < second){
                        return true
                    }else{
                        return false
                    }
                }
                if(token === 'E'){
                    if(first === second){
                        return true
                    }else{
                        return false
                    }
                }
                if(token === 'N'){
                    if(first !== second){
                        return true
                    }else{
                        return false
                    }
                }
                if(token === 'P'){
                    if(first >= second){
                        return true
                    }else{
                        return false
                    }
                }
                if(token === 'M'){
                    if(first <= second){
                        return true
                    }else{
                        return false
                    }
                }
            }
            if (token === '*') {
                second = stack.pop();
                first = stack.pop();
        
                if (typeof first === 'undefined') {
                first = 1;
                }
        
                if (typeof second === 'undefined') {
                second = 1;
                }
        
                stack.push(first * second);
            } else if (token === '/') {
                second = stack.pop();
                first = stack.pop();
                stack.push(first / second);
            } else if (token === '+') {
                second = stack.pop();
                first = stack.pop();
                stack.push(first + second);
            } else if (token === '-') {
                second = stack.pop();
                first = stack.pop();
                stack.push(first - second);
            } else {
                if (isNumeric(token)) {
                stack.push(Number(token));
                }
            }
        }
    
        result = stack.pop();
    
        return result;
    }
    this.solveAndCompare = function(infix){
        let pf = this.infixToPostfixCompare(infix)
        return this.evaluatePostfix(pf)
    }
    this.solve = function(infix){
        let pf = this.infixToPostfix(infix)
        return this.solvePostfix(pf)
    }
    function isNumeric(value){
        return !isNaN(parseFloat(value)) && isFinite(value);
    }
    function clean(arr){
        for(var i = 0; i < arr.length; i++) {
            if(arr[i] === "") {
                arr.splice(i, 1);
            }
        }
        return arr;
    }
}

//SNAP STUFF
const on = function(tag,cb,opts){
    const onObj = this
    opts = opts || {}
    if((cb && cb instanceof Function) || (cb && Array.isArray(cb) && cb.every(x => x instanceof Function))){//adding an event listener
        if(!getValue(['tag',tag],onObj))setValue(['tag',tag],[],onObj)
        if(!Array.isArray(cb))cb = [cb]
        opts.dir = opts.dir || 'push'
        if(opts.dir == 'push'){
            onObj.tag[tag] = onObj.tag[tag].concat(cb)
        }else{
            onObj.tag[tag] = cb.concat(onObj.tag[tag])
        }
    }else{//new event on this tag
        let calls = onObj.tag[tag]
        if(calls && Array.isArray(calls)){
            run(calls,cb)
            function run(calls,eventValue){
                let inst = calls.slice()
                next()                
                function next(){
                    let nextCall = inst.shift()
                    nextCall = (nextCall instanceof Function && nextCall) || function(){}
                    nextCall.call(onObj,eventValue,next)
                }
            }
        }
    }
}
const encTime = function(unix){
    //state only, so we know length will always be 13 and `a` will never start with 0
    unix = unix || Date.now()
    if(typeof unix === 'number' && (unix = String(unix)).length === 13){//should ignore Infinity or other low numeric values
        let a = String.fromCharCode(unix.slice(0,5))
        let b = String.fromCharCode(checkZeros(unix.slice(5,9)))
        let c = String.fromCharCode(checkZeros(unix.slice(9)))
        return a+b+c
    }
    return unix
    function checkZeros(subS){
        let i = 0
        while (subS[i] == 0) {
            subS = subS.slice(i)
            i++
        }
        return (subS || 0) //if it is all zeros we need to return atleast one
    }
}
const decTime = function(str){
    let a = String(str.charCodeAt(0))
    let b = [...String(str.charCodeAt(1))]
    let c = [...String(str.charCodeAt(2))]
    while(b.length !==4){b.unshift('0')}
    while(c.length !==4){c.unshift('0')}
    return +(a+b.join('')+c.join(''))
}

const ALIAS_LIST = /^~@.+/
const LOGIN_AUTH_INFO = /^~\*[^@>]+$/
const PUBKEY_OWNED_PEERS = /^~\*[^@>]+>$/
const NAMESPACE_LOCATION = /^~!.+/

const TYPE_INDEX = /^![a-z0-9]+#}$/i
const BASE_CONFIG =/^![a-z0-9]+%$/i
const NODE_STATE = /^![a-z0-9]+#[a-z0-9]+\$}$/i
const RELATION_STATE = /^![a-z0-9]+-[a-z0-9]+\$}$/i
const BASE = /^![a-z0-9]+$/i
const NODE_TYPE = /^![a-z0-9]+#[a-z0-9]+$/i
const RELATION_TYPE = /^![a-z0-9]+-[a-z0-9]+$/i
const GROUP_TYPE = /^![a-z0-9]+\^[a-z0-9]+$/i
const LABEL_INDEX = /^![a-z0-9]+&}$/i
const LABEL_TYPE = /^![a-z0-9]+&[a-z0-9]+$/i
const TYPE_CONFIG = /^![a-z0-9]+#[a-z0-9]+%$/i
const TYPE_LABEL_INDEX = /^![a-z0-9]+#[a-z0-9]+&}$/i
const RELATION_INDEX = /^![a-z0-9]+-[a-z0-9]+>[a-z0-9]+<[a-z0-9]+}$/i

const RELATION_CONFIG =/^![a-z0-9]+-[a-z0-9]+%$/i
const PROP_CONFIG = /^![a-z0-9]+(?:#|-)[a-z0-9]+.[a-z0-9]+%$/i
const TYPE_PROP_INDEX = /^![a-z0-9]+#[a-z0-9]+.}$/i
const RELATION_PROP_INDEX = /^![a-z0-9]+-[a-z0-9]+.}$/i
const PROP_TYPE = /^![a-z0-9]+(?:#|-)[a-z0-9]+.[a-z0-9]+$/i

const DATA_INSTANCE_NODE = /^![a-z0-9]+#[a-z0-9]+\$[a-z0-9_]+/i
const RELATION_INSTANCE_NODE = /^![a-z0-9]+-[a-z0-9]+\$[a-z0-9_]+/i
const DATA_ADDRESS = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+[^|:;/?]+$/i
const RELATION_ADDRESS = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+[^|:;/?]+$/i
const TIME_DATA_ADDRESS = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+:/i
const TIME_RELATION_ADDRESS = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+:/i

const BASE_PERM = /^![a-zA-Z0-9]+\|(?:[crud])?$/
const NT_PERM = /^![a-zA-Z0-9]+#[a-zA-Z0-9]+\|(?:[crud])?$/
const PROP_PERM = /^![a-zA-Z0-9]+#[a-zA-Z0-9]+.[a-zA-Z0-9]+\|(?:[crud])?$/
const NODE_PERM = /^![a-zA-Z0-9]+#[a-zA-Z0-9]+\$[a-zA-Z0-9_]+\|(?:[crud])?$/
const LABEL_INDEX_PERM = /^![a-zA-Z0-9]+&}\|(?:[crud])?$/
const TYPE_INDEX_PERM = /^![a-zA-Z0-9]+#}\|(?:[crud])?$/
const TYPE_PROP_INDEX_PERM = /^![a-zA-Z0-9]+#[a-zA-Z0-9]+.}\|(?:[crud])?$/
const NODE_STATE_PERM = /^![a-zA-Z0-9]+#[a-zA-Z0-9]+\$}\|(?:[crud])?$/i


const TIME_INDEX_PROP = regOr([TIME_DATA_ADDRESS,TIME_RELATION_ADDRESS])
const IS_STATE_INDEX = regOr([NODE_STATE,RELATION_STATE])
const INSTANCE_OR_ADDRESS = regOr([DATA_INSTANCE_NODE,RELATION_INSTANCE_NODE,DATA_ADDRESS,RELATION_ADDRESS])
const NON_INSTANCE_PATH = regOr([BASE,NODE_TYPE,RELATION_TYPE,PROP_TYPE])
const ALL_ADDRESSES = regOr([DATA_ADDRESS,RELATION_ADDRESS])
const ALL_TYPE_PATHS = regOr([NODE_TYPE,RELATION_TYPE,LABEL_TYPE])
const ALL_INSTANCE_NODES = regOr([DATA_INSTANCE_NODE,RELATION_INSTANCE_NODE])
const IS_CONFIG_SOUL = regOr([BASE_CONFIG,TYPE_INDEX,LABEL_TYPE,TYPE_CONFIG,RELATION_CONFIG,PROP_CONFIG,TYPE_PROP_INDEX,RELATION_PROP_INDEX,LABEL_INDEX])
const CONFIG_SOUL = regOr([BASE_CONFIG,LABEL_TYPE,TYPE_CONFIG,RELATION_CONFIG,PROP_CONFIG])
const IS_CONFIG = (id) =>{
    const ALL = {
        typeIndex: TYPE_INDEX,
        baseConfig: BASE_CONFIG,
        propIndex: regOr([TYPE_PROP_INDEX,RELATION_PROP_INDEX]),
        thingConfig: regOr([TYPE_CONFIG,RELATION_CONFIG]),
        propConfig: PROP_CONFIG,
        label: LABEL_TYPE,
        labelIndex: LABEL_INDEX
    }
    let is = false
    for (const idType in ALL) {
        const r = ALL[idType];
        if(is = r.test(id))return idType
    }
    return is
}
const IS_PERM = (id) =>{
    const ALL = {
        base: BASE_PERM,
        type: NT_PERM,
        prop: PROP_PERM,
        node: NODE_PERM,
        labelIndex: LABEL_INDEX_PERM,
        typeIndex: TYPE_INDEX_PERM,
        typePropIndex: TYPE_PROP_INDEX_PERM,
        nodeStateIndex: NODE_STATE_PERM
        //created/time index/blocks?
    }
    let is = false
    for (const idType in ALL) {
        const r = ALL[idType];
        if(is = r.test(id))return idType
    }
    return is
}
const IS_NODE = (id) =>{
    const ALL = {
        node: regOr([DATA_INSTANCE_NODE,DATA_ADDRESS]),
        relation: regOr([RELATION_INSTANCE_NODE,RELATION_ADDRESS]),
    }
    let is = false
    for (const idType in ALL) {
        const r = ALL[idType];
        if(is = r.test(id))return idType
    }
    return is
}
const IS_INDEX = (id) =>{
    //need this so we check premissions on the keys within the node and not the node id itself
    const ALL = {
        state: regOr([NODE_STATE,RELATION_STATE]),
        label: regOr([TYPE_LABEL_INDEX,RELATION_INDEX]),
    }
    let is = false
    for (const idType in ALL) {
        const r = ALL[idType];
        if(is = r.test(id))return idType
    }
    return is
}
const IS_GOSSIP = (id) =>{
    const ALL = {
        alias: ALIAS_LIST,
        auth: LOGIN_AUTH_INFO,
        owns: PUBKEY_OWNED_PEERS,
        resource: NAMESPACE_LOCATION,
    }
    let is = false
    for (const idType in ALL) {
        const r = ALL[idType];
        if(is = r.test(id))return idType
    }
    return is
}

function snapID(id,opts){
    if(!new.target){ return new snapID(id,opts) }
    
    const SOUL_ALIAS = {'!':'b','#':'t','-':'r','$':'i','.':'p','^':'g','&':'l','*':'pub','~':'gos'}//makes it easier to type out...
    const SOUL_SYM_ORDER = '~!#-><.$&^*|%[};:/?@' // "," is used internally for splitting souls, _ is reserved for simple splits in ids
    const self = this
    
    //opts? will have regex match 'extract', for better performance?
    if(typeof id === 'string'){
        if(LINK_LOOKUP.test(id) || SUB_LOOKUP.test(id))id = id.slice(1)//trim first char
        self.string = id
        whatIs()
        let parse = stoo(id)
        if(Array.isArray(parse))return parse
        else Object.assign(this,parse)
        cPath()
    }else{//? should never need???
        Object.assign(this,stoo(otos(id)))
    }
    function stoo(str){//parse string
        let out = {}
        let last = 0
        let [id,p] = str.split(String.fromCharCode(30))//shouldn't ever send a flatpack string in?
        if(p)return [id,p] //will return the split instead of the ido?
        let curSym = [id[0]]
        let idx
        for (const char of SOUL_SYM_ORDER) {
            if(char === id[0])continue
            idx = id.indexOf(char)
            if(idx !== -1){
                toOut()
                last = idx
                curSym.push(char)
            }
        }
        //get last segment out, since the end of string will not find add last arg to info
        toOut(id.length)
        return out
        function toOut (toIdx){
            toIdx = toIdx || idx
            let s = curSym.pop()
            let al = SOUL_ALIAS[s]
            let args = id.slice(last+1,toIdx) || true 
            out[s] = args
            if(al)out[al] = args //put both names in output?
        }
    }
    function otos(argObj){//make string
        //no type uses current state
        argObj = argObj || self
        let id = ''
        for (const sym of SOUL_SYM_ORDER) {
            let val = argObj[sym] || argObj[SOUL_ALIAS[sym]]
            if(val !== undefined){
                id += sym
                if((typeof val === 'string' && val !== '') || typeof val === 'number'){//if no val for key, then val will be boolean `true` like just adding | or % for permission or config flag
                    id += val
                }
            }
        }
        return id
    }
    function whatIs(){
        let temp
        if((temp = IS_CONFIG(id)))self.is = 'config' 
        else if((temp = IS_PERM(id)))self.is = 'perm' 
        else if((temp = IS_INDEX(id))) self.is = 'index' 
        else if((temp = IS_NODE(id)))self.is = 'node'   
        else if((temp = IS_GOSSIP(id)))self.is = 'gossip' 
        self.type = temp
    }
    function cPath(){
        //valid paths: !, !#, !-, !^, !&, !#., !-.
        let {b,t,r,p,g,l} = self
        let configpath = [b]
        if(t){//nodeType
            configpath = [...configpath, 'props']
            if(typeof t === 'string')configpath.push(t)
        }else if(r){
            configpath = [...configpath, 'relations']
            if(typeof r === 'string')configpath.push(r)
        }
        if(p){
            configpath = [...configpath, 'props']
            if(typeof p === 'string')configpath.push(p)
        }else if(g){
            configpath = [...configpath, 'groups']
            if(typeof g === 'string')configpath.push(g)
        }else if(l){
            configpath = [...configpath, 'labels']
            if(typeof l === 'string')configpath.push(l)
        }
    
        self.cPath = configpath
    
    }
    this.toStr = function(){return otos(self)}
    this.toSnapID = function(){//only for returning the base node !#$ !-$
        return otos({b:self.b,t:self.t,r:self.r,i:self.i})
    }
    this.toAddress = function(pval){
        return otos({b:self.b,t:self.t,r:self.r,i:self.i,p:pval})
    }
    this.toFlatPack = function(pval){
        let first = (!pval)?self.toNodeID():otos(self)
        let p = pval || self.p
        if(!p)throw new Error('Invalid flat pack')
        return first+String.fromCharCode(30)+p
    }
    this.toNodeID = function(){//in case there is other meta data on soul, and we just want the p stripped
        let copy = JSON.parse(JSON.stringify(self))
        delete copy.p
        delete copy['.']
        return otos(copy)
    }
    this.toLink = function(){
        return (LINK+otos({b:self.b,t:self.t,r:self.r,i:self.i}))
    }
    this.toSub = function(pval){
        pval = pval || self.p
        return (SUB+otos({b:self.b,t:self.t,r:self.r,i:self.i,p:pval}))
    }
    this.toConfigSoul = function(){
        //assumes path id passed is a valid config base: !, !#, !-, !#., !-.
        return otos(Object.assign({},self,{'%':true}))
    }
    this.toNameSpaceID = function(){
        return otos({b:self.b,'~':true})
    }
    this.toStateIndex = function(){
        return otos({b:self.b,t:self.t,r:self.r,'$':true,'}':true})
    }
    this.toLabelIndex = function(labelID,targetType){
        if(self.t){
            return otos({b:self.b,t:self.t,l:labelID,'}':true})
        }
        return otos({b:self.b,r:self.r,'>':labelID,'<':targetType,'}':true})
    }
    this.toDateIndex = function(created){
        let base = {b:self.b,t:self.t,':':true,'}':true}
        return otos(Object.assign(base,(created?{}:{p:self.p})))
    }

    this.newDataNodeID = function(id,unix_ms){//assumes you passed in all other symbols
        let i = (id !== undefined) ? id : rand(3)
        let t = unix_ms || Date.now()
        return otos({b:self.b,t:self.t,r:self.r,i:(i+'_'+t)})
    }
    this.newRelationID = function(src,trgt){
        return otos({b:self.b,t:self.t,r:self.r,i:(hash64(src+trgt))})
    }
}
function isSub(val){
    if(SUB_LOOKUP.test(val)){
        return snapID(val.slice(1))
    }
    return false
}
function isLink(val){
    if(typeof val === 'string'){
        if(LINK_LOOKUP.test(val)){
            return val.slice(1)
        }
        return false
    }
    return false
}
const notFound = String.fromCharCode(21)

function DataStore(rTxn,rwTxn){
    let store = this
    //xTxn accepts a nameSpace, returns object with methods get, put, commit, abort
    store.rTxn = rTxn
    store.rwTxn = rwTxn
    this.getProps = function(nodeID,cb,openTxn){
        let txn = openTxn || rTxn('dataStore')
        txn.get(nodeID,function(props){
            if(!openTxn)txn.commit()
            if(cb instanceof Function)cb(props)
        })
    }
    this.get = function (things,cb){
        let out = {}
        let now = Date.now()
        things = Object.entries(things)
        const txn = rTxn('dataStore')
        const tracker = {
            count:things.length,
            out: {},
            add: function(key,vase){
                let exp = vase.e || Infinity
                if(now<exp){
                    let [id,p] = snapID(key)//is flatpack
                    this.out[id][p] = vase
                }else{
                    store.removeExpired(key)
                }
               
                this.count--
                if(!this.count)this.done()
            },
            done:function(){
                txn.commit()
                if(cb instanceof Function)cb(this.out)
            }
        }
        for (const [id,pvals] of things) {
            out[id] = {}
            if(!pvals || (Array.isArray(pvals) && !pvals.length)) self.getProps(id,find(id),txn)
            else find(id)(pvals)
            
        }
        function find(nodeID){
            let ido = snapID(nodeID)
            return function(pvalArr){
                for (const prop of pvalArr) {
                    txn.get(ido.toFlatPack(prop),function(vase){
                        vase = vase || {v:notFound}//what to put for not found??
                        tracker.add(key,vase)
                    })
                }
            }
        }
    }
    this.getProp = function(nodeID,pval,cb){
        let txn = rTxn('dataStore')
        let key = snapID(nodeID).toFlatPack(pval)
        txn.get(key,function(vase){
            vase = vase || {v:notFound}//what to put for not found??
            txn.commit()
            if(cb instanceof Function)cb(vase)
        })
    }
    this.put = function(nodeID,putO,cb){ //assumes read already, so 'created' is handled outside of dbcall
        //puts = {soul:{[msgIDs]:[],putO:{gunPutObj(partial)}}
        let txn = rwTxn('dataStore')
        txn.get(nodeID,function(pvals){
            pvals = Array.isArray(pvals) ? pvals : [] 
            let ido = snapID(nodeID)
            for (const p in putO) {
                let vase = putO[p]
                let addrKey = ido.toFlatPack(p)
                if(vase !== null && !(vase.e && now>vase.e)){
                    if(!pvals.includes(p))pvals.push(p)
                    // we assumed to read the value outside the txn to know it changed and merge result
                    // if we do cascade, we might want to do that within this txn...                  
                    txn.put(addrKey,vase)
                }else{
                    store.removeExpired(addrKey)
                }
            }
            pvals.sort()//make lexical??
            txn.put(nodeID,pvals)
            txn.commit()
            if(cb instanceof Function)cb(true)

        })
    }
    this.removeExpired = function(addrKey){
        //seperate txn, so gets can be readonly
        let txn = rwTxn('dataStore')
        txn.get(addrKey,function(exists){
            if(exists !== null){
               remove() 
            }
        })
        function remove(){
            let [id,p] = snapID(addrKey)
            txn.get(id,function(pvals){
                txn.del(addrKey)
                removeFromArr(pvals,pvals.indexOf(p))
                txn.put(id,pvals)
            })
        }
    }
}

function GossipStore(rTxn,rwTxn){
    let store = this
    //xTxn accepts a nameSpace, returns object with methods get, put, commit, abort
    store.rTxn = rTxn
    store.rwTxn = rwTxn
    this.getProps = function(nodeID,cb,openTxn){
        let txn = openTxn || rTxn('dataStore')
        txn.get(nodeID,function(props){
            if(!openTxn)txn.commit()
            if(cb instanceof Function)cb(props)
        })
    }
    this.get = function (things,cb){
        let out = {}
        let now = Date.now()
        things = Object.entries(things)
        const txn = rTxn('dataStore')
        const tracker = {
            count:things.length,
            out: {},
            add: function(key,vase){
                let exp = vase.e || Infinity
                if(now<exp){
                    let [id,p] = snapID(key)//is flatpack
                    this.out[id][p] = vase
                }else{
                    store.removeExpired(key)
                }
               
                this.count--
                if(!this.count)this.done()
            },
            done:function(){
                txn.commit()
                if(cb instanceof Function)cb(this.out)
            }
        }
        for (const [id,pvals] of things) {
            out[id] = {}
            if(!pvals || (Array.isArray(pvals) && !pvals.length)) self.getProps(id,find(id),txn)
            else find(id)(pvals)
            
        }
        function find(nodeID){
            let ido = snapID(nodeID)
            return function(pvalArr){
                for (const prop of pvalArr) {
                    txn.get(ido.toFlatPack(prop),function(vase){
                        vase = vase || {v:notFound}//what to put for not found??
                        tracker.add(key,vase)
                    })
                }
            }
        }
    }
    this.getProp = function(nodeID,pval,cb){
        let txn = rTxn('dataStore')
        let key = snapID(nodeID).toFlatPack(pval)
        txn.get(key,function(vase){
            vase = vase || {v:notFound}//what to put for not found??
            txn.commit()
            if(cb instanceof Function)cb(vase)
        })
    }
    this.put = function(nodeID,putO,cb){ //assumes read already, so 'created' is handled outside of dbcall
        //puts = {soul:{[msgIDs]:[],putO:{gunPutObj(partial)}}
        let txn = rwTxn('dataStore')
        txn.get(nodeID,function(pvals){
            pvals = Array.isArray(pvals) ? pvals : [] 
            let ido = snapID(nodeID)
            for (const p in putO) {
                let vase = putO[p]
                let addrKey = ido.toFlatPack(p)
                if(vase !== null && !(vase.e && now>vase.e)){
                    if(!pvals.includes(p))pvals.push(p)
                    // we assumed to read the value outside the txn to know it changed and merge result
                    // if we do cascade, we might want to do that within this txn...                  
                    txn.put(addrKey,vase)
                }else{
                    store.removeExpired(addrKey)
                }
            }
            pvals.sort()//make lexical??
            txn.put(nodeID,pvals)
            txn.commit()
            if(cb instanceof Function)cb(true)

        })
    }
    this.removeExpired = function(addrKey){
        //seperate txn, so gets can be readonly
        let txn = rwTxn('dataStore')
        txn.get(addrKey,function(exists){
            if(exists !== null){
               remove() 
            }
        })
        function remove(){
            let [id,p] = snapID(addrKey)
            txn.get(id,function(pvals){
                txn.del(addrKey)
                removeFromArr(pvals,pvals.indexOf(p))
                txn.put(id,pvals)
            })
        }
    }
}


function signChallenge(root,peer){
    let challenge = peer.theirChallenge
    root.sign(challenge,function(sig){
        peer.theirChallenge = false
        if(peer.pub)root.on.pairwise(peer)
        let m = msgs.recv.challenge(challenge,sig)
        console.log(m)
        peer.send(m)
    })
}

function intToBuff(num,signed){
    let n = (num<0)?num*-1:num
    let byteLength = n==0?1:(signed && Math.ceil(Math.log(2*n)/Math.log(256))) || Math.ceil(Math.sqrt(Math.pow(n,.125)))
    let buff = Buffer.allocUnsafe(byteLength)
    let op = (signed)?'writeIntBE':'writeUIntBE'
    buff[op](num,0,byteLength)
    
    return buff

}

function buffToInt(buff,signed){
    let op = (signed)?'readIntBE':'readUIntBE'
    return buff[op](0,buff.length);
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

const allChars = Array.from({length:65535},(v,i)=>String.fromCharCode(i)).join('')
function rand(len, charSet,all){
    var s = '';
    len = len || 24;
    charSet = charSet || (all && allChars) || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz'
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
function quickHash(s){
    if(typeof s !== 'string'){ s = String(s) }
    let c = 0;
    if(!s.length){ return c }
    for(let i=0,l=s.length,n; i<l; ++i){
      n = s.charCodeAt(i);
      c = ((c<<5)-c)+n;
      c |= 0;
    }
    return c; // Math.abs(c);
}
function nodeHash(node){
    //node should be without the soul {key: value}
    //we do not include states in our hash
    let copy = JSON.parse(JSON.stringify(node))
    delete copy['_'] //if it has meta data remove it
    return quickHash(JSON.stringify(Object.entries(node).sort((a,b)=>{
        if (a[0] < b[0]) {
            return -1;
        }
        if (a[0] > b[0]) {
            return 1;
        }
        return 0;
    })))
}
function getBaseLog(x, y) {
    return Math.log(y) / Math.log(x);
}


//SET STUFF
function intersect(setA, setB) {
    var _intersection = new Set();
    for (var elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem);
        }
    }
    return _intersection
}
function union(setA, setB) {
    var _union = new Set(setA);
    for (var elem of setB) {
        _union.add(elem);
    }
    return _union;
}
function removeFromArr(arr,index){//mutates array to remove value, 7x faster than splice
    var stop = arr.length - 1;
    while (index < stop) {
        arr[index] = arr[++index];
    }

    arr.pop();
}

//SORT STUFF
function naturalCompare(a, b) {
    let ax = [], bx = [];
    a = String(a).trim().toUpperCase()  //trim and uppercase good idea?
    b = String(b).trim().toUpperCase()
    a.replace(/(\d+)|(\D+)/g, function(_, $1, $2) { ax.push([$1 || Infinity, $2 || ""]) });
    b.replace(/(\d+)|(\D+)/g, function(_, $1, $2) { bx.push([$1 || Infinity, $2 || ""]) });
    
    while(ax.length && bx.length) {
        let an = ax.shift();
        let bn = bx.shift();
        let nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
        if(nn) return nn;
    }

    return ax.length - bx.length;
}


//GUN WRAPPERS
const gunGet = (gun) => (soul,prop,cb)=>{
    //console.log('getting soul:',soul, 'prop:',prop)
    let get = (prop !== undefined && prop !== false) ? {'#':soul,'.':prop} : {'#':soul}
    gun._.on('out', {
        get,
        '#': gun._.ask(function(msg){
            let val = (prop !== undefined && prop !== false) ? msg.put && msg.put[soul] && msg.put[soul][prop] : msg.put && msg.put[soul]
            if(prop !== undefined && prop !== false && val !== null && typeof val === 'object' && val['#'] !== undefined){
                //console.log('getting lookup val')
                gunGet(gun)(val['#'],false,cb)
            }else{
                cb(val)

            }
        })
    })
}
const gunPut = (gun) => (soul,putO)=>{
    let ham = {}
    let n = Date.now()
    for (const key in putO) {
        ham[key] = n
    }
    putO['_'] = {'#':soul,'>':ham}
        
    gun._.on('out', {
        put: {[soul]:putO}
    })
}

function getLength(gun,soul,cb){//direct to super peer(s??)
    gun._.on('out', {
        getLength: soul,
        '#': gun._.ask(function(msg){
            cb(msg.length)
        })
    })
}

const soulSchema = {//OUTDATED!
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



export {
    gunGet,
    gunPut,
    configPathFromChainPath,
    findID,
    gbForUI,
    gbByAlias,
    setValue,
    getValue,
    convertValueToType,
    tsvJSONgb,
    allUsedIn,
    removeFromArr,
    getAllActiveProps,
    buildPermObj,
    rand,
    putData,
    ALL_INSTANCE_NODES,
    DATA_INSTANCE_NODE,
    RELATION_INSTANCE_NODE,
    DATA_ADDRESS,
    RELATION_ADDRESS,
    ISO_DATE_PATTERN,
    newID,
    hash64,
    SUB,
    INSTANCE_OR_ADDRESS,
    IS_CONFIG_SOUL,
    isSub,
    isLink,
    lookupID,
    getAllActiveNodeTypes,
    getAllActiveRelations,
    collectPropIDs,
    intersect,
    union,
    IS_STATE_INDEX,
    ALL_TYPE_PATHS,
    naturalCompare,
    IS_CONFIG,
    grabThingPropPaths,
    NON_INSTANCE_PATH,
    ALL_ADDRESSES,
    grabAllIDs,
    StringCMD,
    BASE,
    CONFIG_SOUL,
    TIME_INDEX_PROP,
    throwError,
    mergeObj,
    getLength,
    nodeHash,
    on,
    encTime,
    decTime,
    snapID,
    signChallenge,
    notFound,
    MathSolver,
    findTruth,
    getBaseLog,
    DataStore,
    GossipStore,
    intToBuff,
    buffToInt
}