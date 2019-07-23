'use strict'
const {getValue, setValue, makeSoul, parseSoul,DATA_INSTANCE_NODE,configPathFromChainPath,gunGet,gunPut} = require('../gbase_core/util.js')
function getBlockTime(unix){
  let date = new Date(unix)
  //console.log(date.toString())
  let granArr = granularDate(date)
  let i = 0
  let out = []
  for (const val of granArr) {
    if(i===1){
      out.push(val-1)//undo granular date, back to 0 index on month
    }else if(i>2){//make hours, minutes, seconds, millis === 0
      out.push(0)
    }else{//push i == 2, day
      out.push(val)
    }
    i++
  }
  let mid = new Date(Date.UTC(...out))
  //console.log(unix, granArr, mid.toString())

  return mid.getTime()
}


const relationIndex = (gun,relationSoul, srcTypeID, trgtTypeID, idxDate, opts) =>{
  //relationSoul = must be !-$ soul
  //idxData = Must be unique for the entire index, this is the string (usually a gun soul) that you are indexing at ...VV
  //idxDate = This is the timestamp you are indexing the idxData at. 
  let root = gun.back(-1)
  let {b,r} = parseSoul(relationSoul)
  let {archive, deleteThis} = opts
  let idxSoul = makeSoul({b,r,':':true})
  let soulObj = {b,r,'>':srcTypeID,'<':trgtTypeID}
  let idIdx = makeSoul(Object.assign({},soulObj,{':':true}))
  let blockIdxSoul = makeSoul(soulObj)
  const get = gunGet(gun)
  const put = gunPut(gun)
  let idxData = relationSoul
  idxDate = idxDate || Date.now() //index as 'now' such for creation
  if (!(idxDate instanceof Date) || isNaN(idxDate*1)){ // TODO: Do magic
    console.warn('Warning: Improper idxDate used. Must be a Date Object or unix time')
  }
  if(idxDate instanceof Date)idxDate = idxDate.getTime()
  let correctBlock = getBlockTime(idxDate)
  const correctSoul = makeSoul(Object.assign({},soulObj,{':':correctBlock}))
  //console.log(correctBlock,correctSoul)
  gun.get(idIdx).get(relationSoul).once(function(prevIdx) {
    if (prevIdx !== undefined){//false old index in case of edit
      let oldSoul = makeSoul(Object.assign({},soulObj,{':':getBlockTime(prevIdx)}))
      put(oldSoul,{[idxData]: false})
      //root.get(oldSoul).put({[idxData]: false})
    }
    if(archive || deleteThis)return
    //at this point we are editing.
    gun.get(blockIdxSoul).once(function(allBlocks) {//new idxData, check last block time to see if we add to that block or create new block
      if(allBlocks !== undefined){
        if(allBlocks[correctSoul]!== undefined){//add to existing block
          //root.get(correctSoul).put({[idxData]:idxDate})
          put(correctSoul,{[idxData]:idxDate})
        }else{//make new block 
          newBlock(allBlocks)
        }
        //root.get(idIdx).put({[idxData]:idxDate})//'last' index
        put(idIdx,{[idxData]:idxDate})//'last' index
      }else{//newSoul, with new src/trgt combo
        newBranch()
      }
    })
  })

  function newBlock(blockList){
    let {head, tail} = blockList
    let list = JSON.parse(JSON.stringify(blockList))
    delete list.head; delete list.tail; delete list['_']
    let sortedList = Object.entries(list).sort((a,b)=>Math.abs(a[1]-correctBlock)-Math.abs(b[1]-correctBlock))//sorted in unix closest to blockTime 4>[5,2,1,7]
    let prevSoul,nextSoul
    for (let i = 0; i < sortedList.length; i++) {
      const [soul,unix] = sortedList[i];
      if(prevSoul !== undefined && nextSoul !==undefined)break
      if(unix>correctBlock && nextSoul === undefined){//past either limit, first value will snag one of these if statements
        if(i===0)prevSoul=null
        nextSoul = soul
      }else if(unix<correctBlock && prevSoul === undefined){
        if(i===0)nextSoul=null
        prevSoul = soul
      }
    }
    let newBlock = {prev:prevSoul ,next: nextSoul, [idxData]:idxDate}
    put(correctSoul,newBlock)
    //root.get(correctSoul).put(newBlock)//put data and prev in new block
    if(prevSoul !== null){
      //gun.get(prevSoul).put({next:correctSoul})
      put(prevSoul,{next:correctSoul})
    }
    if(prevSoul === null){
      let firstBlock = makeSoul(Object.assign({},soulObj,{':':head}))
      put(firstBlock, {prev:correctSoul})
      put(blockIdxSoul, {head:correctBlock})
      //gun.get(firstBlock).put({prev:correctSoul})
      //root.get(blockIdxSoul).put({head:correctBlock})
    }
    if(nextSoul !== null){
      //gun.get(nextSoul).put({prev:correctSoul})
      put(nextSoul,{prev:correctSoul})
    }
    if(nextSoul === null){
      let lastBlock = makeSoul(Object.assign({},soulObj,{':':tail}))
      put(lastBlock,{next:correctSoul})
      put(blockIdxSoul,{tail:correctBlock})
      //gun.get(lastBlock).put({next:correctSoul})
      //root.get(blockIdxSoul).put({tail:correctBlock})
    }
  }
  function newBranch(){
    //either src is new, or target is new, either way, same logic (one redundant put for already created source..)
    let base = {b,r,'>':srcTypeID}
    let srcSoul = makeSoul(base)
    let firstBlock = {prev:null,next:null,[idxData]:idxDate}
    put(idxSoul,{[srcTypeID]:{'#':srcSoul}})
    put(srcSoul,{[trgtTypeID]:{'#':blockIdxSoul}})
    put(blockIdxSoul,{[correctSoul]:correctBlock,tail:correctBlock,head:correctBlock})
    put(correctSoul,firstBlock)

    // root.get(idxSoul).put({[srcTypeID]:{'#':srcSoul}})
    // root.get(srcSoul).put({[trgtTypeID]:{'#':blockIdxSoul}})
    // root.get(blockIdxSoul).put({[correctSoul]:correctBlock,tail:correctBlock,head:correctBlock})
    // root.get(correctSoul).put(firstBlock)
  }
}
const getRelationNodes = (gun,relationType,srcTypeArr,trgtTypeArr,cb,opts) =>{
  //am not doing anything with date yet. For further development
  //this will get ALL IDs that meet the params of src and trgt types asked for
  //relationType is !-
  opts = opts || {}
  let {to,from} = opts
  if(to === undefined)to = Infinity
  if(from === undefined)from = -Infinity
  const MS_BLOCK_LENGTH = 1000*60*60*24
  let root = gun.back(-1)
  let {b,r} = parseSoul(relationType)
  if(!(cb instanceof Function))throw new Error('Must provide a callback')
  if(!srcTypeArr || !Array.isArray(srcTypeArr) || (Array.isArray(srcTypeArr) && !srcTypeArr.length))throw new Error('Must specify at least one source type')
  if(!trgtTypeArr || !Array.isArray(trgtTypeArr) || (Array.isArray(trgtTypeArr) && !trgtTypeArr.length))throw new Error('Must specify at least one target type')
  let toGet = srcTypeArr.length*trgtTypeID.length
  let blocks = []
  const get = gunGet(gun)
  for (let i = 0; i < srcTypeArr.length; i++) {
    const srcNodeTypeID = srcTypeArr[i]; //this will be JUST the id, no parsing needed
    for (let j = 0; j < trgtTypeID.length; j++) {
      const trgtNodeTypeID = trgtTypeID[j];
      let s = makeSoul({b,r,'>':srcNodeTypeID,'<':trgtNodeTypeID})
      get(s,false,function(blockIdx){
        //will have head, tail, and the rest is keys of block souls and values of unix times
        toGet--
        if(blockIdx !== undefined){
          for (const block in blockIdx) {
            if (['_','head','tail'].includes(block))continue
            let unixMid = blockIdx[block]
            let incl = unixMid + MS_BLOCK_LENGTH//midnight could be outside of range, but end of block might be in range
            if(incl >= from && unixMid <= to){
              blocks.push(block)
            }
          }
        }
        if(!toGet)getIDs()
        
      })     
    }
  }
  function getIDs(){
    let allIDs = []
    let toGet = blocks.length
    for (const blockSoul of blocks) {
      get(blockSoul,function(data){
        toGet--
        if(data !== undefined){
          for (const soul in data) {
            const unix = data[soul];
            if (['_','prev','next'].includes(soul) || unix === false)continue
            if(unix >= from && unix <= to)allIDs.push(soul)
            
          }
        }
        if(!toGet){
          cb(allIDs)
        }
      })      
    }
  }
}

