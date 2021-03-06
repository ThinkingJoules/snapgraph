//REGEX STUFF
const regOr = (regArr) =>{
    let cur = ''
    for (const r of regArr) {
        cur += '(?:'+r.toString().slice(1,-2)+')' + '|'
    }
    cur = cur.slice(0,-1) //remove trailing '|'
    cur = '/'+cur+'/i'
    return eval(cur)
}
//soul regex
const TYPE_INDEX = /^![a-z0-9]+$/i
const BASE_CONFIG =/^![a-z0-9]+%$/i
const NODE_STATE = /^![a-z0-9]+#[a-z0-9]+\$$/i
const RELATION_STATE = /^![a-z0-9]+-[a-z0-9]+\$$/i
const BASE = /^![a-z0-9]+$/i
const NODE_TYPE = /^![a-z0-9]+#[a-z0-9]+$/i
const RELATION_TYPE = /^![a-z0-9]+-[a-z0-9]+$/i
const GROUP_TYPE = /^![a-z0-9]+\^[a-z0-9]+$/i
const LABEL_INDEX = /^![a-z0-9]+&$/i
const LABEL_TYPE = /^![a-z0-9]+&[a-z0-9]+$/i
const TYPE_CONFIG = /^![a-z0-9]+#[a-z0-9]+%$/i
const RELATION_CONFIG =/^![a-z0-9]+-[a-z0-9]+%$/i
const PROP_CONFIG = /^![a-z0-9]+(?:#|-)[a-z0-9]+.[a-z0-9]+%$/i
const TYPE_PROP_INDEX = /^![a-z0-9]+#[a-z0-9]+$/i
const RELATION_PROP_INDEX = /^![a-z0-9]+-[a-z0-9]+$/i
const PROP_TYPE = /^![a-z0-9]+(?:#|-)[a-z0-9]+.[a-z0-9]+$/i

const DATA_INSTANCE_NODE = /^![a-z0-9]+#[a-z0-9]+\$[a-z0-9_]+/i
const RELATION_INSTANCE_NODE = /^![a-z0-9]+-[a-z0-9]+\$[a-z0-9_]+/i
const DATA_ADDRESS = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/i
const RELATION_ADDRESS = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/i
const TIME_DATA_ADDRESS = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+:/i
const TIME_RELATION_ADDRESS = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+:/i

const TIME_INDEX_PROP = regOr([TIME_DATA_ADDRESS,TIME_RELATION_ADDRESS])
const IS_STATE_INDEX = regOr([NODE_STATE,RELATION_STATE])
const INSTANCE_OR_ADDRESS = regOr([DATA_INSTANCE_NODE,RELATION_INSTANCE_NODE,DATA_ADDRESS,RELATION_ADDRESS])
const NON_INSTANCE_PATH = regOr([BASE,NODE_TYPE,RELATION_TYPE,PROP_TYPE])
const ALL_ADDRESSES = regOr([DATA_ADDRESS,RELATION_ADDRESS])
const ALL_TYPE_PATHS = regOr([NODE_TYPE,RELATION_TYPE,LABEL_TYPE])
const ALL_INSTANCE_NODES = regOr([DATA_INSTANCE_NODE,RELATION_INSTANCE_NODE])
const ALL_CONFIGS = {
    typeIndex: TYPE_INDEX,
    baseConfig: BASE_CONFIG,
    propIndex: regOr([TYPE_PROP_INDEX,RELATION_PROP_INDEX]),
    thingConfig: regOr([TYPE_CONFIG,RELATION_CONFIG]),
    propConfig: PROP_CONFIG,
    label: LABEL_TYPE,
    labelIndex: LABEL_INDEX
}
const IS_CONFIG = (soul) =>{
    let is = false
    for (const soulType in ALL_CONFIGS) {
        const r = ALL_CONFIGS[soulType];
        if(is = r.test(soul))return soulType
    }
    return is
}
const IS_CONFIG_SOUL = regOr([BASE_CONFIG,TYPE_INDEX,LABEL_TYPE,TYPE_CONFIG,RELATION_CONFIG,PROP_CONFIG,TYPE_PROP_INDEX,RELATION_PROP_INDEX,LABEL_INDEX])
const CONFIG_SOUL = regOr([BASE_CONFIG,LABEL_TYPE,TYPE_CONFIG,RELATION_CONFIG,PROP_CONFIG])

//other regex
const ISO_DATE_PATTERN = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+Z/
const ENQ_LOOKUP = /^\u{5}![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+/iu
const USER_ENQ = /\$\{(![a-z0-9]+(?:#|-)[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+)\}/i
const LABEL_ID = /\d+l[a-z0-9]+/i
const NULL_HASH = hash64(JSON.stringify(null))
const ENQ = String.fromCharCode(5) //enquiry NP char. Using for an escape to say the value that follow is the node to find this prop on


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

//soul creators
function configSoulFromChainPath(thisPath){
    //should just need to append % to end if they are in right order..
    //should parse, then make soul to be safe
    //assumes path is a valid config base: !, !#, !-, !#., !-.
    let parse = parseSoul(thisPath)
    Object.assign(parse,{'%':true})
    let soul = makeSoul(parse)
    return soul

}
function stateIdxSoulFromChainPath(thisPath){

}
function labelIdxSoulFromChainPath(thisPath){

}
function dateIdxSoulFromChainPath(thisPath){

}
function createdIdxSoulFromChainPath(thisPath){

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
    let IDobj = parseSoul(nodeID) 
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
    let {b,t,r,i} = IDobj
    let isNode = !r
    let {props,externalID} = getValue(configPathFromChainPath(nodeID),gb)
    let {relations,labels} = getValue(configPathFromChainPath(makeSoul({b})),gb) || {}
    let refChanges = [], setState = false //contains what user requested in putObj
    let err
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
                    if(isEnq(raw) && inherit === 'exact'){
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

            for (const pval in putObj) {
                let {dataType} = props[pval]
                const val = putObj[pval];
                let curR = existingRaw[pval]//always undefined if isNew
                let enqV = existingValues[pval]
                
                if(isEnq(val)){//making new val an enq (or changing it)
                    let childAddress = val.slice(1)
                    let thisAddr = toAddress(nodeID,pval)
                    if(isEnq(curR)){
                        let removeAddress = curR.slice(1)
                        changeEnq(false,thisAddr,removeAddress,pval)
                    }
                    changeEnq(true,thisAddr,childAddress,pval)
                }
                
                if(isEnq(curR) && dataType === 'unorderedSet' && !isEnq(val)){
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
            if(dataType === 'array'){
                try {
                    cVal = JSON.parse(cVal)//convert value will stringify arrays so they are gun ready 
                } catch (error) {}
            }
            if(isEnq(cVal) && !enforceUnique && externalID !== pval){//cannot inherit values on unique properties
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
                        console.warn(`To add a new label: gbase.base('${b}').addLabel('${label}')`)
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
        if(!DATA_ADDRESS.test(parentAddr) && !isEnq(parentAddr)){
            let e = 'Invalid parent ID referenced for an inheritance'
            err = throwError(cb,e)
            return
        }
        if(!DATA_ADDRESS.test(childAddr) && !isEnq(childAddr)){
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
    if(isEnq(value))return value//this is a lookup value, just return it.
    if(USER_ENQ.test(value)){//convert user specified enq '${!#.$}' to gbase Enq
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


//SOUL STUFF
const SOUL_ALIAS = {'!':'b','#':'t','-':'r','$':'i','.':'p','^':'g','&':'l'}//makes it easier to type out...
const SOUL_SYM_ORDER = '!#-><.$&^*|%[;@:/?' // "," is used internally for splitting souls, _ is reserved for simple splits in ids
function makeSoul(argObj){
    let length = {'!':10,'#':6,'-':6,'$':10,'.':6,'^':5,'&':7}
    let soul = ''
    for (const sym of SOUL_SYM_ORDER) {
        let val = argObj[sym] || argObj[SOUL_ALIAS[sym]]
        if(val !== undefined){
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
        let args = soul.slice(last+1,toIdx) || true 
        out[s] = args
        if(al)out[al] = args //put both names in output?
    }
    return out
}
function toAddress(node,p){
    if(ALL_ADDRESSES.test(node))return node
    return makeSoul(Object.assign(parseSoul(node),{p}))
}
function removeP(address){//address > nodeID
    let idObj = parseSoul(address)
    let pval = idObj.p
    delete idObj.p
    delete idObj['.']
    return [makeSoul(idObj),pval]
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
        soul = toAddress(nodeOrAddress,p)
    }else if(USER_ENQ.test(nodeOrAddress)){
        soul = nodeOrAddress.match(USER_ENQ)[1]
    }
    if(!ALL_ADDRESSES.test(soul))throw new Error('Must specify a full address for a substitute.')
    return ENQ+soul
}
function newDataNodeID(id,unix_ms){
    let i = (id !== undefined) ? id : rand(3)
    let t = unix_ms || Date.now()
    return i+'_'+t
}
function newRelationID(src,trgt){
    return hash64(src+trgt)
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



module.exports = {
    gunGet,
    gunPut,
    configPathFromChainPath,
    configSoulFromChainPath,
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
    makeSoul,
    parseSoul,
    putData,
    ALL_INSTANCE_NODES,
    DATA_INSTANCE_NODE,
    RELATION_INSTANCE_NODE,
    DATA_ADDRESS,
    RELATION_ADDRESS,
    ISO_DATE_PATTERN,
    NULL_HASH,
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
    intersect,
    union,
    findConfigFromID,
    IS_STATE_INDEX,
    removeP,
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
    throwError
}