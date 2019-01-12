"use strict";
var globalVar = require("global");
var util = require('./util/util');
var gunGet = util.gunGet
var gunGetGet = util.gunGetGet
var gunGetList = util.gunGetList
var gunGetListNodes = util.gunGetListNodes
var gunGetListProp = util.gunGetListProp
var getKeyByValue = util.getKeyByValue
var gunFilteredNodes = util.gunFilteredNodes
var nextIndex = util.nextIndex
 


//import Ajv from 'ajv';
if(typeof window !== "undefined"){
    var Gun = globalVar.Gun;
  } else {
    var Gun = global.Gun;
  }
//var ajv = new Ajv();
var GB = {}
let baseParams = {alias: false, sortval: 0, vis: true, archived: false, deleted: false, props: {}}
let tParams = {alias: false, sortval: 0, vis: true, archived: false, deleted: false, props: {}}
let pParams = {alias: false, sortval: 0, vis: true, archived: false, deleted: false, GBtype: 'string', required: false, default: false, fn: false, usedIn:{}}
if (!Gun)
	throw new Error("gundb-gbase: Gun was not found globally!");

base(Gun.chain);

function base(gun) {
    gun.loadGBase = loadGBase;
    gun.modifyGBconfig = modifyGBconfig
    gun.newBase = newBase;
    gun.addTable = addTable
    gun.addColumn = addColumn
    gun.addRow = addRow

    gun.gbase = gbase
    gun.getTable = getTable
    gun.getColumn = getColumn
    gun.config = getConfig
    gun.getRow = getHID
    gun.edit = edits
    
    gun.massNewPut = massNewPut
    gun.importSettle = importSettle

   
    gun.settle = settle;
    gun.archive = archive
    gun.unarchive = unarchive
    gun.delete = deleteNode
    gun.cascade = cascade

    gun.rePut = rePut
    gun.linkImport = linkImport
}

//utility helpers
function gbase(baseID){
if(baseID.length == 12){//naive base soul coerce
    baseID = 'GB/' + baseID
}
  let gun = this
  let obj = {base: baseID}
  return gun.get(JSON.stringify(obj))
}
function getTable(aliasString){
    //chain off gbase; gun.gbase('GB/1234567').getTable('Part')
    //detect prev gets string to know if we are chaining from .gbase or antoher .gets
    let gun = this
    if(typeof gun['_']['get'] !== 'string'){return console.log('Must chain off gun.gbase(GB/UUID)')}
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    if(args.base && idx == 1){//gun.gbase.getTable
        args['t'] = aliasString
    }else{
        return console.log('ERROR: Invalid use of getTable in chain. Should be: gun.gbase("GB/-your uuid-").getTable("TableName")')
    }
    return gun.get(JSON.stringify(args))
}
function getColumn(aliasString){
    //chain off gbase; gun.gbase('GB/1234567').gets('Part')
    //detect prev gets string to know if we are chaining from .gbase or antoher .gets
    let gun = this
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    if(args.base && args.t && idx == 2){//gun.gbase.getTable.getCol  ??Will only be used like this followed by a .getConfig()??
        args['p'] = aliasString
    }else{
        return console.log('ERROR: Invalid use of getTable in chain. Should be: gun.gbase("GB/-your uuid-").getTable("TableName").getCol("ColumnName")')
    }
    return gun.get(JSON.stringify(args))
}
function getHID(aliasString){
    //chain off gbase; gun.gbase('GB/1234567').getTable('Part').getHID('Human Readable UID/string')
    //detect prev gets string to know if we are chaining from .gbase or antoher .gets
    let gun = this
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    if(args.base && args.t && idx == 2){//gun.gbase.getTable.getHID
        args['HID'] = aliasString
    }else{
        return console.log('ERROR: Invalid use of getHID in chain. Should be: gun.gbase("GB/-your uuid-").getTable("TableName").getHID("Human Readable UID/string")')
    }
    return gun.get(JSON.stringify(args))
}

