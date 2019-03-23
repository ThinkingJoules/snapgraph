'use strict'
const {getValue, setValue} = require('../gbase_core/util')
function ify(dataObj, soul){//will add soul metadata to dataObj
  //does not verify valid data obj
  //simply adds the sould obj under '_' key
  let s = {'_' : {'#': soul}}
  let newObj = Object.assign({},dataObj,s)
  return newObj
}

function newQueryObj(cb,from,to,items,order){
  let obj = {
  
  range : {
  low: from && granularDate(from) || [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity],
  high: to && granularDate(to) || [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity],
  },


  result: {}, //keys of UTC unix equivalent for where it was found

  pending : {},

  max : items || Infinity,
  rangeOrder : order || '<',
  dumpResult: function(){
    let out = []
    let order = Object.keys(this.result)
    if (this.rangeOrder === '>'){
      order.sort(function(a, b){return a - b})
    }else{
      order.sort(function(a, b){return b - a})
    }
    for (let i = 0; i < order.length; i++) {
      const ts = order[i];
      out = out.concat(this.result[ts])
    }
    this.done(out)
  },
  
  done : cb || function(){}
}

  return obj
}

const timeIndex = (gun) => (idxID, idxData, idxDate) =>{
  //idxID = Can be anything, it is just a reference to this specific index, it is usually a 'list' soul
  //idxData = Must be unique for the entire index, this is the string (usually a gun soul) that you are indexing at ...VV
  //idxDate = This is the timestamp you are indexing the idxData at. 
  let root = gun.back(-1)
  let tsoul = 'timeIndex>' + idxID
  let lastindexsoul = tsoul + '/last' // then .get(idxData)>> indexSoul where idxData can be found as a key
  if (idxDate instanceof Date){ // TODO: Do magic
  }else{
      console.warn('Warning: Improper idxDate used. Must be a Date Object')
  }

  let t = granularDate(idxDate)
  t = [tsoul].concat(t)

  // Working example of original modified slightly. Will later work this into a loop.
  let milliStr = t.join(':')
  let milli, objData
  if(typeof idxData === 'object' && !Array.isArray(idxData)){
    objData = true
    milli = ify(idxData, milliStr)
  }else{
    milli = ify({[idxData]: true}, milliStr)
  }
  let tmp = t.pop()

  let sec = ify({}, t.join(':'))
  sec[tmp] = milli
  tmp = t.pop()

  let min = ify({}, t.join(':'));
  min[tmp] = sec;
  tmp = t.pop();

  let hour = ify({}, t.join(':'))
  hour[tmp] = min
  tmp = t.pop()

  let day = ify({}, t.join(':'))
  day[tmp] = hour
  tmp = t.pop()

  let month = ify({}, t.join(':'))
  month[tmp] = day
  tmp = t.pop()

  let year = ify({}, t.join(':'))
  year[tmp] = month
  tmp = t.pop()
  
  let node = ify({}, t.join(':'))
  node[tmp] = year

  if(objData){
    root.put.call(root, node, tsoul) //true new indices
    let last = {}
    for (const soul in idxData) {
      last[soul] = milliStr
    }
    root.put.call(root,last,lastindexsoul)
  }else{
    root.get(lastindexsoul).get(idxData).get(function(msg, ev) {
      let prevSoul = msg.put
      ev.off()
      if (prevSoul !== undefined){//false old index
        root.put.call(root, {[idxData]: false}, prevSoul)
      }
      root.put.call(root, node, tsoul) //true new index
      root.put.call(root,{[idxData] : milliStr}, lastindexsoul)//update last index soul
  
    })
  }
  

}

const timeLog = (gun) => (idxID, logObj) =>{
  //idxID = Can be anything, it is just a reference to this specific index, it is usually a 'list' soul
  //idxData = Must be unique for the entire index, this is the string (usually a gun soul) that you are indexing at ...
  //idxDate = This is the timestamp you are indexing the idxData at. Should be in UTC Unix, ms (or seconds, could detect...)
  let root = gun.back(-1)
  let tsoul = 'timeLog>' + idxID

  let t = granularDate(new Date())
  t = [tsoul].concat(t)

  // Working example of original modified slightly. Will later work this into a loop.
  let milliStr = t.join(':')
  let milli = ify({}, milliStr)
  for (const key in logObj) {// put data in
    milli[key] = logObj[key];
  }
  let tmp = t.pop()

  let sec = ify({}, t.join(':'))
  sec[tmp] = milli
  tmp = t.pop()

  let min = ify({}, t.join(':'));
  min[tmp] = sec;
  tmp = t.pop();

  let hour = ify({}, t.join(':'))
  hour[tmp] = min
  tmp = t.pop()

  let day = ify({}, t.join(':'))
  day[tmp] = hour
  tmp = t.pop()

  let month = ify({}, t.join(':'))
  month[tmp] = day
  tmp = t.pop()

  let year = ify({}, t.join(':'))
  year[tmp] = month
  tmp = t.pop()
  
  let node = ify({}, t.join(':'))
  node[tmp] = year
  
  root.put.call(root, node, tsoul) //put data at index
    
}

