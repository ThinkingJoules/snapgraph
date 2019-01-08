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
var nodeTypes = {alias: false, sort: false, vis: false, schema: false}
if (!Gun)
	throw new Error("gundb-wrangle: Gun was not found globally!");

wrangle(Gun.chain);

function wrangle(gun) {
    gun.newThingType = newThingType
    gun.newThingTypeProp = newThingTypeProp
    gun.addNodeTypes = addNodeTypes;
    gun.newNode = newNode;
    gun.settle = settle;
    //gun.getTree = generateTreeObj//returns object tree
    //gun.getTreeArray = generateTreeArr//returns array of levels in tree, work from right to left to go from bottom to top.
    //gun.treeReduceRight = treeReduceRight//would need options to map forward or backwards? Only bottom up?
    //gun.archiveTag = archiveTag//set tag to 0 in visibility lists
    //gun.getTagged = getTagged//(tags, prop, type), last two are optional, tags can be an array for intersect
    //gun.tags = getTags
    gun.link = doubleLink //like a set to the 'child'/'prev' this also creates a back link on the child back to 'parent'/'next'
    gun.unlink = doubleUnlink//opposite of link
    gun.archive = archive
    gun.unarchive = unarchive
    gun.delete = deleteNode
    gun.cascade = cascade

    gun.massNewPut = massNewPut
    gun.rePut = rePut
    gun.linkImport = linkImport
    gun.importSettle = importSettle
    gun.reLinkPrev = reLinkPrev
    gun.reLinkNext = reLinkNext

    gun.getListNodes = getListNodes
    gun.getFilteredList = getFilteredList
}