function getConfig(){
    //chain off gbase; gun.gbase('GB/1234567').gets('Part')
    //detect prev gets string to know if we are chaining from .gbase or antoher .gets
    let gun = this
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    args['CONFIG'] = true
    return gun.get(JSON.stringify(args))
}
let undoObj = {base: false, t: false, p:false, HID: false, put: false, CONFIG: false}
function edits(putObj){
    //put wrapper, that attempts to detect entity in .gets and stores the change in both dataset and history log for that node, as well as in the undo list
    let gun = this
    let gunRoot = this.back(-1)
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    let params = {}
    let GBid

    if(args.CONFIG){
        //changing config for base/table/col
        if(args.base && idx == 2){
            if(GB.byAlias[args.base]){
                gun.modifyGBconfig(putObj,args.base)
            }else{
                return console.log('ERROR: Cannot find base', args.base)
            }
        }else if(args.base && args.t && idx == 3){//configuring table
            if(GB.byAlias[args.base].props[args.t]){
                gun.modifyGBconfig(putObj,args.base,args.t)
            }else{
                return console.log('ERROR: Cannot find base/table combo', args.base, args.t)
            }
        }else if (args.base && args.t && args.p && idx == 4){//configuring prop on table
            if(GB.byAlias[args.base].props[args.t]){
                if(GB.byAlias[args.base].props[args.t].props[args.p]){
                    gun.modifyGBconfig(putObj,args.base,args.t,args.p)
                }else{
                    return console.log('ERROR: Cannot find base/table/column combo', args.base, args.t, args.p)
                }
            }else{
                return console.log('ERROR: Cannot find table', args[1])
            }
        }else if (args.base && args.t && args.HID && idx == 4){//configuring table row HID alias
            //HANDLE HID ALIAS CHANGE
            if(GB.byAlias[args.base].props[args.t]){
                if(GB.byAlias[args.base].props[args.t].HID[args.HID]){
                    let GBsoul = GB.byAlias[args.base].props[args.t].HID[args.HID]
                    let hidedit
                    if(typeof putObj === 'string' || typeof putObj === 'number'){
                        hidedit = {HIDchange: putObj}
                    }else if(putObj.alias){
                        hidedit = {HIDchange: putObj.alias}
                    }
                    hidedit.oldHID = args.HID
                    gunRoot.modifyGBconfig(hidedit,args.base,args.t)
                }else{
                    return console.log('ERROR: Cannot find base/table/row combo', args.base, args.t, args.HID)
                }
            }else{
                return console.log('ERROR: Cannot find table', args.t)
            }
        }
    }else if (args.HID){//edit on sheet
        //parse meaning of non config edit
        if (args.base && args.t) {
            //check for valid aliases & store GB tname
            if(GB.byAlias[args.base]){
                params.base = args.base
            }else{
                return console.log('ERROR: Cannot find base', args.base)
            }
            if(GB.byAlias[args.base].props[args.t]){
                params.t = GB.byAlias[args.base].props[args.t].alias
            }else{
                return console.log('ERROR: Cannot find table', args.t)
            }
            if((args.newNode && GB.byAlias[args.base].props[args.t].HID && !GB.byAlias[args.base].props[args.t].HID[args.HID]) || !GB.byAlias[args.base].props[args.t].HID){//newNode
                let id = Gun.text.random(12)
                GBid = params.base + '/' + params.t + '/' + id
                params.HID = GBid
            }else if (args.newNode){
                return console.log('ERROR: Human ID already taken! Select a unique HID', args.HID)
            }else{
                params.HID = GB.byAlias[args.base].props[args.t].HID[args.HID]
            }
            
            
            //check keys in putObj for valid aliases && check values in obj for correct type in schema then store GB pname
            for (const pAlias in putObj) {
                if(GB.byAlias[args.base].props[args.t].props[pAlias]){
                    let pGBname = GB.byAlias[args.base].props[args.t].props[pAlias].alias
                    let pType = GB.byAlias[args.base].props[args.t].props[pAlias].GBtype
                    const value = putObj[pAlias];
                    let valid = checkGBtype(value, pType)
                    if(valid){
                        params.put = {[pGBname]: value}
                    }else{
                        //do something to alert that nothing is getting put in the DB
                        return console.log('Edit failed!', value, 'is not of type', pType,'. NOTHING WRITTEN TO DATABASE')
                    }
                }else{
                    return console.log('Cannot find', pAlias, 'on table', args.t,'. NOTHING WRITTEN TO DATABASE') 
                }

            }
            let nowstamp = Date.now()
            if(args.newNode){
                let HIDsoul = params.base + '/' + params.t + '/p0'
                gunRoot.get(HIDsoul).get(args.HID).put(GBid)
                //trigger config node subscription
                gunRoot.get('GBase').get('tick').put(Gun.text.random(4))
            }
            for (const key in params.put) {
                if(key !== 'p0'){//handle HID change through changeGBconfig
                    const value = params.put[key];
                    let colSoul = params.base + '/' + params.t + '/' + key
                    gunRoot.get(colSoul).put({[params.HID]: value})
                }else{
                    console.log('To change the Human ID column, use .config() before the .edit call')
                }             
            }
            //global undo of last 100 edits indexed
            let undo = {}
            undo.base = params.base
            undo.t = params.t
            undo.HID = params.HID
            undo.put = putObj
            let entry = {[nowstamp]: undo}
            let fullList = Object.assign({},GB.byAlias[params.base].history,entry)
            let lenCheck = Object.keys(fullList)
            if(lenCheck.length > 100){
                delete fullList[lenCheck[0]]
            }
            gunRoot.get(params.base + '/state').get('history').put(JSON.stringify(fullList))
            //node undo
            gunRoot.get(params.HID + '/history').get(nowstamp).put(JSON.stringify(undo))
        }else{
            return console.log('Need to have correct baseID and table name')
        }
    }else{//?? Other edit??? return error for now
        return console.log('Not sure what you are trying todo, NOTHING WRITTEN TO DB')
    }
}
function checkGBtype(value, GBtype){
    //root types, root data stored in gun
    //GB specific static: tags, 
    //GB specific active: function, ??cascade things??
    //GB or Gun structure: link
    return true
}
function modifyGBconfig(configObj, baseID, tname, pname){
    // need to add more checks for valid configObj, whole app is built from this config so if it screws up it makes a mess.
    //configObj = {alias: 'new name', sortval: 3, vis: false, archived: false, deleted: false}
    let params = arguments.length
    let gun = this.back(-1)
    let newObj = {}
    switch (params) {
        case 0:
        case 1:
            return console.log('Check your arguements, first should be an object, second the BaseID (BG/UUID), third and fourth are for table and prop name') 
        case 2:
            if(GB.byAlias[baseID]){
                let matches = {}
                for (const config in GB.byAlias[baseID]) {
                    if(configObj[config]){
                        matches[config] = configObj[config]
                    }
                }
                let tstamp = Date.now()
                let newconfig = Gun.obj.copy(GB.byAlias[baseID])
                newconfig = Object.assign({},GB.byAlias[baseID], newconfig)
                gun.get(baseID+'/config/history').get(tstamp).put(JSON.stringify(newconfig))
                gun.get('GBase').get(baseID).put(JSON.stringify(newconfig))
            }
            break;
        case 3:
            if(GB.byAlias[baseID] && GB.byAlias[baseID].props[tname]){
                let fullConfig = Gun.obj.copy(GB.byAlias[baseID])
                let taliasName
                let matches = {}
                if(!configObj.HIDchange){//Alias or config changes to table
                    if(configObj.alias && !GB.byAlias[baseID].props[configObj.alias]){
                        taliasName = configObj.alias
                        delete fullConfig.props[tname]
                    }else if(configObj.alias){
                        return console.log('ERROR: New alias is not unique, ABORTING CHANGE')
                    }else{
                        taliasName = tname
                    }
                    for (const config in GB.byAlias[baseID].props[tname]) {
                        if(configObj[config] && config !== 'alias'){
                            matches[config] = configObj[config]
                            
                        }                   
                    }
                }  
                fullConfig.props[taliasName] = Object.assign({},GB.byAlias[baseID].props[tname], matches)
                let time = Date.now()
                if(configObj.HIDchange){//change row HID
                    if(GB.byAlias[baseID].props[tname].HID[configObj.HIDchange]){
                        return console.log('ERROR: Human ID must be unique, NOTHING CHANGED')
                    }
                    let tAlias = GB.byAlias[baseID].props[tname].alias
                    let HIDsoul = baseID + '/' + tAlias + '/p0'
                    let soul = GB.byAlias[baseID].props[tname].HID[configObj.oldHID]
                        //global undo of last 100 edits indexed
                    let putObj = {'!HIDCHANGE': true, '!OLDHID': configObj.oldHID, '!NEWHID': configObj.HIDchange}
                    let undo = {}
                    undo.base = baseID
                    undo.t = tAlias
                    undo.HID = soul
                    undo.put = putObj
                    let entry = {[time]: undo}
                    let fullList = Object.assign({},GB.byAlias[baseID].history,entry)
                    let lenCheck = Object.keys(fullList)
                    if(lenCheck.length > 100){
                        delete fullList[lenCheck[0]]
                    }
                    gun.get(soul).get('p0').put(configObj.HIDchange)
                    gun.get(HIDsoul).get(configObj.HIDchange).put(soul)
                    gun.get(HIDsoul).get(configObj.oldHID).put(false)
                    gun.get(baseID + '/state').get('history').put(JSON.stringify(fullList))
                    //node undo
                    gun.get(soul + '/history').get(time).put(JSON.stringify(undo))
                    
                    
                }else{//write table changes
                    gun.get(baseID+'/config/history').get(time).put(JSON.stringify(fullConfig))
                    gun.get('GBase').get(baseID).put(JSON.stringify(fullConfig))   
                }
            }else{
                console.log('Sheet name is not found')
            }
            //trigger config node subscription
            gun.get('GBase').get('tick').put(Gun.text.random(4))
            break
        case 4:
            if(GB.byAlias[baseID] && GB.byAlias[baseID].props[tname] && GB.byAlias[baseID].props[tname].props[pname]){
                let fullConfig = Gun.obj.copy(GB.byAlias[baseID])
                let paliasName
                let matches = {}
                if(configObj.alias && !GB.byAlias[baseID].props[tname].props[configObj.alias]){
                    paliasName = configObj.alias
                    delete fullConfig.props[tname].props[pname]
                }else if(configObj.alias){
                    return console.log('ERROR: New alias is not unique, ABORTING CHANGE')
                }else{
                    paliasName = pname
                }
                //need to check configObj keys to exact match the config obj GBase is expecting
                let params = Gun.obj.copy(configObj)
                if(params.alias){delete params.alias}
                if(params.sortval && GB.byAlias[baseID].props[tname].props[pname].alias === 'p0'){//protect HID col to be leftmost
                    delete params.sortval
                    }                
                for (const config in GB.byAlias[baseID].props[tname].props[pname]) {
                    if(params[config]){
                        matches[config] = params[config] 
                    }                    
                }
                fullConfig.props[tname].props[paliasName] = Object.assign({}, GB.byAlias[baseID].props[tname].props[pname], matches)
                let tstamp = Date.now()
                gun.get(baseID+'/config/history').get(tstamp).put(JSON.stringify(fullConfig))
                gun.get('GBase').get(baseID).put(JSON.stringify(fullConfig)) 
            }else{
                console.log('Sheet name and/or column name are not found')
            }
            break
        default:
            return console.log('invalid number of arguments')
    }
}
function aliasTransform(aliasObj){
    console.log(aliasObj)
    let output = {byGB: Gun.obj.copy(aliasObj), forUI: Gun.obj.copy(aliasObj)}
    for (const bid in aliasObj) {
        output.forUI[bid] = {}
        const sheetobj = Object.assign({},aliasObj[bid].props);
        for (const sname in sheetobj) {
            if(sheetobj[sname]){
                //byGB
                let salias = sheetobj[sname].alias
                let prev = output.byGB[bid].props[sname]
                let newdata = Object.assign({},prev)
                newdata.alias = sname
                output.byGB[bid].props[salias] = newdata
                delete output.byGB[bid].props[sname]

                let svis = sheetobj[sname].vis
                if(svis){
                    let ssort = sheetobj[sname].sortval
                    output.forUI[bid][ssort] = {[sname]: {}}

                    for (const prop in sheetobj[sname].props) {
                        const pconfig = sheetobj[sname].props[prop];
                        if(pconfig.vis){
                            let psort = pconfig.sortval
                            output.forUI[bid][ssort][sname][psort] = prop
                        }
                    }
                }else{
                    for (const prop in sheetobj[sname].props) {
                        const pconfig = sheetobj[sname].props[prop];
                        if(pconfig.vis){
                            let psort = pconfig.sortval
                            output.forUI[bid][ssort][sname][psort] = prop
                        }
                    }
                }

                const columnobj = Object.assign({}, sheetobj[sname].props);
            
                for (const pname in columnobj) {
                    if(columnobj[pname]){

                        const palias = columnobj[pname].alias;
                        let prev = output.byGB[bid].props[salias].props[pname]
                        let newdata = Object.assign({},prev)
                        newdata.alias = pname
                        output.byGB[bid].props[salias].props[palias] = newdata
                        delete output.byGB[bid].props[salias].props[pname]

                        
                    }
                }
            }else{//falsy value for prop (old, now available gun alias for reuse)
                delete output.byGB[bid].props[sname]
            }
        }

    }
    return output
}
function loadGBase() {
    gun = this
    gun.get('GBase').on(function(data, id){
        let gbconfig = {}
        let clean = Gun.obj.copy(data)
        delete clean['_']
        if(clean['tick']){delete clean['tick']}
        for (const key in clean) {
            
            gbconfig[key] = JSON.parse(clean[key])
            for (const k in gbconfig[key].props) {
                let tconfig = gbconfig[key].props[k]
                let HIDsoul = key + '/' + tconfig.alias + '/p0'
                gun.get(HIDsoul).on(function(data,id){
                    let souls = Gun.obj.copy(data)
                    delete souls['_']
                    tconfig.HID = souls
                })
            
                gun.get(key + '/state').get('history').on(function(data){
                    let list = JSON.parse(data)
                    gbconfig[key].history = list
                })
            }
        }
        let newObj = Object.assign({},GB.byAlias, gbconfig)
        GB.byAlias = newObj
        let trans = Gun.obj.copy(GB.byAlias)
        let transform = aliasTransform(trans)
        GB.byGB = transform['byGB']
        GB.forUI = transform['forUI']
        console.log(GB)
        return GB
    })
}
// let baseParams = {alias: false, sortval: 0, vis: true, archived: false, deleted: false, props: {}}
// let tParams = {alias: false, sortval: 0, vis: true, archived: false, deleted: false, props: {})
// let pParams = {alias: false, sortval: 0, vis: true, archived: false, deleted: false, GBtype: {}, required: false, default: false, fn: false, usedIn:{}}
function newBase(baseName, tname, pname){
    let gun = this
    let id = Gun.text.random(12)
    let soul = 'GB/' + id
    let param = Gun.obj.copy(baseParams)
    tname = (tname) ? tname : 'table1'
    pname = (pname) ? pname : 'HumanID'
    if(baseName){
        param.alias = baseName
    }
    let sheetparams = Gun.obj.copy(tParams)
    let columnparams = Gun.obj.copy(pParams)
    columnparams.alias = 'p0'
    let defcolumn = {[pname]: columnparams}
    sheetparams.props = defcolumn
    sheetparams.alias = 't0'
    sheetparams.sortval = 0
    let defparams = {[tname]: sheetparams}
    param.props = defparams
    let copy = JSON.stringify(param)
    gun.get('GBase').get(soul).put(copy)
    return soul
}
function addTable(tAlias, pAlias){
    let gun = this
    let gunRoot = this.back(-1)
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    pAlias = (pAlias)? pAlias : 'HumanID'//optional
    if(args.base && idx == 1){//gun.gbase.getTable.newTable('tableName')
        args['t'] = tAlias
        if(!GB.byAlias[args.base].props[tAlias]){
            let param = Gun.obj.copy(GB.byAlias[args.base])
            console.log(param)
            let sheetparams = Gun.obj.copy(tParams)
            let columnparams = Gun.obj.copy(pParams)
            columnparams.alias = 'p0'
            columnparams.sortval = 0
            let defcolumn = {[pAlias]: columnparams}
            sheetparams.props = defcolumn
            let tvals = Object.keys(GB.byGB[args.base].props).map(t=>Number(t.slice(1)))
            let nextT = 't' + (Math.max(...tvals)+1)
            sheetparams.alias = nextT
            let nextSort = Object.keys(GB.forUI[args.base])
            sheetparams.sortval = Math.max(...nextSort)+10
            param.props = Object.assign(param.props, {[tAlias]: sheetparams})
            let merge = Object.assign({},GB.byAlias[args.base], param)
            gunRoot.get('GBase').get(args.base).put(JSON.stringify(merge))
        }else{
            console.log('Name already in use. Pick a unique name')
        }
    }else{
        return console.log('ERROR: Invalid use of newTable in chain. Should be: gun.gbase("GB/-your uuid-").newTable("TableName")')
    }
    return gun.get(JSON.stringify(args))

    
}
function addColumn(pAlias, gbcoltype){
    let gun = this
    let gunRoot = this.back(-1)
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    gbcoltype = (gbcoltype) ? gbcoltype : 'string'//optional
    //Need to validate the entered gbcoltype with gbase types
    if(args.base && args.t && idx == 2){//gun.gbase.getTable.newTable('tableName')
        args['p'] = pAlias
        if(GB.byAlias[args.base].props[args.t] && !GB.byAlias[args.base].props[args.t].props[pAlias]){
            let param = Gun.obj.copy(GB.byAlias[args.base])
            let sheetparams = Gun.obj.copy(GB.byAlias[args.base].props[args.t])
            let columnparams = Gun.obj.copy(pParams)
            columnparams.GBtype = gbcoltype
            let tval = GB.byAlias[args.base].props[args.t].alias
            let pvals = Object.keys(GB.byGB[args.base].props[tval].props).map(p=>Number(p.slice(1)))
            let nextP = 'p' + (Math.max(...pvals)+1)
            columnparams.alias = nextP
            let sSort = GB.byAlias[args.base].props[args.t].sortval
            let nextSort = Object.keys(GB.forUI[args.base][sSort][args.t])
            columnparams.sortval = Math.max(...nextSort)+10
            let defcolumn = {[pAlias]: columnparams}
            sheetparams.props = Object.assign(sheetparams.props,GB.byAlias[args.base].props[args.t].props, defcolumn)
            param.props = Object.assign(param.props, {[args.t]: sheetparams})
            let merge = Object.assign({},GB.byAlias[args.base], param)
            gunRoot.get('GBase').get(args.base).put(JSON.stringify(merge))
        }else{
            if(!gbcoltype){
                console.log('Define column type')
            }else{
                console.log('Name already in use. Pick a unique name') 
            }
        }
    }else{
        return console.log('ERROR: Invalid use of newColumn in chain. Should be: gun.gbase("GB/-your uuid-").getTable("Table Name").newColumn("Column Name")')
    }
    return gun.get(JSON.stringify(args))
}
function addRow(userHID){
    let gun = this
    let args = JSON.parse(gun['_']['get'])
    let idx = Object.keys(args).length
    if(args.base && args.t && idx == 2){//gun.gbase.getTable.getHID 
        args['HID'] = userHID
        args['newNode'] = true
    }else{
        return console.log('ERROR: Invalid use of newNode in chain. Should be: gun.gbase("GB/-your uuid-").getTable("TableName").newNode("Human Readable UID/string")')
    }
    return gun.get(JSON.stringify(args)) 
}