const timeIndex = (gun) => (idxID, idxData, idxDate, opts) =>{
  //idxID = must be !# !#.$ !-.$ soul  THERE IS NO VERIFICATION ON ID OR DATA PASSED IN
  //idxData = if !# = !#$  if idx is !(#|-). then data is !(#|-)$ ...VV
  //idxDate = This is the timestamp you are indexing the idxData at. 
  let root = gun.back(-1)
  let soulObj = parseSoul(idxID)

  opts = opts || {}
  let {archive, deleteThis} = opts
  let idIdx = makeSoul(Object.assign({},soulObj,{':':true}))
  let blockIdxSoul = makeSoul(Object.assign({},soulObj,{':':'BLKIDX'}))
  idxDate = idxDate || Date.now() //index as 'now' such for creation
  if (!(idxDate instanceof Date) || isNaN(idxDate*1)){ // TODO: Do magic
    console.warn('Warning: Improper idxDate used. Must be a Date Object or unix time')
  }
  if(idxDate instanceof Date)idxDate = idxDate.getTime()
  let correctBlock = getBlockTime(idxDate)
  const correctSoul = makeSoul(Object.assign({},soulObj,{':':correctBlock}))
  //console.log(correctBlock,correctSoul)
  const get = gunGet(gun)
  const put = gunPut(gun)
  gun.get(idIdx).get(idxData).once(function(prevIdx){
    if (prevIdx !== undefined){//false old index in case of edit
      let oldSoul = makeSoul(Object.assign({},soulObj,{':':getBlockTime(prevIdx)}))
      root.get(oldSoul).put({[idxData]: false})
    }
    if(archive || deleteThis)return
    //at this point we are editing.
    gun.get(blockIdxSoul).once(function(allBlocks) {//new idxData, check last block time to see if we add to that block or create new block
      if(allBlocks !== undefined){
        if(allBlocks[correctSoul]!== undefined){//add to existing block
          root.get(correctSoul).put({[idxData]:idxDate})
        }else{//make new block 
          newBlock(allBlocks)
        }
        put(idIdx,{[idxData]:idxDate})
        //root.get(idIdx).put({[idxData]:idxDate})//'last' index
      }else{//newSoul, with new src/trgt combo
        newIndex()
      }
    })
  })
  function newBlock(blockList){
    let {head, tail} = blockList
    let list = JSON.parse(JSON.stringify(blockList))
    delete list.head; delete list.tail; delete list['_']
    let sortedList = Object.entries(list).sort((a,b)=>Math.abs(a[1]-correctBlock)-Math.abs(b[1]-correctBlock))//sorted in unix closest to blockTime 4>[5,2,1,7]
    let prevSoul,nextSoul
    for (let i = 0; i < sortedList.length; i++) {
      const [soul,unix] = sortedList[i];
      if(prevSoul !== undefined && nextSoul !==undefined)break
      if(unix>correctBlock && nextSoul === undefined){//past either limit, first value will snag one of these if statements
        if(i===0)prevSoul=null
        nextSoul = soul
      }else if(unix<correctBlock && prevSoul === undefined){
        if(i===0)nextSoul=null
        prevSoul = soul
      }
    }
    let newBlock = {prev:prevSoul ,next: nextSoul, [idxData]:idxDate}
    put(correctSoul,newBlock)
    //root.get(correctSoul).put(newBlock)//put data and prev in new block
    if(prevSoul !== null){
      put(prevSoul,{next:correctSoul})
      //gun.get(prevSoul).put({next:correctSoul})
    }
    if(prevSoul === null){
      let firstBlock = makeSoul(Object.assign({},soulObj,{':':head}))
      put(firstBlock,{prev:correctSoul})
      put(blockIdxSoul,{head:correctBlock})
      //gun.get(firstBlock).put({prev:correctSoul})
      //root.get(blockIdxSoul).put({head:correctBlock})
    }
    if(nextSoul !== null){
      put(nextSoul,{prev:correctSoul})
      //gun.get(nextSoul).put({prev:correctSoul})
    }
    if(nextSoul === null){
      let lastBlock = makeSoul(Object.assign({},soulObj,{':':tail}))
      put(lastBlock,{next:correctSoul})
      put(blockIdxSoul,{tail:correctBlock})
      //gun.get(lastBlock).put({next:correctSoul})
      //root.get(blockIdxSoul).put({tail:correctBlock})
    }
  }
  function newIndex(){
    let firstBlock = {prev:null,next:null,[idxData]:idxDate}
    put(idIdx,{[idxData]:idxDate})
    put(blockIdxSoul,{[correctSoul]:correctBlock,tail:correctBlock,head:correctBlock})
    put(correctSoul,firstBlock)
    //root.get(idIdx).put({[idxData]:idxDate})
    //root.get(blockIdxSoul).put({[correctSoul]:correctBlock,tail:correctBlock,head:correctBlock})
    //root.get(correctSoul).put(firstBlock)
  }
}

