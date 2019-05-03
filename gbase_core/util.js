//GBASE UTIL FUNCTIONS
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
    //valid paths: !, !#, !-, !#.$, !-.$
    if((thisPath.includes('.') && !thisPath.includes('$')))throw new Error('Must specify a row to get this prop')
    let pathArgs = parseSoul(thisPath)
    let order = ['b','t','tr','r','p']//put r before p
    let depth = []
    for (const arg of order) {
        let hasID = pathArgs[arg]
        if(hasID){
            if(arg === 't'){
                depth.push('nodeTypes')
                depth.push(hasID)
            }else if(arg === 'tr'){
                depth.push('relations')
                depth.push(hasID)
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
    let {b,t,tr,p,g} = parseSoul(thisPath)
    let configpath = [b]
    if(thisPath.includes('#')){//nodeType
        configpath = [...configpath, 'props',t]
    }else if(thisPath.includes('-')){
        configpath = [...configpath, 'relations',tr]
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
    let first = name[0]
    let rest = name.slice(1)
    let out = false
    if(first === 'p' && !isNaN(rest *1)){//if name is a pval just return the name
        return name
    }
    for (const key of Object.keys(obj)) {
        const alias = obj[key].alias;
        if(alias === name){
            out = key
            break
        }
    }
    if(out){
        return out
    }else{
        let err = 'Cannot find column with name: '+ pval
        throw new Error(err)
    }
}
const findRowID = (obj, name) =>{//obj is .rows, input human name, returns rowID
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const alias = String(obj[key])
            if(alias === name){
                return key
            }
        }
    }
    return false
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
const findRowAlias = (gb, rowID) =>{//obj is .rows, input human name, returns rowID
    let [base, tval] = rowID.split('/')
    let obj = getValue([base, 'props',tval,'rows'],gb)
    return obj[rowID]
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
const linkColPvals = (gb,base,tval)=>{
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
function getRowPropFromCache(propertyPath, obj){
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

function checkNewRow(gb, path, putObj){
    let [base,tval,rval,li,lir] = path.split('/')
    let propsPath
    if(li === 'li'){//li table
        propsPath = [base,'props',tval,'li']
    }else{//top level table
        propsPath = [base,'props',tval]
    }
    let {props} = getValue(propsPath, gb)
    let out = {}
    for (const pval in props) {
        const {alias,required, defaultval, GBtype} = props[pval];
        let input = putObj[pval]
        if(input === undefined && required && defaultval === null){
            throw new Error('Required field missing: '+ alias)
        }
        if(input === undefined && defaultval !== null){
            out[pval] = defaultval
        }else{
            out[pval] = input
        }
    }
    return putObj
}

const validateStaticData = (gb,editThisPath, putObj, newRow, fromCascade)=>{//prunes specials
    let [base,tval] = editThisPath.split('/')
    let output = {}
    if(newRow){
        putObj = checkNewRow(putObj)
    }
    for (const pval in putObj) {
        let value = putObj[pval]
        let {GBtype, alias} = getValue([base,'props', tval, 'props', pval], gb)
        if(GBtype === undefined){
            let err = 'Cannot find data type for column: '+ alias +' ['+ pval+'].'
            throw new Error(err)
        }
        let specials = ["prev", "next", "association", "tag", "function"]
        if((typeof value === GBtype && !specials.includes(GBtype)) || fromCascade){//fromCascade will always write regardless of GBtype
            output[pval] = value
        }else if(typeof value !== GBtype && !specials.includes(GBtype)){
            let err = 'typeof '+ value + ' is not of type '+ GBtype
            throw new Error(err)
        }
    }
    return output
}
const validateInteractionData =(gb,editThisPath, putObj, newRow, fromCascade)=>{//prunes specials
    let [base,tval] = editThisPath.split('/')
    let output = {}
    if(newRow){
        putObj = checkNewRow(putObj)
    }
    for (const pval in putObj) {
        let value = putObj[pval]
        let {GBtype, alias} = getValue([base,'props', tval, 'props', pval], gb)
        if(GBtype === undefined){
            let err = 'Cannot find data type for column: '+ alias +' ['+ pval+'].'
            throw new Error(err)
        }
        let specials = ["association"]
        if((typeof value === GBtype && !specials.includes(GBtype)) || fromCascade || newRow){//fromCascade will always write regardless of GBtype
            output[pval] = value
        }else if(typeof value !== GBtype && !specials.includes(GBtype)){
            let err = 'typeof '+ value + ' is not of type '+ GBtype
            throw new Error(err)
        }
    }
    return output
}
const validateLIData =(gb,editThisPath, putObj, newRow, fromCascade)=>{//prunes specials
    let [base,tval,rval,li,lirid] = editThisPath.split('/')
    let output = {}
    if(newRow){
        putObj = checkNewRow(putObj)
    }
    for (const pval in putObj) {
        let value = putObj[pval]
        let {GBtype, alias} = getValue([base,'props', tval, 'li', 'props', pval], gb)
        if(GBtype === undefined){
            let err = 'Cannot find data type for column: '+ alias +' ['+ pval+'].'
            throw new Error(err)
        }
        let specials = ["association","context","contextLink","result"] //needs to be edited in special API
        if((typeof value === GBtype && !specials.includes(GBtype)) || fromCascade || newRow){//fromCascade will always write regardless of GBtype
            output[pval] = value
        }else if(typeof value !== GBtype && !specials.includes(GBtype)){
            let err = 'typeof '+ value + ' is not of type '+ GBtype
            throw new Error(err)
        }
    }
    return output
}
const handleRowEditUndo = (gun, gb, gbpath, editObj)=>{
    //gbpath should = base/tval/rowid
    //editObj = {p0: 'value, p4: 'other value', etc..}
    let [baseID,tval,r] = gbpath.split('/')
    let tstamp = Date.now()
    let undo = {}
    undo._path = gbpath
    undo.put = editObj
    let entry = {[tstamp]: undo}
    let curhist = getValue([arrpath[0], 'history'], gb)
    let fullList = (curhist) ? Object.assign({},curhist,entry) : entry
    let lenCheck = Object.keys(fullList)
    if(lenCheck.length > 100){
        delete fullList[lenCheck[0]]
    }
    gun.get(baseID + '/state').get('history').put(JSON.stringify(fullList))
    //node undo
    gun.get(gbpath + '/history').get(tstamp).put(JSON.stringify(undo.put))   
}
const checkUniqueAlias = (gb,pathArr, alias)=>{
    let configPath = pathArr.slice()
    let endPath = configPath.pop()//go up one level
    let things = getValue(configPath, gb)
    if(pathArr.length === 1){
        return true //base alias, those are not unique
    }
    if(things !== undefined){
        if(endPath[0] === 'p'){//base/table/col
            for (const gbval in things) {
                const configObj = things[gbval];
                if (configObj && configObj.alias && configObj.alias === alias && gbval !== endPath) {
                    let errmsg = 'Matching Alias found at: '+ gbval
                    throw new Error(errmsg)
                }
            }
        }else{//row
            for (const gbval in things) {
                const rowAlias = things[gbval];
                if (rowAlias && rowAlias === alias && gbval !== endPath) {
                    let errmsg = 'Matching Alias found at: '+ gbval
                    throw new Error(errmsg)
                }
            }
        }
        return true
    }else{
        let errmsg = 'Cannot find config data at path: ' + configPath
        throw new Error(errmsg)
    }
}
const checkAliasName = (nextVal, alias)=>{
    let pOrT = nextVal[0]
    let newVal = nextVal.slice(1)*1
    let first = alias[0]
    let rest = alias.slice(1)*1
    if(first === pOrT && !isNaN(rest) && rest !== newVal){
        throw new Error('Alias specified will conflict with internal id')
    }
}
const checkUniqueSortval = (gb,pathArr, sortval)=>{
    let configPath = pathArr.slice()
    let endPath = configPath.pop()//go up one level
    let things = getValue(configPath, gb)
    if(pathArr.length === 1){
        return true //base alias, those are not unique
    }
    if(things !== undefined){
        if(endPath[0] !== 'r'){//base/table/col
            for (const gbval in things) {
                const configObj = things[gbval];
                if (configObj && configObj.sortval && configObj.sortval === sortval && gbval !== endPath) {
                    let err = 'Matching sortval found at: '+ gbval
                    throw new Error(err)
                }
            }
        }else{//row
            //no sort on row
        }
        return true
    }else{
        let err = 'Cannot find config data at path: '+ configPath
        throw new Error(err)
    }
}
const findNextID = (gb,path)=>{
    let curIDsPath = configPathFromChainPath(path)
    curIDsPath.push('props')
    let curIDs = getValue(curIDsPath, gb)
    if(curIDs !== undefined){
        let tOrP = Object.keys(curIDs)[0][0]
        let ids = Object.keys(curIDs).map(id=>id.slice(1)*1)
        let nextid = tOrP + (Math.max(...ids)+1)
        return nextid
    }else{
        if(curIDsPath.length === 2){
            return 't0'
        }else{
            return 'p0'
        }
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
function convertValueToType(gb, value, newType, rowAlias){
    let out
    let aliasConvert = []
    if(Array.isArray(value)){//convert links to string
        for (let i = 0; i < value.length; i++) {
            const rowid = value[i];
            let[base,tval,r] = rowid.split('/')
            aliasConvert.push(getValue([base,'props',tval,'rows', rowid], gb))
        }
        value = aliasConvert.join(', ')
    }
    if(newType === 'string'){
        out = String(value)
    }else if(newType === 'number'){
        let num = value*1
        if(isNaN(num)){
            let err = 'Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to a number. Fix and try again'
            throw new Error(err)
        }else{
            out = num
        }
    }else if(newType === 'boolean'){
        value = String(value)
        let falsy = ['','0','false','null','undefined',""]
        let truthy = ['1','true','Infinity']
        if(falsy.includes(value)){//falsy strings
            out = false
        }else if (truthy.includes(value)){//truthy strings
            out = true
        }else{
            let err = 'Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to boolean. enter true or false or 0 for false or 1 for true'
            throw new Error(err)
        }
    }else{
        throw new Error('Can only attempt to conver value to "string", "number", or "boolean" using this function')
    }
    return out
}
const isMulti = (gb,colStr,toLi)=>{
    let cpath = configPathFromChainPath(colStr)
    let config = getValue(cpath,gb) || {}
    let [b,t,li] = colStr.split('/')
    if(toLi && li !== 'li'){
        return true
    }
    if((config.linkMultiple && (config.GBtype === 'prev' || config.GBtype === 'next')) || (config.associateMultiple && config.GBtype === 'association')){
        return true
    }
    return false
}
const getPropType = (gb,propPath)=>{
    let cpath = configPathFromChainPath(propPath)
    let {propType,dataType} = getValue(cpath,gb) || {}
    if(propType !== undefined && dataType !== undefined){
        return [propType,dataType]
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
        let valType = value*1 || value.toString() //if it is number, make it a number, else string
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
function findLinkingCol(gb, fromPath, usedInPath){
    let [base,tval,r,li] = fromPath.split('/')
    let [ubase,utval,...unknown] = usedInPath.split('/')
    let uli,upval
    if(unknown[0] === 'li'){//usedIn LI col
        [uli,upval] = unknown
    }else{
        upval = unknown[0]
    }
    if(uli && !li){
        throw new Error('list items can not reference anything outside of other li')
    }
    if(uli && li){//local li fn's
        if(tval === utval){//local link, type should be 'function'
            let {GBtype,usedIn, fn} = getValue([base,'props',tval,'li','props',upval], gb)
            let res = [upval,{GBtype, fn, usedIn}]
            return res
        }else{
            throw new Error('Cannot get non-local links on list items')
        }
    }else if(li && !uli){//transaction referencing li (like completed)
        if(tval === utval){//local link, type should be 'function'
            let {GBtype,usedIn, fn} = getValue([base,'props',tval,'props',upval], gb)
            let res = [upval,{GBtype, fn, usedIn}]
            return res
        }else{
            throw new Error('Can only get non list item links from same transaction table')
        }
    }else{//li not involved
        let fn = getValue([ubase,'props',utval,'props',upval, 'fn'], gb)
        if(tval === utval){//local link, type should be 'function'
            let {GBtype,usedIn} = getValue([base,'props',tval,'props',upval], gb)
            let res = [upval,{GBtype, fn, usedIn}]
            return res
        }else{
            let cols = getValue([base,'props',tval,'props'], gb)
            let res = []
            for (const p in cols) {
                const {GBtype,linksTo,linkMultiple} = cols[p];
                //console.log(GBtype, linksTo)
                if(['prev','next'].includes(GBtype)){
                    let [tbase,ttval] = linksTo.split('/')
                    //console.log(ttval, utval)
                    if(ttval === utval){
                        res.push(p)
                        res.push({GBtype,linksTo,linkMultiple,fn})
                        return res
                    }
                }
            }
        }
    }
}
function findAssociatedCol(gb, fromPath, toPath){
    let [base,tval] = fromPath.split('/')
    let [ubase,utval] = toPath.split('/')
    let toCols = getValue([ubase,'props',utval,'props'], gb)
    let res = []
    for (const p in toCols) {
        const {GBtype, associatedWith, associateMultiple} = toCols[p];
        //console.log(GBtype, linksTo)
        if(GBtype === 'association'){
            let [tbase,ttval,fromp] = associatedWith.split('/')
            //console.log(ttval, utval)
            if(tbase === base && ttval === tval){
                res.push(fromp)
                res.push(p)
                res.push(associateMultiple)
                return res
            }
        }
    }
    throw new Error('Could not find an associated table for paths provided. You must use "associateTables()" before you can associate rows')
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
function getAllColumns(gb, tpath,bySortval){
    let [base,tval] = tpath.split('/')
    let tPath = [base,tval].join('/')
    let cpath = configPathFromChainPath(tPath)
    let {props} = getValue(cpath, gb)
    let out = []
    if(!bySortval){
        for (const p in props) {
            const config = props[p];
            let idx = p.slice(1)
            if (!config.archived && !config.deleted) {
                out[idx] = p
            }else{
                out[idx] = null //need to prevent empty indices
            }
        }
        return out.sort((a,b)=>a.slice(1)-b.slice(1))
    }else{
        let svals = {}
        for (const p in props) {
            const config = props[p];
            if (!config.archived && !config.deleted) {
                svals[config.sortval] = p
            }else{
                //don't include
            }
        }
        let order = Object.keys(svals).sort((a,b)=>a-b)
        for (const sv of order) {
            out.push(svals[sv])
        }
        return out
    }
    
}

function handleStaticDataEdit(gun, gb, cascade, timeLog, timeIndex, path, newRow, newAlias, fromCascade, editObj, cb){
    newRow = (newRow) ? true : false
    let [base,tval] = path.split('/')
    let validatedObj = validateStaticData(gb,path,editObj,newRow,fromCascade) //strip prev, next, tags, fn keys, check typeof on rest
    //console.log(validatedObj)
    let timeIndices = {}
    for (const key in validatedObj) {
        let colSoul = base + '/' + tval + '/' + key
        const value = validatedObj[key];

        let {GBtype} = getValue([base,'props',tval,'props',key],gb)
        if(GBtype === 'date'){
            timeIndices[[base,tval,key].join('/')] = [path, value]
        }

        if(key !== 'p0'){//put non-row name changes
            gun.get(colSoul).get(path).put(value)
            setTimeout(cascade,Math.floor(Math.random() * 500) + 250,path,key) //waits 250-500ms for gun call to settle, then fires cascade
            timeIndex([base,tval,'edited'].join('/'), path, new Date())
        }else if(key === 'p0' && !newRow){
            //check uniqueness
            let rowpath = configPathFromChainPath(path)
            checkUniqueAlias(gb,rowpath,value)
            gun.get(path).get('p0').put(value)
            gun.get(colSoul).get(path).put(value)
        }else if(newRow && newAlias){
            let rowpath = configPathFromChainPath(path)
            let existsSoul = [base,tval].join('/')
            checkUniqueAlias(gb,rowpath,newAlias)
            gun.get(path).get('p0').put(newAlias)
            gun.get(colSoul).get(path).put(newAlias)
            gun.get(existsSoul).get(path).put(true)
            timeIndex([base,tval,'created'].join('/'), path, new Date())
            timeIndex([base,tval,'edited'].join('/'), path, new Date())
        }else{
            throw new Error('Must specifiy at least a row alias for a new row.')
        }      
    }

    for (const key in timeIndices) {
        const [rowID, dateString] = timeIndices[key];
        let date = new Date(dateString)
        if(date.toString() === 'Invalid Date'){
            throw new Error ('Cannot understand the date string in value, data saved, but cannot be indexed, try saving again with a valid date string (hh:mm:ss is optional): "mm/dd/yyyy, hh:mm:ss"')
        }
        timeIndex(key,rowID,date)
    }
    cb.call(this, false, path)

    timeLog(path,validatedObj)
}
function handleInteractionDataEdit(gun, gb, cascade, timeLog, timeIndex, getCell, path, newRow, fromCascade, editObj, cb){
    //soul = path
    try{
        let validatedObj
        if(newRow || fromCascade){
            validatedObj = editObj
        }else{
            validatedObj = validateInteractionData(gb,path,editObj,newRow,fromCascade) //strip prev, next, tags, fn keys, check typeof on rest        
        }

        if(!Object.values(validatedObj).length){
            throw new Error('Must specify at least one (non-special) property.')
        }
        let timeIndices = {}
        let assoc = []
        let [base,tval] = path.split('/')
        let toGun = {}
        for (const key in validatedObj) {
            const value = validatedObj[key];
            let {GBtype} = getValue([base,'props',tval,'props',key],gb)
            if(GBtype === 'date'){
                timeIndices[[base,tval,key].join('/')] = [path, value]
            }
            if(GBtype === 'association' && newRow){
                if(Array.isArray(value)){
                    assoc = assoc.concat(value)
                }else if(value.length){
                    assoc.push(value)
                }
                continue
            }else if (GBtype === 'association'){
                continue
            }

            toGun[key] = value
        }
        for (let i = 0; i < assoc.length; i++) {
            const toPath = assoc[i];
            addAssociation(gun,gb,getCell,path,toPath,cb)
        }
        for (const key in timeIndices) {
            const [rowID, dateString] = timeIndices[key];
            let date = new Date(dateString)
            if(date.toString() === 'Invalid Date'){
                throw new Error ('Cannot understand the date string in value, data saved, but cannot be indexed, try saving again with a valid date string (hh:mm:ss is optional): "mm/dd/yyy, hh:mm:ss"')
            }
            timeIndex(key,rowID,date)
        }
        for (const key in toGun) {
            const value = toGun[key];
            gun.get(path).get(key).put(value)
            setTimeout(cascade,Math.floor(Math.random() * 500) + 250,path,key) //waits 250-500ms for gun call to settle, then fires cascade
        }
        cb.call(this, false, path)
        timeIndex([base,tval,'edited'].join('/'), path, new Date())
        timeLog(path,validatedObj)
        if(newRow){
            let existsSoul = [base,tval].join('/')
            gun.get(existsSoul).get(path).put(true)
            timeIndex([base,tval,'created'].join('/'), path, new Date())
        }
    }catch(e){
        console.log(e)
        cb.call(this,e)
    }
}
function handleLIDataEdit(gun, gb, cascade, timeLog, timeIndex, path, newRow, fromCascade, editObj, cb){
    //soul = path
    try{
        let validatedObj
        if(newRow){
            validatedObj = checkNewRow(gb,path,editObj)
        }else{
            validatedObj = validateLIData(gb,path,editObj,newRow,fromCascade) //strip illegal keys
        }

        if(!Object.values(validatedObj).length){
            throw new Error('Must specify at least one (non-association) property.')
        }
        let ctx
        let sctx
        let [base,tval,r,li,lir] = path.split('/')
        let liSoul = [base,tval,r,'li'].join('/')
        let toGun = {}
        for (const key in validatedObj) {
            const value = validatedObj[key];
            let {GBtype} = getValue([base,'props',tval,'li','props',key],gb)
            if(GBtype === 'context' && newRow){
                ctx = value
                continue
            }else if(GBtype === 'subContext' && newRow){
                sctx = value
                continue
            }else if(["context","subContext","result","contextData"].includes(GBtype)){
                continue
            }else if(typeof value !== GBtype){
                throw new Error(value + ' expected to be type: '+ GBtype)
            }
            toGun[key] = value
        }
        if(ctx){
            addContext(gun,gb,cascade,path,ctx,sctx)
        }
        for (const key in toGun) {
            const value = toGun[key];
            gun.get(path).get(key).put(value)
            setTimeout(cascade,Math.floor(Math.random() * 500) + 250,path,key) //waits 250-500ms for gun call to settle, then fires cascade
        }
        if(newRow){
            gun.get(liSoul).get(path).put(true)
            timeIndex(liSoul, path, new Date())
        }
        cb.call(this, false, path)
        timeLog(path,validatedObj)
        timeLog([base,tval,r].join('/'), {[liSoul]: true}) //need for transactions so we know if one was removed since last checkpoint
    }catch(e){
        console.log(e)
        cb.call(this,e)
    }
}
function addContext(gun,gb,cascade,lirPath, contextPath, subContext){
    //newLI: from should base/tval/rval/li to should be cbase/ctval/crowid (ctval must match context tval)
    let root = gun.back(-1)
    let [base,tval,r,li,lir] = lirPath.split('/')
    let [cbase,ctval,cr] = contextPath.split('/')
    let subRequired = false, subCcol

    let {context} = getValue([base,'props',tval], gb)
    let [sbase,stval] = context.split('/')
    if(cbase !== sbase || ctval !== stval){
        throw new Error('You cannot associate a list item with a different table than what is specified in "context"')
    }
    let neededCols = []
    let lirObj = {}
    let licols = getValue([base,'props',tval,'li','props'], gb)
    for (const liPval in licols) {
        const {GBtype, fn} = licols[liPval];//repurposed fn config for context columns
        if(GBtype === 'contextData'){
            lirObj[liPval] = fn
        }else if(GBtype === 'subContext'){
            subRequired = true
            subCcol = liPval
            lirObj[liPval] = fn // should be 'pn' and must be linkCol(that was already checked on the way in.)
        }
    }

    if(subRequired && subContext){
        //check to make sure subContext matches what is available on this context node
        let [subbase,subtval,subr] = subContext.split('/')
        let cCols = getValue([cbase,'props',ctval,'props'],gb)
        let cpval
        for (const p in cCols) {
            const {GBtype, linksTo} = cCols[p];
            let [testbase,testtval] = linksTo.split('/')
            if(GBtype === 'prev' && testbase === subbase && testtval === subtval){
                cpval = p
            }
        }
        if(!cpval){throw new Error('Could not find sub-context linking column to the context')}
        let ctxSoul = [cbase,ctval,cr,'links',cpval].join('/')
        root.get(ctxSoul).get(function(msg, ev) {
            var links = msg.put
            ev.off()
            let valid = []
            for (const link in links) {
                if(link === '_'){
                    continue
                }
                const value = links[link];
                if (value) {
                    valid.push(link)
                }
            }
            if(valid.includes(subContext)){
                retrieveUtil(gun,gb,contextPath,Object.values(lirObj),function(ctxObj){//get ctxObj with pvals
                    let ctxStore = [base,tval,r,'context'].join('/')
                    root.get(ctxStore).get(contextPath).put(JSON.stringify(ctxObj))//snapshot values at time of creation
                    for (const lip in lirObj) {
                        const ctxPval = lirObj[lip];
                        if(subCcol === lip){
                            lirObj[lip] = subContext
                        }else{
                            lirObj[lip] = ctxObj[ctxPval]
                        }
                        
                    }
                    for (const key in lirObj) {
                        const value = lirObj[key];
                        root.get(lirPath).get(key).put(value)
                        setTimeout(cascade,Math.floor(Math.random() * 500) + 250,path,key) //waits 250-500ms for gun call to settle, then fires cascade
                    }
                })
            }else{
                throw new Error('Invalid Sub-Context link')
            }

        })
    }else if(subRequired && !subContext){
        throw new Error('Must specify a sub-context in order to create a list item so the transaction can be performed')
    }else if(!subRequired){
        //just need ctx
        retrieveUtil(gun,gb,contextPath,Object.values(lirObj),function(ctxObj){
            let ctxStore = [base,tval,r,'context'].join('/')
            root.get(ctxStore).get(contextPath).put(JSON.stringify(ctxObj))//snapshot values at time of creation
            for (const lip in lirObj) {
                const ctxPval = lirObj[lip];
                root.get(lirPath).get(lip).put(ctxObj[ctxPval])
                setTimeout(cascade,Math.floor(Math.random() * 500) + 250,path,key) //waits 250-500ms for gun call to settle, then fires cascade
            }
        })
    }
}
function addAssociation(gun,gb,getCell,path,toPath, cb){
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
function retrieveUtil(gun,gb,path,colArr,callBack){//like chain retrieve but w/o DI and returns archived and deleted cols
    //retrieve row with certain columns
    //colArr must have pvals
    let [base,tval,r] = path.split('/')
    let cols = getValue([base, 'props', tval, 'props'], gb)
    let columns = {}
    if(colArr){// check for pvals already, or attemept to convert col array to pvals
        for (let j = 0; j < colArr.length; j++) {
            const pval = colArr[j];
            columns[pval] = undefined
        }
    }else{//full object columns
        for (const colp in cols) {
            columns[colp] = undefined
        }
    }
    for (const p in columns) {
        getRetrieve(gun, gb, path, columns, p, callBack) 
    }
    return 
}
function getRetrieve(gun,gb,path,colObj,pval,callBack){
    try{
        let root = gun.back(-1)
        let [base,tval,r,li,lir] = path.split('/')
        let {type} = getValue([base,'props',tval],gb)
        let {GBtype} = getValue([base,'props',tval,'props',pval],gb)
        let subSoul = ''
        //if type != static, then must look for data on node, not col
        //if GBtype = 'prev' || 'next' || 'association', then look for data in appropriate place
        if(['prev','next'].includes(GBtype)){
            subSoul = 'links'
        }
        if(GBtype === 'association'){
            subSoul = 'associations'
        }
        const collectAndSend = (msg, ev) => {
            let data = JSON.parse(JSON.stringify(msg.put))
            ev.off()
            if(data === undefined){
                colObj[pval] = null
            }else if(!subSoul){
                colObj[pval] = data
            }else{
                let arr = []
                for (const key in data) {
                    if(key === '_'){
                        continue
                    }
                    const value = data[key];
                    if (value) {
                        arr.push(key)
                    }
                }
                colObj[pval] = arr
            }
            if(Object.values(colObj).includes(undefined)){
                return
            }else{
                callBack.call(this,colObj)
            }
        }
        console.log(type,subSoul,li)
        if(type === 'static' && !subSoul){
            root.get([base,tval,pval].join('/')).get(path).get(collectAndSend)
        }else if(type === 'static' && subSoul){
            let soul = [base,tval,r,subSoul,pval].join('/')
            root.get(soul).get(collectAndSend)
        }else if(type !== 'static' && !subSoul && !li){
            root.get([base,tval,r].join('/')).get(pval).get(collectAndSend)
        }else if(type !== 'static' && subSoul && !li){
            root.get([base,tval,r,subSoul,pval].join('/')).get(collectAndSend)
        }else if(type !== 'static' && li){
            root.get(path).get(pval).get(collectAndSend)
        }
    }catch(e){
        callBack.call(this,undefined,e)
    }
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
function makeSoul(argObj){
    let length = {'!':10,'#':6,'-':6,'$':10,'.':6,'^':5}
    let soul = ''
    let alias = {'!':'b','#':'t','-':'rt','$':'r','.':'p','^':'g'}
    for (const sym of soulSymbolOrder) {
        let val = argObj[sym] || argObj[alias[sym]]
        if(val){
            soul += sym
            if(val === 'new' && length[sym])val=rand(length[sym])
            if(typeof val === 'string'){//if no val for key, then val will be boolean `true` like just adding | or % for permission or config flag
                soul += val
            }
        }
    }
    return soul
}
function parseSoul(soul){
    let alias = {'!':'b','#':'t','-':'rt','$':'r','.':'p','^':'g'}
    let out = {}
    let last = 0
    let curSym = ['!']
    let idx
    for (const char of soulSymbolOrder) {
        if(char === '!')continue
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
        let al = alias[s]
        if(al)s=al
        out[s] = soul.slice(last+1,toIdx)
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
    [: Array/List node. Can be followed with a certain name for the type of list
    &: expansion
    ;: expansion
    @: expansion
    /: scope (symbol followed by a string (allows for extention of soul name spacing)) always second to last
    ?: args (symbol followed by a string. This string is additional arguments or parameters to be used with any symbol) Must be last in soul (can contain any char)
    */
    "!" : "just a base ID, no data at this node? Maybe just all table/relation IDs?",

    "!#" : "base and table, list of prop IDs?",
    "!-" : "base and relation, list of prop IDs?",
    "!%" : "base config",
    "!^" : "group in base (contains the list of pubkeys). If not followed by ID, then list of {ids:alias}",
    "!|" : "base level permissions",
    "!|super" : "super admin of this base",
    
    "!%:" : "base config timelog of changes??",
    "!#." : "base, table, column. no data at this soul, but could be?",
    "!-." : "base, relation, column. no data at this soul, but could be?",
    "!#%" : "nodeType config",
    "!-%" : "relation config",
    "!#$" : "dataNode",
    "!-$" : "relationNode (required keys of '_src' & '_trgt', optional '@' if target is snapshotted)",
    "!#|" : "table permissions",
    "!#-" : "base table relation, (if no relation ID after '>', then this soul contains a list of all connected/outgoing relations for this tableID)",
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
    "!#.$" : "specific prop on soul, ONLY USED FOR NESTED NODES. (contains {[souls of sub-nodes]: true/false})",
    "!#$-" : "contains keys of ('<' || '>') + [relationship ID] + [!-$ realtionSoul] and values of (t/f)",

    "!#.%:" : "timelog of prop config changes??",
    "!-.%:" : "timelog of relation prop config changes??"
    }
const soulSymbolOrder = '!#-.$^*|%:[&;@/?'


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
    findRowID,
    findRowAlias,
    gbForUI,
    gbByAlias,
    linkColPvals,
    setValue,
    setMergeValue,
    getValue,
    validateStaticData,
    handleRowEditUndo,
    checkUniqueAlias,
    checkUniqueSortval,
    findNextID,
    nextSortval,
    convertValueToType,
    isMulti,
    getPropType,
    getDataType,
    tsvJSONgb,
    watchObj,
    allUsedIn,
    removeFromArr,
    findLinkingCol,
    hasColumnType,
    handleStaticDataEdit,
    handleInteractionDataEdit,
    handleLIDataEdit,
    addAssociation,
    removeAssociation,
    retrieveUtil,
    getRetrieve,
    checkAliasName,
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
    parseSoul
}