function massNewPut(putString, data, opt) {
    let gun = this;
    var nodes
    if(opt){
        if (opt.length == 1){
            opt[0] = parseInt(opt[0])
            opt.push(data.length)
            nodes = data.length-parseInt(opt[0])
        }
    }else if (opt && opt.length == 2){
        opt[0] = parseInt(opt[0])
        opt[1] = parseInt(opt[1]) 
        nodes = parseInt(opt[1])-parseInt(opt[0])
    }else{
        opt = [0, data.length]
    }
        nodes = data.length
    nodes = parseInt(opt[1])-parseInt(opt[0])
    let keys = Object.keys(data[0]).length
    console.log(nodes)
    let wait = parseInt(nodes)*keys*1.3
    let entities = parseInt(nodes)*keys
    console.log('entities = ', entities)
    console.log('start');
    //if (data.length > 1500){return console.log('Limited to only 1000 nodes at a time!')}
    var tempIdObj = {};
    for(let i = parseInt(opt[0]); i < parseInt(opt[1]); i++) {
        // if(i && (i % 50 == 0)) {
        //   localStorage.clear();
        // }
        
        let newNode = gun.newNode(putString)
        let id = newNode['_']['soul'].split('/')[1]
        data[i]['!ID'] = id

        newNode.importSettle(data[i]);
    }
    console.log('Done')
			
}