const timeLog = (gun) => (idxID, changeObj) =>{
  //idxID = Should be a dataNode soul(or any soul that you want to log edits on)
  //changeObj = partial update of what is being 'put'

  //BREAK OUT AND STORE BY PVAL!!
  let root = gun.back(-1)
  let user = root.user()
  let pub = user && user.is && user.is.pub || false
  let idxDate = new Date().getTime()
  const put = gunPut(gun)
  for (const pval in changeObj) {
    const value = changeObj[pval];
    logPval(pval,value)
  }
  
  function logPval(p,val){
    let soulObj = Object.assign({},parseSoul(idxID),{p})

    let log = JSON.stringify({who:pub,what:val})
    let blockIdxSoul = makeSoul(Object.assign({},soulObj,{';':'BLKIDX'}))
    let correctBlock = getBlockTime(idxDate)
    const correctSoul = makeSoul(Object.assign({},soulObj,{';':correctBlock}))
    gun.get(blockIdxSoul).once(function(allBlocks) {//new idxData, check last block time to see if we add to that block or create new block
      if(allBlocks !== undefined){
        if(allBlocks[correctSoul] !== undefined){//add to existing block
          //root.get(correctSoul).put({[idxDate]:log})
          put(correctSoul,{[idxDate]:log})
        }else{//make new block 
          newBlock(allBlocks)
        }
      }else{//newSoul, with new src/trgt combo
        newIndex()
      }
      function newBlock(blockList){
        let {head, tail} = blockList
        let list = JSON.parse(JSON.stringify(blockList))
        delete list.head; delete list.tail; delete list['_']
        let sortedList = Object.entries(list).sort((a,b)=>Math.abs(a[1]-correctBlock)-Math.abs(b[1]-correctBlock))//sorted in unix closest to blockTime 4>[5,2,1,7]
        let prevSoul,nextSoul
        for (let i = 0; i < sortedList.length; i++) {
          const [soul,unix] = sortedList[i];
          if(prevSoul !== undefined && nextSoul !==undefined)break
          if(unix>correctBlock && nextSoul === undefined){//past either limit, first value will snag one of these if statements
            if(i===0)prevSoul=null
            nextSoul = soul
          }else if(unix<correctBlock && prevSoul === undefined){
            if(i===0)nextSoul=null
            prevSoul = soul
          }
        }
        let block = {prev:prevSoul ,next: nextSoul, [idxDate]:log}
        put(correctSoul,block)
        //root.get(correctSoul).put(block)//put data and prev in new block
        if(prevSoul){
          put(prevSoul,{next:correctSoul})
          //gun.get(prevSoul).put({next:correctSoul})
        }
        if(prevSoul === null){
          let firstBlock = makeSoul(Object.assign({},soulObj,{';':head}))
          put(firstBlock,{prev:correctSoul})
          put(blockIdxSoul,{head:correctBlock})
          //gun.get(firstBlock).put({prev:correctSoul})
          //root.get(blockIdxSoul).put({head:correctBlock})
        }
        if(nextSoul){
          //gun.get(nextSoul).put({prev:correctSoul})
          put(nextSoul,{prev:correctSoul})
        }
        if(nextSoul === null){
          let lastBlock = makeSoul(Object.assign({},soulObj,{';':tail}))
          put(lastBlock,{next:correctSoul})
          put(blockIdxSoul,{tail:correctBlock})
          //gun.get(lastBlock).put({next:correctSoul})
          //root.get(blockIdxSoul).put({tail:correctBlock})
        }
      }
      function newIndex(){
        let firstBlock = {prev:null,next:null,[idxDate]:log}
        put(blockIdxSoul,{[correctSoul]:correctBlock,tail:correctBlock,head:correctBlock})
        put(correctSoul,firstBlock)
        //root.get(blockIdxSoul).put({[correctSoul]:correctBlock,tail:correctBlock,head:correctBlock})
        //root.get(correctSoul).put(firstBlock)
      }
    })
    
  }
}