const queryIndex = (gun) => (idxID,cb,items,startDate,stopDate,resultOrder,index,UTCoffset) => {//need to add a filter so it only matches a certain item
  //UTCoffset is in hours that you want to interpret the start and stop dates
  let begin,end,dateShift
  index = (index) ? true : false

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

  if (startDate && startDate instanceof Date){ 
    let correctedDate = granularDate(startDate)
    correctedDate[4] += dateShift
    begin = newDate(granularToUnix(correctedDate))
  }else if (startDate){ 
    console.warn('Warning: Improper start Date used for .range()')
  }

  if (stopDate && stopDate instanceof Date){ 
    let correctedDate = granularDate(stopDate)
    correctedDate[4] += dateShift
    end = newDate(granularToUnix(correctedDate))
  }else if (stopDate){ 
    console.warn('Warning: Improper start Date used for .range()')
  }

  if(resultOrder && resultOrder !== '<' && resultOrder !== '>'){
    console.warn('Invalid Result Order. "<": returns array with newest to oldest, ">" returns array with oldest to newest')
  }

  if(!index){
    resultOrder = '>'
  }
  
  if(!(cb instanceof Function)){
    console.warn('must specify a Callback function to return your data')
  }

  let query = newQueryObj(cb,begin,end,items,resultOrder)//this needs a filter option
  let soul = (index) ? 'timeIndex>' + idxID : 'timeLog>' + idxID
  traverse(gun, soul, query)
}


function withinRange(checkRange, startRange, stopRange) {
  // If startDate and stopDate are provided, check within bounds
  //console.log(checkRange, startRange, stopRange)

  if (startRange && stopRange)
    if (checkRange >= startRange && checkRange <= stopRange)
      return true
    else
      return false

  // If startDate only provided
  if (startRange && startRange <= checkRange) {
    return true
  }

  // if stopDate only provided
  if (stopRange && stopRange >= checkRange) {
    return true
  }

  return false
}

function traverse(gun, soul, qObj, depth) {
  var root = gun.back(-1)
  let type = soul.split('>')[0]
  //console.log('traverse', soul)

  root.get(soul).get(function(msg, ev) {
    var timepoint = msg.put
    ev.off()
    if (!timepoint)
      return

    if (!depth){
      depth = 0
    }
    // Retrieve all timepoint keys within range.
    var low = qObj.range.low[depth]
    var high = qObj.range.high[depth]

    var keys = []
    let tp
    let unix
    if(depth === 7){
      tp = soul.split(':').slice(1)
      unix = granularToUnix(tp)
      qObj.result[unix] = {}
    }
    for (var key of Object.keys(timepoint)) {
      if (key === '_'){
        continue
      }
      if(depth < 7){//keys will be more timepoints
        if (!withinRange(key, low, high)){
          continue
        }
        keys.push(key)
      }else{//keys will be data and values are t/f
        if(type === 'timeIndex'){
          if(timepoint[key]){//if not falsy
            if(!Array.isArray(qObj.result[unix]))qObj.result[unix] = []
            qObj.result[unix].push(key)
            // if (Object.values(qObj.result).length >= qObj.max) {
            //   //this branch has more keys than what was requested
            //   break
            // }
          }
        }else{
          qObj.result[unix][key] = timepoint[key]
        }
      }
    }

    //console.log(qObj)
    if(depth < 7){// Recurse to find timepoint souls
      // We already have the amount we asked for, exit from query
      if (Object.keys(qObj.result).length >= qObj.max) {
        //another branch has added items to make it to .max, stop looking down this branch
        return
      }
      if (qObj.rangeOrder === '>'){
        keys.sort(function(a, b){return a - b})
      }else{
        keys.sort(function(a, b){return b - a})
      }
      depth++
      for (var tpKey of keys) {
        let nextSoul = soul + ':' + tpKey
        setChainValue(nextSoul.split(':').slice(0,-1),1,qObj.pending)
        setTimeout(traverse,1,gun,nextSoul, qObj, depth)//otherwise doesn't work on second call
      }
    }else{
      setChainValue(soul.split(':'),1,qObj.pending)
      let done = chainFinished(soul.split(':'),qObj.pending)
      // We already have the amount we asked for, exit from getRange()
      if (Object.values(qObj.result).length >= qObj.max) {
        qObj.dumpResult()
        qObj.done = function(){}//wipe out cb in case it tries to fire again
        //done
        return
      }else{
        if(done){
          qObj.dumpResult()
          qObj.done = function(){}//wipe out cb in case it tries to fire again
        }
      }
    }
  })
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
  queryIndex,
  timeLog
}