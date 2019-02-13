//GBASE UTIL FUNCTIONS
function cachePathFromSoul(soul){//should redo with regex
    let pathArgs = soul.split('/')
    if(pathArgs[pathArgs.length -1] === 'config'){
        pathArgs.pop()
    }
    if(pathArgs.length === 3){//add .rows to path before rval
        pathArgs.splice(2,0, 'rows')
     }
    if(pathArgs.length === 4){//move r in path
       let rval = pathArgs.splice(2,1)
        if(rval.length > 1){
            pathArgs.push(rval)
        }
    }
    return pathArgs

}
function cachePathFromChainPath(thisPath){//should redo with regex
    let pathArgs = thisPath.split('/')
    if(pathArgs.length === 3){//add .rows to path before rval
        pathArgs.splice(2,0, 'rows')
     }
    if(pathArgs.length === 4){//move r in path
       let rval = pathArgs.splice(2,1)
        if(rval.length > 1){
            pathArgs.push(rval)
        }
    }
    return pathArgs

}
function configPathFromSoul(soul){//should redo with regex
    let pathArgs = soul.split('/')
    let config = false
    if(pathArgs[pathArgs.length -1] === 'config'){
        pathArgs.pop()
        config = true
    }
    if(pathArgs.length > 2){//remove r in path
       pathArgs.splice(2,1)
    }
    let configpath= []
    
    if(pathArgs.length > 1){
        for (let i = 0; i < pathArgs.length; i++) {
            const path = pathArgs[i];
            if(i === pathArgs.length-1){//end of path, our config
                if(config){
                    configpath.push(path)
                }else if(pathArgs[pathArgs.length -1] === 'p0' && !config){//handle rows
                    configpath.push('rows')
                }
            }else if (i === pathArgs.length-2 && pathArgs[pathArgs.length -1] === 'p0' && !config){
                configpath.push(path)
            }else{
                configpath.push(path)
                configpath.push('props')
            }
            
        }
    }else{
        configpath = pathArgs
    }
    return configpath

}
function configPathFromChainPath(thisPath){//should redo with regex
    let pathArgs = thisPath.split('/')
    let configpath= []
    let rowPath = false
    if(pathArgs.length > 1){//not base config
        for (let i = 0; i < pathArgs.length; i++) {
            let nextPath = pathArgs[i+1]
            const path = pathArgs[i];
            if(i === pathArgs.length-1 && !rowPath){//end of path, non row
                configpath.push(path)
            }else if(i === pathArgs.length-1 && rowPath){//end of path for a row
                configpath.push(thisPath)
            }else if (nextPath[0] === 'r' && nextPath.length >1){//if this path is a row push tval then 'rows'
                rowPath = true
                configpath.push(path)
                configpath.push('rows')
            }else{
                configpath.push(path)
                configpath.push('props')
            }
        }
    }else{
        configpath = pathArgs
    }
    return configpath

}
function configSoulFromChainPath(thisPath){//should redo with regex
    let pathArgs = thisPath.split('/')
    
    if(pathArgs[pathArgs.length -1][0] === 'p'){//insert /r/
       pathArgs.splice(2,0, 'r')
    }else if(pathArgs[pathArgs.length -1][0] === 'r' && pathArgs[pathArgs.length -1].length > 1){
        pathArgs.splice(2,pathArgs.length, 'r/p0') //p0 soul for table
    }
    if(pathArgs[pathArgs.length -1] !== 'config'){
        pathArgs.push('config')
    }
    return pathArgs.join('/')

}
const findID = (obj, name) =>{//obj is level above .props, input human name, returns t or p value
    let first = name[0]
    let rest = name.slice(1)
    if(first === 'p' && !isNaN(rest *1)){//if name is a pval just return the name
        return name
    }
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const alias = obj[key].alias;
            if(alias === name){
                return key
            }
        }
    }
    return false
}
const findRowID = (obj, name) =>{//obj is .rows, input human name, returns rowID
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const alias = obj[key]
            if(alias === name){
                return key
            }
        }
    }
    return false
}
const makefindRowAlias = gb => (rowID) =>{//obj is .rows, input human name, returns rowID
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
const makelinkColPvals = gb =>(base,tval)=>{
    let obj = getValue([base,'props',tval,'props'], gb)
    let result = {}
    for (const key in obj) {
        if (obj[key].linksTo && obj[key].GBtype === 'prev' || obj[key].GBtype === 'next') {
            const link = obj[key].linksTo
            result[key] = link
        }
    }
    return result
}
function setValue(propertyPath, value, obj){
    let properties = Array.isArray(propertyPath) ? propertyPath : propertyPath.split("/")
    if (properties.length > 1) {// Not yet at the last property so keep digging
      // The property doesn't exists OR is not an object (and so we overwritte it) so we create it
      if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "object") obj[properties[0]] = {}
        // We iterate.
      return setValue(properties.slice(1), value, obj[properties[0]])
        // This is the last property - the one where to set the value
    } else {
      // We set the value to the last property
        obj[properties[0]] = value
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
      if(typeof value === 'object'){
        if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "object") obj[properties[0]] = {}
        obj[properties[0]] = Object.assign(obj[properties[0]], value)
      }else{
        obj[properties[0]] = value
      }
      return true // this is the end
    }
}
function getValue(propertyPath, obj){
    let properties = Array.isArray(propertyPath) ? propertyPath : propertyPath.split("/")
    if (properties.length > 1) {// Not yet at the last property so keep digging
      if (!obj.hasOwnProperty(properties[0])){
          return undefined
      }
      return getValue(properties.slice(1), obj[properties[0]])
    }else{
        return obj[properties[0]]
    }
}
const makevalidateData = gb =>(editThisPath, putObj)=>{//prunes specials
    let args = editThisPath.split('/')
    let output = {}
    for (const pval in putObj) {
        let value = putObj[pval]
        let GBtype = getValue([args[0],'props', args[1], 'props', pval, 'GBtype'], gb)
        if(GBtype === undefined){
            let colname = getValue([args[0],'props', args[1], 'props', pval, 'alias'], gb)
            return console.log('ERROR: Cannot find data type for column: '+ colname+'['+ pval+'].')
        }
        let specials = {prev: 'string', next: 'string', function: 'string', tag: 'string'}
        if(specials[GBtype] === undefined){//root data type
            if(typeof value === GBtype){
                output[pval] = value
            }else{
                console.log('ERROR: typeof '+ value + 'is not of type '+ GBtype)
                return false
            }
        }
    }
    return output
}
const makehandleRowEditUndo = (gun, gb) =>(gbpath, editObj)=>{
    //gbpath should = base/tval/rowid
    //editObj = {p0: 'value, p4: 'other value', etc..}
    let arrpath = gbpath.split('/')
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
    gun.get(arrpath[0] + '/state').get('history').put(JSON.stringify(fullList))
    //node undo
    gun.get(gbpath + '/history').get(tstamp).put(JSON.stringify(undo.put))   
}
const makecheckUniqueAlias = gb =>(pathArr, alias)=>{
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
                if (configObj && configObj.alias && configObj.alias === alias && gbval !== endPath) {
                    throw new Error('Matching Alias found at:', gbval)
                }
            }
        }else{//row
            for (const gbval in things) {
                const rowAlias = things[gbval];
                if (rowAlias && rowAlias === alias && gbval !== endPath) {
                    throw new Error('Matching Alias found at:', gbval)
                }
            }
        }
        return true
    }else{
        throw new Error('Cannot find config data at path:', configPath)
    }
}
const makecheckUniqueSortval = gb =>(pathArr, sortval)=>{
    let configPath = pathArr.slice()
    let endPath = configPath.pop()//go up one level
    let things = getValue(configPath, gb)
    if(configPath.length === 1){
        return true //base alias, those are not unique
    }
    if(things !== undefined){
        if(endPath[0] !== 'r'){//base/table/col
            for (const gbval in things) {
                const configObj = things[gbval];
                if (configObj && configObj.sortval && configObj.sortval === sortval && gbval !== endPath) {
                    throw new Error('Matching sortval found at:', gbval)
                }
            }
        }else{//row
            //no sort on row
        }
        return true
    }else{
        throw new Error('Cannot find config data at path:', configPath)
    }
}
const makefindNextID = gb => (path)=>{
    let curIDsPath = configPathFromChainPath(path)
    curIDsPath.push('props')
    let curIDs = getValue(curIDsPath, gb)
    let tOrP = Object.keys(curIDs)[0][0]
    if(curIDs !== undefined){
        let ids = Object.keys(curIDs).map(id=>id.slice(1)*1)
        let nextid = tOrP + (Math.max(...ids)+1)
        return nextid
    }
}
const makenextSortval = gb => (path)=>{
    let curIDsPath = configPathFromChainPath(path)
    curIDsPath.push('props')
    let curIDs = getValue(curIDsPath, gb)
    let nextSort = 0
    for (const key in curIDs) {
        const sortval = curIDs[key].sortval;
        console.log(sortval, nextSort)
        if(sortval && sortval >= nextSort){
            nextSort = sortval
        }
    }
    nextSort += 10
    return nextSort
}
function convertValueToType(value, newType, rowAlias){
    let out
    if(newType === 'string'){
        out = String(value)
    }else if(newType === 'number'){
        let num = value*1
        if(isNaN(num)){
            throw new Error('Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to a number. Fix and try again')
        }else{
            out = num
        }
    }else if(newType === 'boolean'){
        value = String(value)
        if(value == '' || '0' || 'false' || 'null' || 'undefined' || ""){//falsy strings
            out = false
        }else if (value == '1' || 'true' || 'Infinity'){//truthy strings
            out = true
        }else{
            throw new Error('Conversion aborted. Cannot convert '+ value + ' for '+ rowAlias + ' to boolean. enter true or false or 0 for false or 1 for true')
        }
    }else{
        throw new Error('Can only attempt to conver value to "string", "number", or "boolean" using this function')
    }
    return out
}
const makeisLinkMulti = gb => (colStr)=>{
    let cpath = configPathFromChainPath(colStr)
    let config = getValue(cpath,gb) || {}
    if(config.linkMultiple && (config.GBtype === 'prev' || config.GBtype === 'prev')){
        return true
    }
    return false
}
const makegetColumnType = gb =>(colStr)=>{
    let cpath = configPathFromChainPath(colStr)
    let config = getValue(cpath,gb) || {}
    if(config.GBtype !== undefined){
        return config.GBtype
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
    cachePathFromSoul,
    configPathFromSoul,
    configPathFromChainPath,
    configSoulFromChainPath,
    findID,
    findRowID,
    makefindRowAlias,
    gbForUI,
    gbByAlias,
    makelinkColPvals,
    setValue,
    setMergeValue,
    getValue,
    makevalidateData,
    makehandleRowEditUndo,
    makecheckUniqueAlias,
    makecheckUniqueSortval,
    makefindNextID,
    makenextSortval,
    convertValueToType,
    makeisLinkMulti,
    makegetColumnType,
    tsvJSONgb,
    watchObj
}