const getLabeledNodes = (gun,gb,nodeType,labelArr,cb)=>{
  let {b,t,r} = parseSoul(nodeType)
  if(r)throw new Error('Relationships do not have labels')
  if(!(cb instanceof Function))throw new Error('Must provide a callback')
  if(!labelArr || !Array.isArray(labelArr) || (Array.isArray(labelArr) && !labelArr.length))throw new Error('Must specify at least one label')
  let out = []
  //labels should already be IDs, nodeType should be !#

  //if we have a length property on each label, we could find the shortest list first, then get that list, then get the set from those props
  //for now, we will not.
  let idx = makeSoul({b,t,l:labelArr[0]})
  const get = gunGet(gun)

  get(idx,false,function(nodes){
    let nodesToTry = []
    for (const nodeID in nodes) {
      const boolean = nodes[nodeID];
      if(DATA_INSTANCE_NODE.test(nodeID) && boolean){
        nodesToTry.push(nodeID)
      }
    }
    let toGet = nodesToTry.length
    for (const node of nodesToTry) {
      get(node,'LABELS',function(set){
        toGet--
        let pass = true
        for (const label of labelArr) {
          if(!set[label])pass=false;break;
        }
        if(pass)out.push(node)
        if(!toGet)cb(out)
      })
    }
  })
}