function rePut(type, keylen, data){
    console.log('starting rePut')
    let gun = this.back(-1)
    let get = '!TYPE/' + type
    let hid = GB[type].nav.humanID
    let next = gunGetListNodes(gun,get)
    next.then(nodeArr =>{
        console.log('nodes found', nodeArr.length)
        let keyCheck = {}
        let hids = {}
        let missing = []
        for (let i = 0; i < nodeArr.length; i++) {
            const node = nodeArr[i];
            hids[node[hid]] = node
            let keys = Object.keys(node).length
            if(keys < keylen){
                let soul = type + '/' + nodeArr[i]['!ID']
                keyCheck[hid] = soul
            }
            
        }
        for (let i = 0; i < data.length; i++) {
            const node = data[i];
            const ref = data[i][hid];
            if (!hids[ref]) {
                missing.push(node)
            }
            
        }
        console.log(missing)
        if(Object.keys(keyCheck).length){
            console.log('nodes missing props:', Object.keys(keyCheck).length)
            for (let i = 0; i < data.length; i++) {
                const node = data[i];
                if(keyCheck[node[hid]]){
                    for (const key in node) {
                        gun.get(keyCheck[hid]).get(key).put(node[key])
                        
                    }
                }
            }
        }
        if(missing.length){
            gun.massNewPut(0,type,missing)
        }else{
            return console.log('No Missing Nodes!')
        }
         
    })
    
   
}


function importSettle (newData){
    let gun = this;
    let gunRoot = this.back(-1);
    let nodeID = newData['!ID'] || gun['_']['soul'].split('/')[1] || null//or ID string
    let type = newData['!TYPE'] || gun['_']['soul'].split('/')[0] || null
    let nodeSoul = gun['_']['soul'] || type + '/' + nodeID//gun id 'get' string
    let aliasProp = (GB[type].nav.importID) ? GB[type].nav.humanID : false
    let alias = (aliasProp && newData[aliasProp]) ? newData[aliasProp] : false

    if(!GB[type]){return console.log('INVALID NODETYPE')}
    //for a new node
    gun.get('!ID').put(nodeID)
    gunRoot.get('!TYPE/'+type).get(nodeSoul).put({'#':nodeSoul}) //setlist collection of same type nodes
    if (alias){
        gunRoot.get('!TYPE/'+type + '/!ALIAS').get(alias).put({'#': nodeSoul}) //setlist keyd by importID
    }
    let result = GB[type].settle(newData,false)
    let obj = {}
    for(let key in result.putObj){
        if(!GB[type].whereTag.includes(key)){//skip tag fields, tag() handles this
            gun.get(key).put(result.putObj[key])
        }else{
            if (newData[key] && typeof newData[key] == 'string' && newData[key].length){
                result[key].add = result[key].add.concat(newData[key].split(','))
            }else if (newData[key] && Array.isArray(newData[key])){
                result[key].add = result[key].add.concat(newData[key])
            }
        }
    }
    handleTags(gun, result, type) 
}