//utility helpers
function newThingType(nodeType){
    let gun = this
    let type = Object.keys(nodeTypes['alias']).find(function(key){
        let test = /p/i.test(key)
        if(!test){
            return nodeTypes['alias'][key] === nodeType
        }
    })
    if (type){
        console.log('THING TYPE ALREADY USED')
    }else{
        let nextID = nextIndex(nodeTypes['alias'],'t')
        gun.get('thing/alias').get(nextID).put(nodeType)
    }
}
function newThingTypeProp(nodeType,prop){
    let gun = this
    let type = Object.keys(nodeTypes['alias']).find(function(key){
        let test = /p/i.test(key)
        if(!test){
            return nodeTypes['alias'][key] === nodeType
        }
    })
    let property = Object.keys(nodeTypes['alias']).find(function(key){
        let test = type + "p\\d+"
        let re = new RegExp(test)
        let found = key.match(re)
        if(found !== null){
            return nodeTypes['alias'][key] === prop
        }
    })
    if (type && property){
        console.log('THING TYPE PROP ALREADY USED')
    }else if(!type && property){
        console.log('INVALID THING TYPE, PROP ALREADY EXISTS')
    }else if(!type && !property){
        console.log('INVALID THING TYPE')
    }else{
        let nextTypeProp = type + 'p'
        let nextID = nextIndex(nodeTypes['alias'], nextTypeProp)
        gun.get('thing/alias').get(nextID).put(prop)
    }
}
async function getListNodes(setListID){
    gun = this.back(-1)
    let ids = await gunGetListNodes(gun, setListID)
    return ids
}
async function getFilteredList(setListID, prop, exist){
    gun = this.back(-1)
    let ids = await gunFilteredNodes(gun, setListID, prop, exist)
    return ids
}
function rePut(type, keylen, data){
    console.log('starting rePut')
    let gun = this.back(-1)
    let get = '!TYPE/' + type
    let hid = nodeTypes[type].nav.humanID
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
function reLinkNext(nextType, linkProp, prevType, nextData){
    //nextData should acutally be orevData
    //this one is a mess, it will make no sense reading it
    //it is c&p of reLinkPrev with changes made to check
    //should rename variables so it is not confusing
    let gun = this.back(-1)
    let prevNextLink = Object.keys(nodeTypes[prevType].next)[0]
    let importID = nodeTypes[prevType].nav.importID
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
    let prevNextLink = Object.keys(nodeTypes[prevType].next)[0]
    let importID = nodeTypes[nextType].nav.importID
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
    let prevNextLink = Object.keys(nodeTypes[prevType].next)[0]
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
function importSettle (newData){
    let gun = this;
    let gunRoot = this.back(-1);
    let nodeID = newData['!ID'] || gun['_']['soul'].split('/')[1] || null//or ID string
    let type = newData['!TYPE'] || gun['_']['soul'].split('/')[0] || null
    let nodeSoul = gun['_']['soul'] || type + '/' + nodeID//gun id 'get' string
    let aliasProp = (nodeTypes[type].nav.importID) ? nodeTypes[type].nav.humanID : false
    let alias = (aliasProp && newData[aliasProp]) ? newData[aliasProp] : false

    if(!nodeTypes[type]){return console.log('INVALID NODETYPE')}
    //for a new node
    gun.get('!ID').put(nodeID)
    gunRoot.get('!TYPE/'+type).get(nodeSoul).put({'#':nodeSoul}) //setlist collection of same type nodes
    if (alias){
        gunRoot.get('!TYPE/'+type + '/!ALIAS').get(alias).put({'#': nodeSoul}) //setlist keyd by importID
    }
    let result = nodeTypes[type].settle(newData,false)
    let obj = {}
    for(let key in result.putObj){
        if(!nodeTypes[type].whereTag.includes(key)){//skip tag fields, tag() handles this
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
async function cascade(method, curNode, doSettle){
    let currentNode = Gun.obj.copy(curNode)
    if(doSettle == undefined){
        doSettle = true
    }
    let gun = this.back(-1)
    console.log('cascading: ', method)
    let type = currentNode['!TYPE']
    let nodeSoul = type + '/' + currentNode['!ID']
    let next = Object.keys(nodeTypes[type].next)[0]
    let nextSet = currentNode[next]['#']
    let prevsForCalc = nodeTypes[type].methods[method].fields
    let prevs = Object.keys(prevsForCalc)
    let methodFn = nodeTypes[type].methods[method].fn
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
                    let cascadeProp = (nodeTypes[nextType].cascade) ? getKeyByValue(nodeTypes[nextType].cascade,method) : false
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
    let aliasProp = (nodeTypes[type].nav.importID) ? nodeTypes[type].nav.humanID : false
    let alias = (aliasProp && newData[aliasProp]) ? newData[aliasProp] : false
    let cascadeKeys = (nodeTypes[type].cascade) ? nodeTypes[type].cascade : {}
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
        if(!nodeTypes[type]){
            if(oldData['!TYPE']){
                if(!nodeTypes[oldData['!TYPE']]){
                    return console.log('INVALID NODETYPE')
                }else{
                    type = oldData['!TYPE']
                }
            }else{
                return console.log('INVALID NODETYPE')
            }
        }
        //if the node already exists
        let result = nodeTypes[type].settle(newData,oldData)
        let triggeredMethods = {}
        console.log(result.putObj)
        for(const key in result.putObj){
            if(!nodeTypes[type].whereTag.includes(key) || key == '_'){//skip tag fields, tags() handles this
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
        if(!nodeTypes[type]){return console.log('INVALID NODETYPE')}
        //for a new node
        gun.get('!ID').put(nodeID)
        gunRoot.get('!TYPE/'+type).get(nodeSoul).put({'#':nodeSoul}) //setlist collection of same type nodes
        if (alias){
            gunRoot.get('!TYPE/'+type + '/!ALIAS').get(alias).put({'#': nodeSoul}) //setlist keyd by importID
        }
        if (nodeTypes[type].uniqueFields){
            let fields = nodeTypes[type].uniqueFields
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
                        curNum = nodeTypes[type].uniqueFields[i][field].start
                        gun.get(field).put(curNum)
                        curNum++
                        gunRoot.get(gs).get(field).put(curNum)
                    }
                }
            }
        }
        let result = nodeTypes[type].settle(newData,false)
        for(const key in result.putObj){
            if(!nodeTypes[type].whereTag.includes(key) || key == '_'){//skip tag fields and gun fields, tag() handles this
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
            if(!nodeTypes[parentType]){return console.log('INVALID PARENT NODETYPE', parentType)}
            if (targetNode){
                //console.log(targetNode)
                let targetType = targetNode['!TYPE']
                let targetNodeSoul = Gun.node.soul(targetNode)
                if(!nodeTypes[targetType]){return console.log('INVALID TARGET NODETYPE')}
                //if the node already exists and is of known type
                    //Make sure the link is coming from a 'prev' key
                        //if not, invert parent and target, check again
                        //if not, error out
                let parentNextKey = Object.keys(nodeTypes[parentType]['next'])[0] //should only ever be a sinlge next key
                if(fromProp == parentNextKey){//if we are coming from the prev node (wrong way, should link down the tree)
                    let fromChoices = Object.values(nodeTypes[targetType]['prev'])
                    if(fromChoices.includes(fromProp)){
                        if(!target[inverseProp] || typeof target[inverseProp] !== 'object' || target[inverseProp] === null){target.get(inverseProp).put({})}
                        let inverseProp = getKeyByValue(nodeTypes[targetType]['prev'], fromProp)//find correct prop to link prev node to
                        target.get(inverseProp).get(parentNodeSoul).put({'#':parentNodeSoul}) //set
                        gun.get(targetNodeSoul).put({'#': targetNodeSoul})//double set
                        }else{
                            return console.log('cannot link a next property, needs to be a prev property')
                        }
                }else{
                    let targetNextProp = Object.keys(nodeTypes[targetType]['next'])[0] //should only ever be a sinlge next key
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
            if(!nodeTypes[parentType]){return console.log('INVALID NODETYPE')}
            targetProm.then( (targetNode) => {
                if (targetNode){
                    let targetType = targetNode['!TYPE']
                    let targetNodeSoul = Gun.node.soul(targetNode)
                    if(!nodeTypes[targetType]){return console.log('INVALID TARGET NODETYPE')}
                    //if the node already exists and is of known type
                        //Make sure the link is coming from a 'prev' key
                            //if not, invert parent and target, check again
                            //if not, error out
                    let parentNextKey = Object.keys(nodeTypes[parentType]['next'])[0] //should only ever be a sinlge next key
                    if(fromProp == parentNextKey){//if we are coming from the prev node (wrong way, should link down the tree)
                        let fromChoices = Object.values(nodeTypes[targetType]['prev'])
                        if(fromChoices.includes(fromProp)){
                            let inverseProp = getKeyByValue(nodeTypes[targetType]['prev'], fromProp)//find correct prop to link prev node to
                            target.get(inverseProp).get(parentNodeSoul).put(null) //set
                            gun.get(targetNodeSoul).put(null)//double set
                            }else{
                                return console.log('cannot link a next property, needs to be a prev property')
                            }
                    }else{
                        let targetNextProp = Object.keys(nodeTypes[targetType]['next'])[0] //should only ever be a sinlge next key
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

function newNode(nodeType){
    let gun = this
    let id = Gun.text.random(24)
    let type = Object.keys(nodeTypes['alias']).find(function(key){
        let test = /p/i.test(key)
        if(!test){
            return nodeTypes['alias'][key] === nodeType
        }
    })
    gun.get(type + '/' + id)
    if (type){
        //gun.get('!ID').put(id) // save for settle, in case it doesn't get created
        return gun.get(type + '/' + id)
    }else{
        console.log('INVALID THING TYPE')
    }
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
        let props = nodeTypes[type].whereTag
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
        let props = nodeTypes[type].whereTag
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
        let nextKey = Object.keys(nodeTypes[fromType]['next'])[0] //should only ever be a sinlge next key
        let prevKeys = Object.keys(nodeTypes[fromType]['prev'])
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
function addNodeTypes(nodeTypesObj) {
    for (const key in nodeTypesObj) {
        if(key !== '_'){
            nodeTypes[key] = JSON.parse(nodeTypesObj[key]);
        }
    }

    console.log(nodeType)
    

}

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
    let refsToTraverse = Object.keys(nodeTypes[node['!TYPE']]['prev'])
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
                let mapper = nodeTypes[node['!TYPE']]["methods"][method]
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