function newQueryObj(cb,from,to,items,order){
  let low,high,rangeOrder,traverse
  let testLow = from && from.getTime() || -Infinity
  let testHigh = to && to.getTime() || Infinity

  low = (testLow < testHigh) ? testLow : testHigh
  high = (testLow < testHigh) ? testHigh : testLow
  rangeOrder = order || '<'
  traverse = (rangeOrder === '<') ? 'prev' : 'next'

  return {
    range : {
    low,
    high
    },


    result: [], //keys of UTC unix equivalent for where it was found

    max : items || Infinity,
    rangeOrder,
    traverse,
    dumpResult: function(){
      // let out = []
      // let order = Object.keys(this.result)
      // if (this.rangeOrder === '>'){
      //   order.sort(function(a, b){return a - b})
      // }else{
      //   order.sort(function(a, b){return b - a})
      // }
      // for (const ts of order) {
      //   out = out.concat(this.result[ts])
      // }
      this.done(this.result)
    },
    
    done : cb || function(){}
  }
}
const queryIndex = (gun) => (idxID,cb,items,startDate,stopDate,resultOrder,UTCoffset) => {//need to add a filter so it only matches a certain item
  //UTCoffset is in hours that you want to interpret the start and stop dates
  let begin,end,dateShift
  items = items || Infinity
  if(UTCoffset !== undefined && !isNaN(UTCoffset)){
    let thisTz = new Date()
    thisTz = thisTz.getTimezoneOffset()*-1//returns minutes from UTC in opposite of offset value, flip sign
    UTCoffset = (UTCoffset > 24) ? UTCoffset : UTCoffset*60 //if they passed in minutes already leave as it, else convert hrs to mins
    dateShift = thisTz - UTCoffset //minutes to shift inputted dates
  }else if(UTCoffset !== undefined){
    console.warn('Warning: UTCoffset is not a number. It should be +/- hours from UTC')
  }else{
    dateShift = 0
  }

  if (startDate && startDate instanceof Date && dateShift){ 
    let correctedDate = granularDate(startDate)
    correctedDate[4] += dateShift
    begin = new Date(granularToUnix(correctedDate))
  }else if (startDate && startDate instanceof Date){ 
    begin = startDate
  }else if (startDate){ 
    console.warn('Warning: Improper start Date used for .range()')
  }else{
    begin = -Infinity
  }

  if (stopDate && stopDate instanceof Date && dateShift){ 
    let correctedDate = granularDate(stopDate)
    correctedDate[4] += dateShift
    end = new Date(granularToUnix(correctedDate))
  }else if (stopDate && stopDate instanceof Date){ 
    end = stopDate
  }else if (stopDate){ 
    console.warn('Warning: Improper start Date used for .range()')
  }else{
    end = Infinity
  }
  resultOrder = resultOrder || '<'
  if(resultOrder && resultOrder !== '<' && resultOrder !== '>'){
    console.warn('Invalid Result Order. "<": returns array with newest to oldest, ">" returns array with oldest to newest')
  }
  
  if(!(cb instanceof Function)){
    console.warn('must specify a Callback function to return your data')
  }
  let result = []
  //work from direction specified by user
  const MS_BLOCK_LENGTH = 1000*60*60*24
  let soulObj = parseSoul(idxID)
  let blockIdxSoul = makeSoul(Object.assign({},soulObj,{':':'BLKIDX'}))
  if(!(cb instanceof Function))throw new Error('Must provide a callback')
  let toGet = srcTypeArr.length*trgtTypeID.length
  let blocks = []

  gun.get(blockIdxSoul).once(function(blockIdx){
    //will have head, tail, and the rest is keys of block souls and values of unix times
    if(blockIdx !== undefined){
      for (const block in blockIdx) {
        if (['_','head','tail'].includes(block))continue
        let unixMid = blockIdx[block]
        let incl = unixMid + MS_BLOCK_LENGTH//midnight could be outside of range, but end of block might be in range
        if(incl >= begin && unixMid <= end){
          blocks.push([block,unixMid])
        }
      }
    }
    if (resultOrder === '>'){
      blocks.sort(function(a, b){return a[1] - b[1]})
    }else{
      blocks.sort(function(a, b){return b[1] - a[1]})
    }
    getNextBlock()
  })

  function getNextBlock(){
    if(!blocks.length){cb(result);return;}//didn't hit specified limit, but ran out of blocks
    let [blockSoul] = blocks.shift()
    gun.get(blockSoul).once(function(data){
      if(data !== undefined){
        for (const soul in data) {
          const unix = data[soul];
          if (['_','prev','next'].includes(soul) || unix === false)continue
          if(unix >= begin && unix <= end){
            if(result.length < items){
              result.push(soul)
            }else{
              cb(result)
              return
            }
          }
          
        }
      }else{
        cb(result)
        return
      }
      if(!toGet){
        cb(result)
      }
    })
  }
}

