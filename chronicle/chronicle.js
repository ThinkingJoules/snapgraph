'use strict'
const {getValue, setValue, makeSoul, parseSoul,configPathFromChainPath} = require('../gbase_core/util.js')
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
const relationIndex = (gun,relationSoul, srcTypeID, trgtTypeID, idxDate, opts) =>{
  //relationSoul = must be !-$ soul
  //idxData = Must be unique for the entire index, this is the string (usually a gun soul) that you are indexing at ...VV
  //idxDate = This is the timestamp you are indexing the idxData at. 
  let root = gun.back(-1)
  let {b,r} = parseSoul(relationSoul)
  let {archive, deleteThis} = opts
  let idxSoul = makeSoul({b,r,':':true})
  let soulObj = parseSoul(makeSoul({b,r,'>':srcTypeID,'<':trgtTypeID}))
  let idxData = relationSoul
  idxDate = idxDate || Date.now() //index as 'now' such for creation
  if (!(idxDate instanceof Date) || isNaN(idxDate*1)){ // TODO: Do magic
    console.warn('Warning: Improper idxDate used. Must be a Date Object or unix time')
  }
  if(idxDate instanceof Date)idxDate = idxDate.getTime()
  let correctBlock = getBlockTime(idxDate)
  const correctSoul = makeSoul(Object.assign({},soulObj,{':':correctBlock}))
  //console.log(correctBlock,correctSoul)

  root.get(idxSoul).get(idxData).get(function(msg, ev) {
    let prevIdx = msg.put
    ev.off()
    if (prevIdx !== undefined){//false old index in case of changing
      let oldSoul = makeSoul(Object.assign({},soulObj,{':':getBlockTime(prevIdx)}))
      root.get(oldSoul).put({[idxData]: false})
    }
    if(archive || deleteThis)return
    root.get(idxSoul).get('tail').get(function(msg, ev) {//new idxData, check last block time to see if we add to that block or create new block
      let lastBlock = msg.put //unix
      ev.off()
      if (lastBlock !== undefined){//lastBlock exists
        if(correctBlock === lastBlock){//add to block
          root.get(correctSoul).put({[idxData]:idxDate})
        }else{//make new block 
          let lastSoul = makeSoul(Object.assign({},soulObj,{':':lastBlock}))
          root.get(idxSoul).put({tail:correctBlock})//new tail
          root.get(lastSoul).put({next:correctSoul})//old tail, update next
          root.get(correctSoul).put({prev:lastSoul ,next: null, [idxData]:idxDate})//put data and prev in new block
        }
      }else{//first block for index, make head === tail on idxSoul
        let base = {b,r,'>':srcTypeID,':':true}
        let src = makeSoul(base)
        root.get(idxSoul).put({[src]:{'#':src},head:correctBlock,tail:correctBlock})
        root.get(correctSoul).put({prev:null,next:null,[idxData]:idxDate})
        //need to back create links so we can find the list        
        let trgt = makeSoul(Object.assign({},base,{'<':trgt}))
        root.get(src).put({[trgt]:{'#':trgt}})
        root.get(trgt).put({[correctSoul]: {'#':correctSoul}})
      }
      root.get(idxSoul).put({[idxData]:idxDate})//'last' index
    })
  })
}

const timeIndex = (gun) => (idxID, idxData, idxDate) =>{
  //idxID = Can be anything, it is just a reference to this specific index, it is usually a 'list' soul
  //idxData = Must be unique for the entire index, this is the string (usually a gun soul) that you are indexing at ...VV
  //idxDate = This is the timestamp you are indexing the idxData at. 

  //NEED TO FACTOR IN POSSIBILITY OF A DATE BEING BEFORE HEAD

  let root = gun.back(-1)
  let soulObj = parseSoul(idxID)
  let idxSoul = makeSoul(Object.assign({}, soulObj,{':':true}))
  if (!(idxDate instanceof Date) || isNaN(idxDate*1)){ // TODO: Do magic
    console.warn('Warning: Improper idxDate used. Must be a Date Object or unix time')
  }
  if(idxDate instanceof Date)idxDate = idxDate.getTime()
  let correctBlock = getBlockTime(idxDate)
  const correctSoul = makeSoul(Object.assign({},soulObj,{':':correctBlock}))
  //console.log(correctBlock,correctSoul)

  root.get(idxSoul).get(idxData).get(function(msg, ev) {
    let prevIdx = msg.put
    ev.off()
    if (prevIdx !== undefined){//false old index
      let oldSoul = makeSoul(Object.assign({},soulObj,{':':getBlockTime(prevIdx)}))
      root.get(oldSoul).put({[idxData]: false})
    }
    root.get(idxSoul).get('tail').get(function(msg, ev) {//new idxData, check last block time to see if we add to that block or create new block
      let lastBlock = msg.put //unix
      ev.off()
      if (lastBlock !== undefined){//lastBlock exists
        root.get(idxSoul).get('head').get(function(msg, ev) {//need head to know what to do
          let firstBlock = msg.put //unix
          ev.off()
          //if between first and last, add to correct block
          //if before first, make new block, change head, link to prev head
          //if after last, make new block, change tail, link prev tail




          if(correctBlock === lastBlock){//add to block
            root.get(correctSoul).put({[idxData]:idxDate})
          }else{//make new block 
            let lastSoul = makeSoul(Object.assign({},soulObj,{':':lastBlock}))
            root.get(idxSoul).put({tail:correctBlock})//new tail
            root.get(lastSoul).put({next:correctSoul})//old tail, update next
            root.get(correctSoul).put({prev:lastSoul ,next: null, [idxData]:idxDate})//put data and prev in new block
          }
        })
      }else{//first block for index, make head === tail on idxSoul
        root.get(idxSoul).put({head:correctBlock,tail:correctBlock})
        root.get(correctSoul).put({prev:null,next:null,[idxData]:idxDate})
      }
      root.get(idxSoul).put({[idxData]:idxDate})//'last' index
    })
  })
}