function archive(){
    let gun = this;
    let gunRoot = this.back(-1)
    let result = {}
    let type
    let nodeSoul = gun['_']['soul'] || false
    if(!nodeSoul){
        return console.log('Must select a node with known nodeType. ie; .get("nodeType/00someID00").archive()')}
    gun.on(function(archiveNode){
        type = archiveNode['!TYPE']
        let forceDelete = archiveNode['!DELETED'] || false
        let props = GB[type].whereTag
        for (let i = 0; i < props.length; i++){
            result[props[i]] = {add: [],remove: []}
            gun.get(props[i]).once(function(tags){
                for (const key in tags) {
                    if(forceDelete && tags[key] !== '_' && tags[key] !== '!ARCHIVED'){
                        result[props[i]].remove.push(key) //null all tags even if they are '0'
                    }else if(tags[key] == 1){
                        gun.get(props[i]).get('!ARCHIVED').get(key).put(1)
                        result[props[i]].remove.push(key)
                    }
                }
            })
        }
        gun.get('!DELETED').put(true)
        gunRoot.get('!TYPE/'+type).get(nodeSoul).put(null)
        gunRoot.get('!TYPE/'+type+'/ARCHIVED').get(nodeSoul).put({'#': nodeSoul})
        console.log(result)

    })
    console.log(result)
    handleTags(gun,result,type)
}
function unarchive(){
    let gun = this;
    let gunRoot = this.back(-1)
    let type
    let result = {}
    let nodeSoul = gun['_']['soul'] || false
    if(!nodeSoul){
        return console.log('Must select a node with known nodeType. ie; .get("nodeType/00someID00").archive()')}
    gun.on(function(archiveNode){
        type = archiveNode['!TYPE']
        let props = GB[type].whereTag
        for (let i = 0; i < props.length; i++){
            result[props[i]] = {add: [],remove: []}
            gun.get(props[i]).get('!ARCHIVED').once(function(tags){
                for (const key in tags) {
                    if(tags[key] == 1){
                        
                        result[props[i]].add.push(key)
                    }
                }
            })
            gun.get(props[i]).get('!ARCHIVED').put(null)
        }
        gun.get('!DELETED').put(false)
        gunRoot.get('!TYPE/'+type).get(nodeSoul).put({'#': nodeSoul})
        gunRoot.get('!TYPE/'+type+'/ARCHIVED').get(nodeSoul).put(null)

    })
    console.log(result)
    handleTags(gun,result,type)
}
function deleteNode(){
    let gun = this;
    let gunRoot = this.back(-1)
    let fromNodeSoul = gun['_']['soul'] || false
    if(!fromNodeSoul){
        return console.log('Must select a node with known nodeType. ie; gun.get("nodeType/654someID123").delete()')}
    let check = new Promise( (resolve, reject) => {
        let exist = gun.then()
        resolve(exist)
    })
    check.then( (data) => {
        let fromType = data['!TYPE']
        let nextKey = Object.keys(GB[fromType]['next'])[0] //should only ever be a sinlge next key
        let prevKeys = Object.keys(GB[fromType]['prev'])
        gun.get(nextKey).on( (ids) => {
                for (const key in ids) {
                    if(ids[key] !== null){
                        gun.get(key).unlink(gunRoot.get(fromNodeSoul))
                    }
                }
            })
        for (let i = 0; i < prevKeys.length; i++) {
            const prop = prevKeys[i];
            gun.get(prop).on(function(ids){
                for (const key in ids) {
                    if(ids[key] !== null){
                        gun.get(fromNodeSoul).unlink(gunRoot.get(key))
                    }
                }
            })
        }



        // gun.once(function(archiveNode){//null out fields
        //     let type = archiveNode['!TYPE']
        //     gunRoot.get('!TYPE/'+type+'/ARCHIVED').get(fromNodeSoul).put(null)
        //     gunRoot.get('!TYPE/'+type+'/DELETED').get(fromNodeSoul).put({'#': fromNodeSoul})
        //     for (const key in archiveNode) {
        //         if(key !== '_' || key !== '!DELETED'){//otherwise we break things
        //             gun.get(key).put(null)
        //         }
        //     }
            
        // })
    })
}
//utility helpers

//Tree Logic


async function assembleTree(gun, node, fromID, archived, max, inc, arr){
    let res
    let idRef
    let newNode
    if(inc === undefined){//initial call
        newNode = Gun.obj.copy(node)
        inc = 0
        max = max || Infinity
        arr = [[],[]];
        let arrObj = {id: fromID,
                    data: newNode,
                    from: false,
                    prop: false
                    }   
        arr[0][0] = arrObj
        res = [node, arr]
        fromID = fromID
        
    }
    if(inc == max){return}
    //console.log(inc)
    inc++
    let refsToTraverse = Object.keys(GB[node['!TYPE']]['prev'])
    if (refsToTraverse){
        for (let i = 0; i < refsToTraverse.length; i++){
            if (node[refsToTraverse[i]]){
                if(!Array.isArray(arr[inc])){arr[inc] = []}
                let lookup = node[refsToTraverse[i]]["#"]
                let id = {id: lookup} //arr
                idRef = Object.assign({}, id) //arr
                let subthings = []
                //console.log(lookup)
                let propRef = await gunGetListNodes(gun, lookup)
                propRef.map(function(node){
                    let subNode = Gun.obj.copy(node)

                    if(!archived && subNode['!DELETED']){
                        
                    }else{
                        subthings.push(subNode)
                        let newObj = Object.assign({}, subNode)
                        let nodeInfo = {data: newObj,
                                        from: fromID,
                                        prop: refsToTraverse[i]}
                        let arrObj = Object.assign({}, idRef, nodeInfo)
                        arr[inc].push(arrObj)
                    }
                })
            node[refsToTraverse[i]] = Gun.obj.copy(subthings)
            }
        }
        //console.log(node)
        //console.log(arr)
        for (let i = 0; i < refsToTraverse.length; i++){
            if (node[refsToTraverse[i]]){
                for (let j = 0; j < node[refsToTraverse[i]].length; j++){
                let nextLevel = node[refsToTraverse[i]][j]
                assembleTree(gun, nextLevel, idRef.id, archived, max, inc, arr);//fires for each prop with refs, and once for each ref on said prop
                }
            }
        }
    }
    //accumulate math?
    return res; // Should return the full tree
}

function reduceRight(treeArr, method , acc){
    acc = acc || false //accumulate all mapper returns to single value, if false, will tree reduce
    let reduced = 0
    let calcArr = JSON.parse(JSON.stringify(treeArr))//?
    treeArr.push(calcArr)
    for (let i = calcArr.length-1; i > -1; i--){
        for (let j = 0; j < calcArr[i].length; j++){
            let node = (calcArr[i][j].data) ? calcArr[i][j].data : calcArr[i][j]//?
            let fromID = calcArr[i][j].from
            let fromProp = calcArr[i][j].prop
            if(node && !node['!DELETED']){
                let mapper = GB[node['!TYPE']]["methods"][method]
                let res = mapper(node)
                reduced += res
                console.log(calcArr[i][j])
                calcArr[i][j].data = res//?
                //let parent = _.find(calcArr[i-1], ['id', fromID])
                let parent = (calcArr[i-1]) ? calcArr[i-1].find(function(i){
                    return i.id == fromID
                }) : undefined
                if(!parent){
                    console.log(reduced)
                    treeArr = res
                }else{
                    if(typeof parent.data[fromProp] !== 'number'){//if it is a ref, replace with first value
                    parent.data[fromProp] = res
                    }else{
                        parent.data[fromProp] += res //if not a ref, then take old value and add it to new value
                        console.log(calcArr)
                    }
                }
            }
        }
    }
    let ret = (acc) ? reduced : treeArr
    return ret
}
function generateTreeObj(startNodeID, opt){
    let gun = this.back(-1)
    let archived = (opt) ? opt.archived || false : false
    let max = (opt) ? opt.max || undefined : undefined
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
    let tree = gunGet(gun,startNodeID).then(parentNode =>{
        let copy = Gun.obj.copy(parentNode) 
        return assembleTree(gun, copy, startNodeID, archived, max)})
    return tree
}
function generateTreeArr(startNodeID, max, archived){
    let gun = this.back(-1)
    archived = archived || false
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
	let parentNode
	gun.get(startNodeID).on(e => parentNode = Gun.obj.copy(e))
    let tree = assembleTree(gun, parentNode, startNodeID, archived, max)//?
    return tree[1]
}
function treeReduceRight(startNodeID, method, acc, max){
    let gun = this.back(-1)
    if (startNodeID['_']['$']){startNodeID = startNodeID['_']['soul']}
	let parentNode
	gun.get(startNodeID).on(e => parentNode = Gun.obj.copy(e))
    let tree = assembleTree(gun, parentNode, startNodeID, false, max)//?
    let methodCalc = reduceRight(tree[1], method, acc)
    return methodCalc
}

