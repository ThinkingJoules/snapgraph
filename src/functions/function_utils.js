import * as gfn from './functions'
import {MathSolver} from '../util'
//FUNCTION STUFF
const ALL_LINKS_PATTERN = /\{([!#\-.$&,a-z0-9]+)\}/gi
const makesolve = (gb, getCell) =>function solve(rowID, eq, cb){
    try{//substitue links with the value they represent
        let linksObj = initialParseLinks(gb,eq,rowID)
        resolveLinks(gb,getCell,eq,linksObj,function(linksResolved){
            let logicResolved = evaluateAllFN(linksResolved)
            let hasInvalidChars = /[^()+\-*/0-9.\s]/gi.test(logicResolved);
            if(!hasInvalidChars){
                let solver = new MathSolver()
                let output = solver.solve(logicResolved)
                console.log(output)
                cb.call(this,output)
            }else{
                let cleaned = stripDoubleQuotes(logicResolved)
                console.log(cleaned)
                cb.call(this,cleaned)
            }
        })
        
    }catch(e){
        return console.log(e)
    }    
}
function resolveLinks(gb,getCell,fnString,linksObj,cb){
    let sObj = {linksObj,fnString,cb}
    sObj.checkPending = function(onPath){
        let linksObj = this.linksObj[onPath]
        let isDone = true
        if(Array.isArray(linksObj.value)){
            for (const link of linksObj.value) {
                if(linksObj.pending[link] === undefined){
                    isDone = false
                    break
                }
            }
        }
        if(isDone){
            linksObj.value = Object.values(linksObj.pending)
            linksObj.done = true
            this.checkDone()
        }
    }
    sObj.checkDone = function(){
        let isDone = true
        let linksObj = this.linksObj
        for (const {done} in linksObj) {
            if (!done) {
                isDone = false
                break
            }
        }
        if(isDone){
            this.done()
        }
    }
    sObj.done = function (){
        let linksObj = this.linksObj
        let fnString = this.fnString
        let cb = this.cb
        for (const path in linksObj){
            let pathInfo = linksObj[path]
            let rep = pathInfo.replace
            let val = pathInfo.value
            let summer = pathInfo.summation
            let args = pathInfo.summationargs
            if(summer && gfn[summer] !== undefined){
                val = (summer !== 'JOIN') ? val : val.unshift(args[0]) 
                val = gfn[summer](val)
            }
            let find = new RegExp(rep, 'g')
            fnString = fnString.replace(find,val)
        }
        //console.log(fnString)
        cb.call(this,fnString)
    }
    for (const path in linksObj) {
        getLinks(gb,getCell,path,sObj)
    }
}
function regexEscape(str) {
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
}
function regexVar(reg,literal,flags){
    //reg: regex with any fixed literals escaped, NO /   /  ~ represents where the literal goes in
    //literal: non escaped exact match characters
    //flags: 'g' or 'gi' , etc..
    let fullr = reg.replace('~', regexEscape(literal))
    let r = new RegExp(fullr,flags)
    return r
}
//FUNCTION POST LINK PARSING, PRE-SOLVE PARSING
function evaluateAllFN(FNstr){
    //FNstr must already have links resolved
    let r = /[A-Z]+(?=\(.+?\))/
    let match = r.exec(FNstr)
    let resolvedArgs = []
    let result
    if(!match){//no functions in this string
        return attemptSolve(FNstr)
    }
    if(!gfn[match[0]]){
        let err = 'Invalid Function: '+ match[0]
        throw new Error(err)
    }
    let find = findFN(FNstr, match.index)
    let argsArr = findFNArgs(find)
    if(match[0] === 'IFERROR'){
        try{
            result = evaluateAllFN(args[0])
        }catch(e){
            result = evaluateAllFN(args[1])
        }
        FNstr = FNstr.replace(find,result)
        try {
            FNstr = JSON.parse(FNstr)//need to eval to get string 'true' to boolean `true` if it is just a string or number then it remains
        } catch (error) {}
        
        return FNstr
    }
    for (let i=0; i<argsArr.length; i++){
        let val = argsArr[i]
        let more = r.exec(val)
        if(more){//arg contains a FN
            //console.log('more',val)
            resolvedArgs.push(evaluateAllFN(val))
        }else{
            resolvedArgs.push(attemptSolve(val))
        }
    }
    result = gfn[match[0]](resolvedArgs)
    FNstr = FNstr.replace(find,result)
    try {
        FNstr = JSON.parse(FNstr)//need to eval to get string 'true' to boolean `true` if it is just a string or number then it remains
    } catch (error) {}
    
    return attemptSolve(FNstr)//not sure this works in all situations... might need to check things more
    function attemptSolve(val){
        let hasMath = /[0-9+*/^-]+/gi.test(val);
        let hasletters = /[a-z]/i.test(val)
        let pureMath = hasMath && !hasletters
        let compare = /[<>!=]+/gi.test(val)
        //let reg = /(\/[^\n\r\s]+\/)([gimuy]+)?/.test(val)//?? No idea what this is for...
        //console.log('math:',pureMath, 'compare:',compare)
        let solver = new MathSolver()
        if(pureMath && !compare ){//&& !reg
            return solver.solve(val)
        }else if(compare){//&& !reg
            return solver.solveAndCompare(val)
        }else{
            return val
        }
    }
}

//FUNCTION UTILS
function findFN(str,startIdx){
    let left = []
    let right = []
    let endIdx
    for (let i=startIdx; i<str.length; i++){
      let tok = str[i]
      if(tok === '('){
        left.push(tok)
      }else if(tok === ')'){
        right.push(tok)
      }
      if(left.length && left.length === right.length){
        endIdx = i + 1
        break
      }
    }
    return str.slice(startIdx, endIdx)
}
function findFNArgs(str){
    let left = []
    let right = []
    let leftPar
    let rightPar
    let comIdx = []
    let quote = 0
    for (let i=0; i<str.length; i++){
        let tok = str[i]
        if(tok === '('){
            left.push(tok)
            if(left.length === 1){
                leftPar = i
            }
        }else if(tok === ')'){
            right.push(tok)
            if(left.length === right.length){
                rightPar = i
            }
        }else if(tok === '"' || tok === "'" || tok === "`"){
            quote ++
        }
        if(left.length && left.length === right.length + 1 && quote % 2 === 0 && tok ===','){
            comIdx.push(i)
        }
    }
    let args = []
    let next = leftPar+1
    for (let i = 0; i < comIdx.length; i++) {
        const com = comIdx[i];
        if(i === 0){
            args.push(str.slice(leftPar+1,com))
            next = com + 1
        }else{
            args.push(str.slice(next,com))
            next = com + 1
        }

    }
    args.push(str.slice(next,rightPar))
    for (let i = 0; i < args.length; i++) {
        let arg = args[i].trim();
        if ((arg.charAt(0) === '"' && arg.charAt(arg.length-1) === '"') || (arg.charAt(0) === "'" && arg.charAt(arg.length-1) === "'")) {
            //if double quoted arg
            args[i] = stripDoubleQuotes(arg)
        }else{//not double quoted, strip whitespace
            args[i] = arg.replace(/\s+/g, '')
        }
    
    }
  
    return args
}


function stripDoubleQuotes(str){
    if (str.charAt(0) === '"' && str.charAt(str.length-1) === '"') {
        return str.substr(1, str.length-2);
    }else if (str.charAt(0) === "'" && str.charAt(str.length-1) === "'") {
        return str.substr(1, str.length-2);
    }
    return str
}

//FUNCTION LINK PARSING
let gRollup = ["SUM","MAX","MIN","AVG","AND","OR","COUNT","COUNTALL","JOIN","MULTIPLY"];//valid Rollup FNs
let nextLinkFNs = ["JOIN", "CONCAT"]
const verifyLinksAndFNs = (gb, path, fnString)=>{
    let allLinkPattern = new RegExp(ALL_LINKS_PATTERN)
    let match
    let nextUsed = false
    while (match = allLinkPattern.exec(fnString)) {
        let replace = match[0]
        let path = match[1]
        let links = path.split(',')
        let linkMulti = false //isMulti(gb,links[0])
        let valueType = false //getPropType(gb,links[0])
        let summation = false
        if(valueType === 'next'){nextUsed = true}
        if(linkMulti && ['prev','lookup'].includes(valueType)){
            let fnPattern =  regexVar("[A-Z]+(?=\\(~\\))", replace, 'g')//this will find the summation name ONLY for .linked link
            try{
                summation = fnPattern.exec(fnString)[0]                
            }catch(e){
                let err = 'Cannot find summation function on multiple field: '+ links[0]
                throw new Error(err)
            }
        }else if(valueType === 'next'){
            let fnPattern =  regexVar("[A-Z]+(?=\\(~\\))", replace, 'g')//this will find the summation name ONLY for .linked link
            summation = fnPattern.exec(fnString)[0]
            if(summation !== null && !nextLinkFNs.includes(summation)){
                let err = '"next" with {linkMultiple: false} can only be used in: '+nextLinkFNs.join(', ')+ ' Functions'
                throw new Error(err)
            }

        }
    }
    if(nextUsed){//final check; if any of the references were next columns, cannot have any math symbols
        let leftCurl = 0
        let rightCurl = 0
        let lpar = 0
        let rpar = 0
        let invalid = ["+","-","*","/","^"]
        let badFN = false
        //can only have math symbols inside of functions, since functions are already verified to be CONCAT or JOIN
        for (let i = 0; i < fnString.length; i++) {
            const char = fnString[i];
            if(char === '(') lpar ++
            if(char === ')') rpar ++
            if(char === '{') leftCurl ++
            if(char === '}') rightCurl ++

            if((!leftCurl && !rightCurl) && lpar === rpar){//char before any references
                if(invalid.includes(char)){
                    badFN = true
                    break
                }
            }else if(leftCurl === rightCurl && lpar === rpar){
                if(invalid.includes(char)){
                    badFN = true
                    break
                }
            }
        }
        if(badFN && nextUsed){
            let err = 'Cannot do math if a next column is referenced in the equation, only: '+nextLinkFNs.join(', ')+ ' Functions are allowed'
            throw new Error(err)
        }else if (badFN){
            let err = 'Cannot do math in the first column, only: '+nextLinkFNs.join(', ')+ ' Functions are allowed'
            throw new Error(err)
        }
    }
    return true
}


const initialParseLinks = (gb, fnString, rowID)=>{
    let allLinkPattern = new RegExp(ALL_LINKS_PATTERN)
    let out = {fnString}
    let match
    while (match = allLinkPattern.exec(fnString)) {
        let replace = match[0]
        let path = match[1]
        let links = path.split(',')
        let linkMulti = false //isMulti(gb,links[0])
        let valueType = false //getPropType(gb,links[0])
        let summation = false
        let summationargs = false
        if(linkMulti){
            let fnPattern =  regexVar("[A-Z]+(?=\\(~\\))", replace, 'g')//this will find the summation name ONLY for .linked link
            let wholeReplace = regexVar("[A-Z]+\\(~\\)", replace, 'g')//this will find the summation name and trailing () for summation fn
            try{
                summation = fnPattern.exec(fnString)[0]
                replace = wholeReplace.exec(fnString)[0]
                summationargs = findFNArgs(replace) // was findFNArgs(summation)
                
            }catch(e){
                let err = 'Cannot find summation function on link multiple field: '+ links[0]
                throw new Error(err)
            }
            if(!gRollup.includes(summation)){
                throw new Error('Invalid summation function for link multiple')
            }
        }
        out.linksObj[path] = {replace,summation,summationargs,links,linkMulti,value:false,pending:{}, currentRow: rowID, valueType}
    }
    
    return out
}
function getLinks(gb, getCell, path, sObj){
    const pathInfo = sObj.linksObj[path];
    let {p} = parseSoul(pathInfo.links[0])
    let get = pathInfo.currentRow
    let dataType = getDataType(gb,pathInfo.links[0])
    let propType = false//getPropType(gb,pathInfo.links[0])
    if(['child','parent','lookup'].includes(propType)){
        if(dataType === 'unorderedSet'){//multiple links
            getCell(get,p,function(val){
                pathInfo.links.shift()
                pathInfo.value = val
                let {p} = parseSoul(pathInfo.links[0])//should be next ',' link because of .shift()
                if(Array.isArray(val) && val.length){
                    for (const link of val) {
                        getCell(link,p,function(linkVal){
                            pathInfo.pending[link] = linkVal
                            sObj.checkPending(path)
                        })
                    }
                }else{
                    sObj.checkPending(path)
                }
            })
        }else{//single link (allowMultiple = false)
            getCell(get,p,function(val){
                pathInfo.links.shift()
                let {p} = parseSoul(pathInfo.links[0])//should be next ',' link because of .shift()
                getCell(val,p,function(linkVal){
                    pathInfo.value = (Array.isArray(linkVal)) ? linkVal.length : linkVal
                    pathInfo.done = true
                    sObj.checkDone()
                })
            })
           
        }
    }else{// this is 'done' value
        getCell(get,p,function(val){
            pathInfo.value = (Array.isArray(val)) ? val.length : val
            pathInfo.done = true
            sObj.checkDone()
        })  
    }
}
export {
    evaluateAllFN,
    findFN,
    findFNArgs,
    makesolve,
    initialParseLinks,
    verifyLinksAndFNs,
    regexVar,
    ALL_LINKS_PATTERN
}