function traverseIndex(gun, soul, qObj) {
  var root = gun.back(-1)
  console.log('traverse', soul)
  root.get(soul).get(function(msg, ev) {
    var timepoint = msg.put
    ev.off()
    if (!timepoint)
      return
    // Retrieve all timepoint keys within range.
    var low = qObj.range.low
    var high = qObj.range.high

    let order = Object.entries(timepoint)
    if (qObj.rangeOrder === '>'){
      order.sort(function(a, b){return a[1] - b[1]})
    }else{
      order.sort(function(a, b){return b[1] - a[1]})
    }
    for (const [soul,ts] of order) {
      if(['_','prev','next'].includes(soul))continue
      console.log(ts,low,high)
      if(ts && ts >= low && ts <= high && qObj.result.length < qObj.max){
        qObj.result.push(soul)
      }
    }
    let adjacentSoul = timepoint[qObj.traverse]
    if(adjacentSoul === null){//ran out of blocks to traverse
      qObj.dumpResult()
      return
    }
    let adjacentBlockTime = getBlockTime(parseSoul(adjacentSoul)[':'])
    let adjacentInBounds
    if(qObj.traverse === 'prev'){
      adjacentInBounds = ( (adjacentBlockTime + 86400000) > low ) ? true : false //blocks are one unix day, can data in block be in bounds of `low`
    }else{
      adjacentInBounds = ( adjacentBlockTime < high ) ? true : false 
    }
    if(adjacentInBounds && qObj.result.length < qObj.max){//we need to traverse
      traverseIndex(gun,adjacentSoul,qObj)
      //setTimeout(traverseIndex,1,gun,nextSoul, qObj)//otherwise doesn't work on second call?
    }else{//we are done, return result
      qObj.dumpResult()
      return
    }
  })
}