//Tree Logic


function reLinkNext(nextType, linkProp, prevType, nextData){
    //nextData should acutally be orevData
    //this one is a mess, it will make no sense reading it
    //it is c&p of reLinkPrev with changes made to check
    //should rename variables so it is not confusing
    let gun = this.back(-1)
    let prevNextLink = Object.keys(GB[prevType].next)[0]
    let importID = GB[prevType].nav.importID
    let nextGet = '!TYPE/' + nextType + '/!ALIAS'
    let prevGet = '!TYPE/' + prevType + '/!ALIAS'
    let prevLinks = '!TYPE/' + prevType
    //let nextIDs = gunGetListProp(gun, nextGet, '!ID')
    let next = gunGet(gun, nextGet)
    let prev = gunGet(gun, prevGet)
    let nodes = gunGetListNodes(gun,prevLinks)
    let links = nodes.then(data =>{
        return Promise.all(data.map(function(curr, idx){
            const linksoul = curr[prevNextLink]['#']
            if(linksoul){
                return gunGet(gun,linksoul)
            }else{
                return curr[prevNextLink]
            }
        }))
    })
    let curLinks = Promise.all([nodes,links]).then(data =>{
        let [nodes, links] = data
        return nodes.reduce(function(acc,curr,idx){
            let soul = curr[importID]
            acc[soul] = links[idx]
            return acc
        },{})

    })
    Promise.all([next, prev, curLinks])
        .then(data => {
            let [nobj ,pobj, prevs] = data
            let nout = {}
            let missing = {}
            let nextLinks = {}

            for (let i = 0; i < nextData.length; i++) {

                const key = pobj[nextData[i][importID]]['#'];
                const value = nextData[i][prevNextLink]
                const existing = prevs[nextData[i][importID]]
                if(((typeof value === 'string' && value.length) || typeof value === 'number') || value === null){
                    if(typeof value !== 'string'){
                        let not = []
                        not.push(value)
                        nout[key] = not
                    }else if (typeof value == 'string'){
                        let idx = value.lastIndexOf(',') + 7
                        let check = value[idx]
                        if(!check){
                            let not = []
                            not.push(value)
                            nout[key] = not  
                        }else{
                        let arr = value.split(', ')
                        nout[key] = arr
                        }
                    }
                }
                let thisN = nout[key]
                
                if(thisN && thisN.length){
                    for (let i = 0; i < thisN.length; i++) {
                        
                        const link = thisN[i];
                        const linkalias = nobj[link]['#']

                        if(!existing[linkalias]){
                            if(!Array.isArray(missing[key])){
                                missing[key] = []
                                missing[key].push(link)
                            }else{
                                missing[key].push(link)
                            }
                        }
                        if(!Array.isArray(nextLinks[key])){
                            nextLinks[key] = []
                            nextLinks[key].push(link)
                        }else{
                            nextLinks[key].push(link)
                        }
                    }
                }
            }
            //missing object is all missing prev links
            console.log(missing)
            let puts = {} 
            for (const nkey in missing) {
                const links = missing[nkey];
                puts[nkey] = []
                for (let i = 0; i < links.length; i++) {
                    let link = links[i];
                    if (link[0] == '"'){
                        link = link.slice(1, -1)
                    }
                    let prevKey = (nobj[link]) ? nobj[link]['#'] || false : false
                    //console.log(prevKey)
                    if(prevKey){
                        gun.get(nkey).get(prevNextLink).put({})
                        gun.get(nkey).get(prevNextLink).get(prevKey).put({'#': prevKey})
                        console.log(nkey, link)

                    }else{
                        console.log(link)
                    }
                }
            }
        })
}
function reLinkPrev(nextType, linkProp, prevType, nextData){
    let gun = this.back(-1)
    let prevNextLink = Object.keys(GB[prevType].next)[0]
    let importID = GB[nextType].nav.importID
    let nextGet = '!TYPE/' + nextType + '/!ALIAS'
    let prevGet = '!TYPE/' + prevType + '/!ALIAS'
    let prevLinks = '!TYPE/' + nextType
    //let nextIDs = gunGetListProp(gun, nextGet, '!ID')
    let next = gunGet(gun, nextGet)
    let prev = gunGet(gun, prevGet)
    let nodes = gunGetListNodes(gun,prevLinks)
    let links = nodes.then(data =>{
        return Promise.all(data.map(function(curr, idx){
            const linksoul = curr[linkProp]['#']
            if(linksoul){
                return gunGet(gun,linksoul)
            }else{
                return curr[linkProp]
            }
        }))
    })
    let curLinks = Promise.all([nodes,links]).then(data =>{
        let [nodes, links] = data
        return nodes.reduce(function(acc,curr,idx){
            let soul = curr[importID]
            acc[soul] = links[idx]
            return acc
        },{})

    })
    Promise.all([next, prev, curLinks])
        .then(data => {
            let [nobj ,pobj, prevs] = data
            let nout = {}
            let missing = {}
            let nextLinks = {}

            for (let i = 0; i < nextData.length; i++) {

                const key = nobj[nextData[i][importID]]['#'];
                const value = nextData[i][linkProp]
                const existing = prevs[nextData[i][importID]]
                if(((typeof value === 'string' && value.length) || typeof value === 'number') || value === null){
                    if(typeof value !== 'string'){
                        let not = []
                        not.push(value)
                        nout[key] = not
                    }else if (typeof value == 'string'){
                        let idx = value.lastIndexOf(',') + 7
                        let check = value[idx]
                        if(!check){
                            let not = []
                            not.push(value)
                            nout[key] = not  
                        }else{
                        let arr = value.split(', ')
                        nout[key] = arr
                        }
                    }
                }
                let thisN = nout[key]
                
                if(thisN && thisN.length){
                    for (let i = 0; i < thisN.length; i++) {
                        
                        const link = thisN[i];
                        const linkalias = pobj[link]['#']

                        if(!existing[linkalias]){
                            if(!Array.isArray(missing[key])){
                                missing[key] = []
                                missing[key].push(link)
                            }else{
                                missing[key].push(link)
                            }
                        }
                        if(!Array.isArray(nextLinks[key])){
                            nextLinks[key] = []
                            nextLinks[key].push(link)
                        }else{
                            nextLinks[key].push(link)
                        }
                    }
                }
            }
            //missing object is all missing prev links
            //console.log(missing)
            let puts = {} 
            for (const nkey in missing) {
                const links = missing[nkey];
                puts[nkey] = []
                for (let i = 0; i < links.length; i++) {
                    let link = links[i];
                    if (link[0] == '"'){
                        link = link.slice(1, -1)
                    }
                    let prevKey = (pobj[link]) ? pobj[link]['#'] || false : false
                    if(prevKey){
                        //gun.get(key).get(linkProp).link(gun.get(prevKey))
                        puts[nkey].push(prevKey)
                        gun.get(nkey).get(linkProp).get(prevKey).put({'#': prevKey})
                        gun.get(prevKey).get(prevNextLink).get(nkey).put({'#': nkey})
                        //console.log(key,link,prevKey)
                    }else{
                        //console.log(link)
                    }
                }
            }
        })
}   