const timeLog = (gun) => (idxID, changeObj) =>{
  //idxID = Should be a dataNode soul(or any soul that you want to log edits on)
  //changeObj = partial update of what is being 'put'
  let root = gun.back(-1)
  let soulObj = parseSoul(idxID)
  let idxSoul = makeSoul(Object.assign({}, soulObj,{':':true}))
  let user = root.user()
  let pub = user && user.is && user.is.pub || false
  let idxDate = new Date().getTime()
  changeObj = (typeof changeObj === 'object') ? JSON.stringify(changeObj) : changeObj
  
  let logObj = {who:pub,what:changeObj,when:idxDate}

  root.get(idxSoul).get('tail').get(function(msg, ev) {
    let lastEdit = msg.put
    let newLog = (lastEdit === undefined) ? true : false
    ev.off()
    let lastSoul = makeSoul(Object.assign({},soulObj,{':':lastEdit}))
    let nextSoul = makeSoul(Object.assign({},soulObj,{':':idxDate}))
    let prevO = (newLog) ? {prev: null} : {prev:{'#':lastSoul}}
    Object.assign(logObj,prevO)
    if (newLog){//new object
      root.get(idxSoul).put({head:idxDate})
    }else{
      root.get(lastSoul).put({next:{'#':nextSoul}})//old tail, update next
    }
    root.get(idxSoul).put({tail:idxDate})//new tail
    root.get(nextSoul).put(logObj)//put data and prev in new block
  })
}
const makecrawlIndex = (gun) => (idxID,unix, towardTail, cb) =>{
  cb = (cb instanceof Function && cb) || function(){}
  if(unix === undefined){
    if(towardTail){
      unix = -Infinity
    }else{
      unix = Infinity
    }
  }
  let bt, traverseStart,isSoul
  if(isNaN(unix) && typeof unix === 'string'){
    traverseStart = unix //need to add check to make sure it is a valid block soul
    getBlock()
    return
  }
  if(unix === Infinity){
    unix = 'tail' // tail
  }else if(unix ===-Infinity){
    unix = 'head' // head?
  }  
  let idxSoul = makeSoul(Object.assign({},parseSoul(idxID),{':': true}))
  gun.get(idxSoul).get('head',function(msg,eve){
    eve.off()
    let head = msg.put
    gun.get(idxSoul).get('tail',function(msg,eve){
      eve.off()
      let tail = msg.put
      if(unix === 'head'){
        bt = getBlockTime(head)
      } else if(unix === 'tail'){
        bt = getBlockTime(tail)
      }else if(unix >= tail && unix <= head){
        bt = getBlockTime(unix)
      }else if(unix <= head){
        bt = getBlockTime(head)
      }else if(unix >= tail){
        bt = getBlockTime(tail)
      }
      traverseStart = makeSoul(Object.assign({},parseSoul(idxID),{':': bt}))
      getBlock()
    })
  })
  function getBlock(){
    // need to get head and tail to see if it is in range, or if we start at one end.
    gun.get(traverseStart).once(function(block){
      let copy = JSON.parse(JSON.stringify(block))
      let {prev, next} = copy
      delete copy.prev
      delete copy.next
      delete copy['_']
      copy = Object.entries(copy)
      copy = (towardTail) ? copy.sort(function(a, b){return a[1] - b[1]}) : copy.sort(function(a, b){return b[1] - a[1]})
      copy = copy.map(x => x[0])//get rid of timestamp, ids are now ordered by unix
      let dir = (towardTail) ? next : prev
      cb(copy,dir)
    })
}

}
const queryIndex = (gun) => (idxID,cb,items,startDate,stopDate,resultOrder,UTCoffset) => {//need to add a filter so it only matches a certain item
  //UTCoffset is in hours that you want to interpret the start and stop dates
  let begin,end,dateShift

  if(UTCoffset !== undefined && !isNaN(UTCoffset*1)){
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
  }

  if (stopDate && stopDate instanceof Date && dateShift){ 
    let correctedDate = granularDate(stopDate)
    correctedDate[4] += dateShift
    end = new Date(granularToUnix(correctedDate))
  }else if (stopDate && stopDate instanceof Date){ 
    end = stopDate
  }else if (stopDate){ 
    console.warn('Warning: Improper start Date used for .range()')
  }

  if(resultOrder && resultOrder !== '<' && resultOrder !== '>'){
    console.warn('Invalid Result Order. "<": returns array with newest to oldest, ">" returns array with oldest to newest')
  }
  
  if(!(cb instanceof Function)){
    console.warn('must specify a Callback function to return your data')
  }

  let query = newQueryObj(cb,begin,end,items,resultOrder)//this needs a filter option
  let soul = makeSoul(Object.assign({},parseSoul(idxID),{':':true}))
  if(!begin && !end){//getting ALL, don't traverse, just get all from the index soul
    gun.get(soul).get(function(msg,eve){
      eve.off()
      let data = msg.put
      let order = Object.entries(data)
      if (query.rangeOrder === '>'){
        order.sort(function(a, b){return a[1] - b[1]})
      }else{
        order.sort(function(a, b){return b[1] - a[1]})
      }
      let low = query.range.low
      let high = query.range.high
      for (const [soul,ts] of order) {
        if(['_','prev','next','head','tail'].includes(soul))continue
        if(ts && ts >= low && ts <= high && query.result.length < query.max){
          query.result.push(soul)
        }
      }
      query.dumpResult()
    })
  }else{//some sort of bounds, so traverse
    //work from direction specified by user
    let headOrTail = (query.traverse === 'prev') ? 'tail' : 'head'
    let highOrLow = (query.traverse === 'prev') ? 'high' : 'low'
    let Infin = (query.traverse === 'prev') ? Infinity : -Infinity
    if(query.range[highOrLow] === Infin){
      console.log(query.range,highOrLow)
      gun.get(soul).get(headOrTail).get(function(msg,eve){
        eve.off()
        let blockTime = msg.put
        let traverseStart = makeSoul(Object.assign({},parseSoul(idxID),{':':blockTime}))
        traverseIndex(gun,traverseStart,query)
      })
    }else{
      let bt = getBlockTime(query.range[highOrLow])
      console.log(bt,query.range,highOrLow)
      let traverseStart = makeSoul(Object.assign({},parseSoul(idxID),{':': bt}))
      traverseIndex(gun,traverseStart,query)
    }
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

const buildFromLog = gun => (idxID,cb,atTime) => {
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
function chainFinished(path, obj){
  path.push('value')
  let arr = path.slice()
  for (let i = 0; i < path.length; i++) {//work from bottom of object up until we can't 0 out a level
    let value = getValue(arr,obj)
    let thisPath = arr.slice()
    arr.pop()
    arr.pop()
    arr.push('value')
    if(isNaN(value*1)){//end of path
      return true
    }
    value += -1
    setValue(thisPath,value,obj)
    if(value === 0){
      continue
    }else{
      return false
    }
  }
}
function setChainValue(propertyPath, value, obj){
  let properties = Array.isArray(propertyPath) ? propertyPath : propertyPath.split(":")
  if (properties.length > 1) {// Not yet at the last property so keep digging
    // The property doesn't exists OR is not an object (and so we overwritte it) so we create it
    if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "object"){
      obj[properties[0]] = {value: 0}
    }
      // We iterate.
    return setChainValue(properties.slice(1), value, obj[properties[0]])
      // This is the last property - the one where to set the value
  } else {
    // We set the value to the last property
    if (!obj.hasOwnProperty(properties[0]) || typeof obj[properties[0]] !== "object"){
      obj[properties[0]] = {value}
    }else{
      obj[properties[0]].value += value
    }
    return true // this is the end
  }
}



function timeFirst(count) {
}

function timeLast(count) {
}

function timePause() {
}

function timeResume() {
}

function timeNear() {
  // This function is to be used in conjunction with .first/.last or .pause/.resume
}

function timeDone(cb) {
  // cb will pass new items count since last Gun emit event, potentially along with timegraph of those items. (Requires array or obj, but may be better in user-land)
  // cb(timeState.newItemCount). The reason this is a seperate API method and not part of .range, .first, etc is so that it can be used in the future for other things.

  cb = (cb instanceof Function && cb) || function(){}
  timeState.done = cb
}

function timeFilter() {
}

function timeTransform(cb) {
  // Transforms data from a Gun chain before being passed.
}
module.exports = {
  timeIndex,
  relationIndex,
  queryIndex,
  timeLog,
  makecrawlIndex
}