const buildFromLog = gun => (nodeID,pvalArr,atTime,cb) => {
  //todo
}




//util suff
function granularUnix(date, depth) {
  // This method is required for more efficient traversal.
  // It exists, due to the bucket Date() may be outside of range, although technically still in it.
  // For example, with a start range of March 20, 2019 and a stop range of March 21, 2019. The root bucket date returned is just '2019', which has a default of Jaunuary 1, 2019
  // We break these ranges down into an array; sRange = [year, month, day, hour, min, sec, ms] building off of the former. We check each of these date ranges with a `depth` cursor.

  var year = new Date(date.getUTCFullYear().toString())
  if (typeof depth === 'number' && depth === 0) return year.getTime()

  var month = new Date(year)
  month.setUTCMonth(date.getUTCMonth())
  if (typeof depth === 'number' && depth === 1) return month.getTime()

  var day = new Date(month)
  day.setUTCDate(date.getUTCDate())
  if (typeof depth === 'number' && depth === 2) return day.getTime()

  var hour = new Date(day)
  hour.setUTCHours(date.getUTCHours())
  if (typeof depth === 'number' && depth === 3) return hour.getTime()

  var mins = new Date(hour)
  mins.setUTCMinutes(date.getUTCMinutes())
  if (typeof depth === 'number' && depth === 4) return mins.getTime()

  var sec = new Date(mins)
  sec.setUTCSeconds(date.getUTCSeconds())
  if (typeof depth === 'number' && depth === 5) return sec.getTime()

  var ms = new Date(sec)
  ms.setUTCMilliseconds(date.getUTCMilliseconds())
  if (typeof depth === 'number' && depth === 6) return ms.getTime()

  // We want all of them.
  return [year.getTime(), month.getTime(), day.getTime(), hour.getTime(), mins.getTime(), sec.getTime(), ms.getTime()]
}
function granularToUnix(dateArr) {
  return Date.UTC(...dateArr)
}
function granularDate(date, depth) {
  // This method is required for more efficient traversal.
  // It exists, due to the bucket Date() may be outside of range, although technically still in it.
  // For example, with a start range of March 20, 2019 and a stop range of March 21, 2019. The root bucket date returned is just '2019', which has a default of Jaunuary 1, 2019
  // We break these ranges down into an array; sRange = [year, month, day, hour, min, sec, ms] building off of the former. We check each of these date ranges with a `depth` cursor.
  var year = new Date(date.getUTCFullYear().toString())
  if (typeof depth === 'number' && depth === 0) return year.getUTCFullYear()
  var month = new Date(year)
  month.setUTCMonth(date.getUTCMonth())
  if (typeof depth === 'number' && depth === 1) return month.getUTCMonth()+1

  var day = new Date(month)
  day.setUTCDate(date.getUTCDate())
  if (typeof depth === 'number' && depth === 2) return day.getUTCDate()

  var hour = new Date(day)
  hour.setUTCHours(date.getUTCHours())
  if (typeof depth === 'number' && depth === 3) return hour.getUTCHours()

  var mins = new Date(hour)
  mins.setUTCMinutes(date.getUTCMinutes())
  if (typeof depth === 'number' && depth === 4) return mins.getUTCMinutes()

  var sec = new Date(mins)
  sec.setUTCSeconds(date.getUTCSeconds())
  if (typeof depth === 'number' && depth === 5) return sec.getUTCSeconds()

  var ms = new Date(sec)
  ms.setUTCMilliseconds(date.getUTCMilliseconds())
  if (typeof depth === 'number' && depth === 6) return ms.getUTCMilliseconds()

  // We want all of them
  return [year.getUTCFullYear(), month.getUTCMonth()+1, day.getUTCDate(), hour.getUTCHours(), mins.getUTCMinutes(), sec.getUTCSeconds(), ms.getUTCMilliseconds()]
}

module.exports = {
  timeIndex,
  relationIndex,
  queryIndex,
  timeLog,
  getRelationNodes,
  getLabeledNodes
}