function linkImport(nextType, linkProp, prevType){
    let gun = this.back(-1)
    let prevNextLink = Object.keys(GB[prevType].next)[0]
    let nextGet = '!TYPE/' + nextType
    let prevGet = '!TYPE/' + prevType + '/!ALIAS'
    //let nextIDs = gunGetListProp(gun, nextGet, '!ID')
    let next = gunGetListNodes(gun, nextGet)
    let prev = gunGet(gun, prevGet)
    Promise.all([next, prev])
        .then(data => {
            console.log(data)
            let [nodes ,pobj] = data
            let nout = {}
            var pout = {}


            for (let i = 0; i < nodes.length; i++) {
                const key = nodes[i]['!ID'];
                const value = nodes[i][linkProp]
                if(((typeof value === 'string' && value.length) || typeof value === 'number') || value === null){
                    let fullkey = nextType + '/' + key
                    if(typeof value !== 'string'){
                        let not = []
                        not.push(value)
                        nout[fullkey] = not
                    }else if (typeof value == 'string'){
                        let idx = value.lastIndexOf(',') + 7
                        let check = value[idx]
                        if(!check){
                            let not = []
                            not.push(value)
                            nout[fullkey] = not  
                        }else{
                        let arr = value.split(', ')
                        nout[fullkey] = arr
                        }
                    }
                }
            }
            let puts = {} 
            for (const nkey in nout) {
                const links = nout[nkey];
                puts[nkey] = []
                for (let i = 0; i < links.length; i++) {
                    let link = links[i];
                    if (link[0] == '"'){
                        link = link.slice(1, -1)
                    }
                    let prevKey = (pobj[link]) ? pobj[link]['#'] || false : false
                    if(prevKey){
                        //gun.get(key).get(linkProp).link(gun.get(prevKey))
                        puts[nkey].push(prevKey)
                        gun.get(nkey).get(linkProp).put({})
                        gun.get(nkey).get(linkProp).get(prevKey).put({'#': prevKey})
                        gun.get(prevKey).get(prevNextLink).put({})
                        gun.get(prevKey).get(prevNextLink).get(nkey).put({'#': nkey})
                        //console.log(key,link,prevKey)
                    }else{
                        console.log(link)
                    }
                }
            }
            console.log(nout, puts)
        })
}   
async function cascade(method, curNode, doSettle){
    let currentNode = Gun.obj.copy(curNode)
    if(doSettle == undefined){
        doSettle = true
    }
    let gun = this.back(-1)
    console.log('cascading: ', method)
    let type = currentNode['!TYPE']
    let nodeSoul = type + '/' + currentNode['!ID']
    let next = Object.keys(GB[type].next)[0]
    let nextSet = currentNode[next]['#']
    let prevsForCalc = GB[type].methods[method].fields
    let prevs = Object.keys(prevsForCalc)
    let methodFn = GB[type].methods[method].fn
    let prevNodes = []

    for (let i = 0; i < prevs.length; i++) {
        const prop = prevs[i];
        let cur = prevNodes[i];
        const prevProp = prevsForCalc[prevs[i]]
        if(currentNode[prop] && typeof currentNode[prop] === 'object'){
            cur = await gunGetListNodes(gun,currentNode[prop]['#'])
        }else{
            cur = currentNode[prop]
        }
        if(Array.isArray(cur)){
            let curRed = cur.reduce(function(acc,node,idx){
                let num = (Number(node[prevProp])) ? Number(node[prevProp]) : 0
                acc += num
                return acc
            }, 0)
            currentNode[prop] = curRed
        }else{
            currentNode[prop] = cur
        }
    }
    console.log(currentNode)
    let fnres = methodFn(currentNode)
    if(!doSettle){
        let mutate = Object.assign({}, currentNode, fnres)
        return mutate
    }else{
        gun.get(nodeSoul).settle(fnres,{cascade:false})
        let nextNodes
        if(currentNode[next] && typeof currentNode[next] === 'object'){
            nextNodes = await gunGetListNodes(gun,nextSet)
            if(Array.isArray(nextNodes)){
                for (let i = 0; i < nextNodes.length; i++) {
                    const node = Gun.obj.copy(nextNodes[i])
                    let nextType = node['!TYPE']
                    let nextID = node['!ID']
                    let nextSoul = nextType +'/'+nextID
                    let cascadeProp = (GB[nextType].cascade) ? getKeyByValue(GB[nextType].cascade,method) : false
                    console.log('Number of next cascades:', nextNodes.length)
                    let putObj = {}
                    putObj[cascadeProp] = 0
                    let opt = {prevData: node}
                    gun.get(nextSoul).settle(putObj,opt)
                }
            }
        }
    }
}

async function settle(newData, opt) {
    let shouldCascade
    if(!opt){
        shouldCascade = true
    }else{
        shouldCascade = (opt.cascade !== undefined) ? opt.cascade : true
    }
    let gun = this;
    let gunRoot = this.back(-1);
    let nodeID = newData['!ID'] || gun['_']['soul'].split('/')[1] || null//or ID string
    let type = newData['!TYPE'] || gun['_']['soul'].split('/')[0] || null
    let nodeSoul = gun['_']['soul'] || type + '/' + nodeID//gun id 'get' string
    let aliasProp = (GB[type].nav.importID) ? GB[type].nav.humanID : false
    let alias = (aliasProp && newData[aliasProp]) ? newData[aliasProp] : false
    let cascadeKeys = (GB[type].cascade) ? GB[type].cascade : {}
    let oldData, exists
    if(opt && opt.prevData){
        oldData = opt.prevData
        exists = true
        
    }else{
        let data = await gun.then()
        oldData = Gun.obj.copy(data)
        if(oldData){
            exists = true
        }else{
            exists = false
        }
    }
    if (exists){
        if(!GB[type]){
            if(oldData['!TYPE']){
                if(!GB[oldData['!TYPE']]){
                    return console.log('INVALID NODETYPE')
                }else{
                    type = oldData['!TYPE']
                }
            }else{
                return console.log('INVALID NODETYPE')
            }
        }
        //if the node already exists
        let result = GB[type].settle(newData,oldData)
        let triggeredMethods = {}
        console.log(result.putObj)
        for(const key in result.putObj){
            if(!GB[type].whereTag.includes(key) || key == '_'){//skip tag fields, tags() handles this
                gun.get(key).put(result.putObj[key])
            }
            if(cascadeKeys[key]){
                triggeredMethods[cascadeKeys[key]] = key
            }
        }
        if(shouldCascade){
            let newObj = Object.assign({},oldData,result.putObj)
            for (const method in triggeredMethods) {
                gunRoot.cascade(method, newObj)
            }
        }
        handleTags(gun, result, type)
    }else{
        if(!GB[type]){return console.log('INVALID NODETYPE')}
        //for a new node
        gun.get('!ID').put(nodeID)
        gunRoot.get('!TYPE/'+type).get(nodeSoul).put({'#':nodeSoul}) //setlist collection of same type nodes
        if (alias){
            gunRoot.get('!TYPE/'+type + '/!ALIAS').get(alias).put({'#': nodeSoul}) //setlist keyd by importID
        }
        if (GB[type].uniqueFields){
            let fields = GB[type].uniqueFields
            for (let i = 0; i < fields.length; i++) {
                let gs = '!TYPE/'+ type + '/uniqueFields'
                let field = Object.keys(fields[i])[0]
                if (!newData[field]){
                    let curNum = await gunRoot.get(gs).get(field).then()
                    if (curNum){
                        gun.get(field).put(curNum)
                        curNum++
                        gunRoot.get(gs).get(field).put(curNum)
                    }else{
                        curNum = GB[type].uniqueFields[i][field].start
                        gun.get(field).put(curNum)
                        curNum++
                        gunRoot.get(gs).get(field).put(curNum)
                    }
                }
            }
        }
        let result = GB[type].settle(newData,false)
        for(const key in result.putObj){
            if(!GB[type].whereTag.includes(key) || key == '_'){//skip tag fields and gun fields, tag() handles this
                gun.get(key).put(result.putObj[key])
            }else{
                if (newData[key] && typeof newData[key] == 'string' && newData[key].length){
                    result[key].add = result[key].add.concat(newData[key].split(','))
                }else if (newData[key] && Array.isArray(newData[key])){
                    result[key].add = result[key].add.concat(newData[key])
                }
            }
        }
        handleTags(gun, result, type) 
    }
    return gunRoot.get(nodeSoul)
}

