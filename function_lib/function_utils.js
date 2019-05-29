const gfn = require('./functions')
const {convertValueToType,getValue,isMulti,getPropType} = require('../gbase_core/util')
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
    let r = /[A-Z]+(?=\(.+?\))/g
    let match = r.exec(FNstr)
    let resolvedArgs = []
    if(!match){//no functions in this string
        return FNstr
    }
    if(!gfn[match[0]]){
        let err = 'Invalid Function: '+ match[0]
        throw new Error(err)
    }
    let find = findFN(FNstr, match.index)
    let argsArr = findFNArgs(find)
    for (let i=0; i<argsArr.length; i++){
        let val = argsArr[i]
        let more = r.exec(val)
        if(more && match[0] !== 'IFERROR'){//arg contains a FN
            resolvedArgs.push(evaluateAllFN(val))
        }else{
            let containsInvalidChars = /[^()+\-*/0-9.\s]/gi.test(val);
            let output
            if(!containsInvalidChars){
                let solver = new MathSolver()
                output = solver.solve(val)
                resolvedArgs.push(output)
            }else{
                resolvedArgs.push(val)
            }
        }
    }
    let result = gfn[match[0]](resolvedArgs)
    FNstr = FNstr.replace(find,result)
    FNstr = evaluateAllFN(FNstr)
    return FNstr
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
        }else if(tok === '"' || tok === "'"){
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
function findTruth(ifFirstArg,FILTERtruth){
    if(!FILTERtruth){
        let r = /IF\(/
        let match = r.exec(ifFirstArg)
        if(match !== null){
            throw new Error('Cannot have an IF statement as the first argument in an IF Statement')
        }
    }
    let containsInvalidChars = /[^()+\-*/0-9.\s<>=!]/g.test(ifFirstArg)
    if(containsInvalidChars){
        let output = parseTruthStr(ifFirstArg, 'string')
        return output
    }else{
        let addedParens = parseTruthStr(ifFirstArg, 'number')
        let solver = new MathSolver()
        let output = solver.solveAndCompare(addedParens)
        return output
    }
}
function parseTruthStr(TFstr, compType){
    //check to ensure there is only one logical operator
    let operators = ['!=','<=','>=','=','<','>']
    let found = {}
    let str = TFstr.replace(/\s/g,"")
    //console.log(str)
    for (let i = 0; i < operators.length; i++) {
       const op = operators[i];
        let r
        if(op === '='){
            r = str.lastIndexOf('=')
            if(r !== -1){
                if(str[r-1] !== '<' && str[r-1] !== '>' && str[r-1] !=='!'){
                    found['='] = r
                }
            }
        }else if(op === '>'){
            r = str.lastIndexOf('>')
            if(r !== -1){
                if(str[r+1] !== '='){
                    found['>'] = r
                }
            }
        }else if(op === '<'){
            r = str.lastIndexOf('<')
            if(r !== -1){
                if(str[r+1] !== '='){
                    found['<'] = r
                }
            }
        }else{
            r = new RegExp(op,'g')
            let match = r.exec(TFstr)
            if(match){
                found[op] = match.index
            }
        }
    }
    let tok = Object.keys(found)
    if(tok.length !== 1){
        let err = 'Too many comparisons in comparison block: '+ TFstr
        throw new Error(err)
    }
    if(compType === 'string'){
        let first = str.slice(0,found[tok[0]]-1)
        let second = str.slice(found[tok[0]]+ tok[0].length-1, str.length)
        if(tok[0] === "="){
            if(first == second){
                return true
            }else{
                return false
            }
        }else if(tok[0] === '!='){
            if(first !== second){
                return true
            }else{
                return false
            }
        }else{
            let err = 'String Comparators can only be "=" or "!="; '+ tok[0] +' is not valid.'
            throw new Error(err)
        }
    }else{//number
        str = str.slice(0,found[tok[0]])+')'+tok[0]+'('+str.slice(found[tok[0]]+ tok[0].length, str.length)
        str = '(' + str
        str += ')'
    
    return str
   }

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
        let linkMulti = isMulti(gb,links[0])
        let valueType = getPropType(gb,links[0])
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
        let linkMulti = isMulti(gb,links[0])
        let valueType = getPropType(gb,links[0])
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
    let propType = getPropType(gb,pathInfo.links[0])
    if(['prev','next','lookup'].includes(propType)){
        if(dataType === 'set'){//multiple links
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
                    pathInfo.value = linkVal
                    pathInfo.done = true
                    sObj.checkDone()
                })
            })
           
        }
    }else{// this is 'done' value
        getCell(get,p,function(val){
            pathInfo.value = val
            pathInfo.done = true
            sObj.checkDone()
        })  
    }
}
module.exports = {
    evaluateAllFN,
    findTruth,
    findFN,
    findFNArgs,
    makesolve,
    initialParseLinks,
    verifyLinksAndFNs,
    regexVar,
    ALL_LINKS_PATTERN
}