function doubleLink(target){//intended to be used in place of .set. Target should be a gun.get("nodeType/00someID00")
    console.log('Linking!')
    let gun = this;
    let fromProp = gun['_']['get'] || false//gun id last 'get', should be a prop of a known nodeType
    console.log(gun)
    let nodeSoul = gun['_']['soul'] || false //should be undefined > false if they 'get' to a setlist node
    if(nodeSoul){
        return console.log('Must select a property of a node with known nodeType, not the node itself. ie; .get("nodeType/00someID00").get("property").link(node)')}
    let check = new Promise( (resolve, reject) => {
        let exist =  gun.back().then()
        resolve(exist)
    })
    let targetProm = new Promise( (resolve, reject) => {
        let exist =  target.then()
        resolve(exist)
    })
    Promise.all([check,targetProm]).then( linkNodes => {
        let fromNode = Gun.obj.copy(linkNodes[0])
        let targetNode = Gun.obj.copy(linkNodes[1])
        console.log(fromNode)
        console.log(targetNode)
        if (fromNode){
            if(!fromNode[fromProp] || typeof fromNode[fromProp] !== 'object' || fromNode[fromProp] === null){gun.put({})}
            let parentType = fromNode['!TYPE']
            let parentNodeSoul = Gun.node.soul(fromNode)
            if(!GB[parentType]){return console.log('INVALID PARENT NODETYPE', parentType)}
            if (targetNode){
                //console.log(targetNode)
                let targetType = targetNode['!TYPE']
                let targetNodeSoul = Gun.node.soul(targetNode)
                if(!GB[targetType]){return console.log('INVALID TARGET NODETYPE')}
                //if the node already exists and is of known type
                    //Make sure the link is coming from a 'prev' key
                        //if not, invert parent and target, check again
                        //if not, error out
                let parentNextKey = Object.keys(GB[parentType]['next'])[0] //should only ever be a sinlge next key
                if(fromProp == parentNextKey){//if we are coming from the prev node (wrong way, should link down the tree)
                    let fromChoices = Object.values(GB[targetType]['prev'])
                    if(fromChoices.includes(fromProp)){
                        if(!target[inverseProp] || typeof target[inverseProp] !== 'object' || target[inverseProp] === null){target.get(inverseProp).put({})}
                        let inverseProp = getKeyByValue(GB[targetType]['prev'], fromProp)//find correct prop to link prev node to
                        target.get(inverseProp).get(parentNodeSoul).put({'#':parentNodeSoul}) //set
                        gun.get(targetNodeSoul).put({'#': targetNodeSoul})//double set
                        }else{
                            return console.log('cannot link a next property, needs to be a prev property')
                        }
                }else{
                    let targetNextProp = Object.keys(GB[targetType]['next'])[0] //should only ever be a sinlge next key
                    if(!target[targetNextProp] || typeof target[targetNextProp] !== 'object' || target[targetNextProp] === null){
                        target.get(targetNextProp).put({},function(ack){
                            //correct orientation was entered
                            gun.get(targetNodeSoul).put({'#':targetNodeSoul}) //set
                            //console.log(targetNodeSoul)
                            target.get(targetNextProp).get(parentNodeSoul).put({'#':parentNodeSoul})//double set
                        })}else{
                            //correct orientation was entered
                            gun.get(targetNodeSoul).put({'#':targetNodeSoul}) //set
                            //console.log(targetNodeSoul)
                            target.get(targetNextProp).get(parentNodeSoul).put({'#':parentNodeSoul})//double set
                        }
                    }
                }else{
                    //no data
                    return console.log('TARGET NODE DOES NOT EXIST')
                }
        }else{
            //no data
            return console.log('FROM NODE DOES NOT EXIST')
        }
    })
    return gun
}
function doubleUnlink(target){//intended to be used in place of .set. Target should be a gun.get("nodeType/00someID00")
    let gun = this;
    let fromProp = gun['_']['get'] || false//gun id last 'get', should be a prop of a known nodeType
    let nodeSoul = gun['_']['soul'] || false //should be undefined > false if they 'get' to a setlist node
    if(nodeSoul){return console.log('Must select a property of a node with known nodeType, not the node itself. ie; .get("nodeType/00someID00").get("property").link(node)')}
    let check = new Promise( (resolve, reject) => {
        let exist =  gun.back().then()
        resolve(exist)
    })
    let targetProm = new Promise( (resolve, reject) => {
        let exist =  target.then()
        resolve(exist)
    })
    check.then( (fromNode) => {
        if (fromNode){
            if(!fromNode[fromProp] || typeof fromNode[fromProp] !== 'object' || fromNode[fromProp] === null){gun.put({})}
            let parentType = fromNode['!TYPE']
            let parentNodeSoul = Gun.node.soul(fromNode)
            if(!GB[parentType]){return console.log('INVALID NODETYPE')}
            targetProm.then( (targetNode) => {
                if (targetNode){
                    let targetType = targetNode['!TYPE']
                    let targetNodeSoul = Gun.node.soul(targetNode)
                    if(!GB[targetType]){return console.log('INVALID TARGET NODETYPE')}
                    //if the node already exists and is of known type
                        //Make sure the link is coming from a 'prev' key
                            //if not, invert parent and target, check again
                            //if not, error out
                    let parentNextKey = Object.keys(GB[parentType]['next'])[0] //should only ever be a sinlge next key
                    if(fromProp == parentNextKey){//if we are coming from the prev node (wrong way, should link down the tree)
                        let fromChoices = Object.values(GB[targetType]['prev'])
                        if(fromChoices.includes(fromProp)){
                            let inverseProp = getKeyByValue(GB[targetType]['prev'], fromProp)//find correct prop to link prev node to
                            target.get(inverseProp).get(parentNodeSoul).put(null) //set
                            gun.get(targetNodeSoul).put(null)//double set
                            }else{
                                return console.log('cannot link a next property, needs to be a prev property')
                            }
                    }else{
                        let targetNextProp = Object.keys(GB[targetType]['next'])[0] //should only ever be a sinlge next key
                        if(!target[targetNextProp] || typeof target[targetNextProp] !== 'object' || target[targetNextProp] === null){target.get(targetNextProp).put({})}
                        //correct orientation was entered
                        gun.get(targetNodeSoul).put(null) //set
                        target.get(targetNextProp).get(parentNodeSoul).put(null)//double set
                        }
                }else{
                    //no data
                    return console.log('TARGET NODE DOES NOT EXIST')
                }
            })  
        }else{
            //no data
            return console.log('FROM NODE DOES NOT EXIST')
        }
    })
    return gun
}