const gfn = require('./functions')
const {convertValueToType,getValue} = require('../gbase_core/util')
//FUNCTION STUFF
const makesolve = getLinks =>function thisfn(rowID, eq, tries){
    let linksResolved
    let logicResolved
    let output
    tries = tries || 0 
    try{//substitue links with the value they represent
        linksResolved = getLinks(rowID, eq)
        //console.log(linksResolved)
        if(linksResolved === undefined){
            tries++
            if(tries < 2){
                setTimeout(thisfn,100,rowID, eq, tries)
                return
            }else{
                return null
            }
        }
    }catch(e){
        return console.log(e)
    }
    //console.log(linksResolved)
    try{//parse string for comparators/ifs/etc
        logicResolved = evaluateAllFN(linksResolved)
    }catch(e){
        return console.log(e)
    }
    //console.log(logicResolved)
    let containsInvalidChars = /[^()+\-*/0-9.\s]/gi.test(logicResolved);
    if(!containsInvalidChars){
        let solver = new MathSolver()
        try{
            output = solver.solve(logicResolved)
        }catch(e){
            return console.log(e)
        }
        console.log(output)
        return output
    }else{
        let cleaned = stripDoubleQuotes(logicResolved)
        console.log(cleaned)
        return cleaned
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
        infix = infix.replace(/!=/g, 'P')
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
        throw new Error('Invalid Function: '+ match[0])
    }
    let find = findFN(FNstr, match.index)
    let argsArr = findFNArgs(find)
    for (let i=0; i<argsArr.length; i++){
        let val = argsArr[i]
        let more = r.exec(val)
        if(more && match[0] !== 'IFERROR'){//arg contains a FN
            resolvedArgs.push(evaluateAllFN(val))
        }else{
            resolvedArgs.push(val)
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
        }
        if(left.length && left.length === right.length + 1 && tok ===','){
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
    return args
}
function findTruth(ifFirstArg){
    let r = /IF\(/
    let match = r.exec(ifFirstArg)
    if(match !== null){
        throw new Error('Cannot have an IF statement as the first argument in an IF Statement')
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
       throw new Error('Too many comparisons in comparison block: '+ TFstr)
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
            throw new Error('String Comparators can only be "=" or "!="; '+ tok[0] +' is not valid.')
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

const makeinitialParseLinks = (isLinkMulti,getColumnType) => (fnString, rowID)=>{
    let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
    let out = {}
    let match
    while (match = allLinkPattern.exec(fnString)) {
        let replace = match[0]
        let path = match[1]
        let links = path.split('.')
        let linkMulti = isLinkMulti(links[0])
        let valueType = getColumnType(links[0])
        let summation = false
        let summationargs = false
        if(linkMulti){
            let fnPattern =  regexVar("[A-Z]+(?=\\(~\\))", replace, 'g')//this will find the summation name ONLY for .linked link
            let wholeReplace = regexVar("[A-Z]+\\(~\\)", replace, 'g')//this will find the summation name and trailing () for summation fn
            try{
                summation = fnPattern.exec(fnString)[0]
                replace = wholeReplace.exec(fnString)[0]
                summationargs = findFNArgs(summation)
                
            }catch(e){
                throw new Error('Cannot find summation function on link multiple field:', links[0])
            }
            if(gRollup.indexOf(summation) === -1){
                throw new Error('Invalid summation function for link multiple')
            }
        }
        out[path] = {replace,summation,summationargs,links,linkMulti,value:false, currentRow: rowID, valueType}
    } 
    return out
}
const makegetCell = (gunSubs,cache,loadRowPropToCache) =>(rowID,colStr)=>{
    let [base,tval,pval] = colStr.split('/')
    let value = getValue([base,tval,pval,rowID], cache)
    let cellsub = [base,tval,'r',pval].join('/')
    cellsub += '+'+rowID
    let colsub = [base,tval,'r',pval].join('/')
    if(!gunSubs[colsub] && !gunSubs[cellsub]){
        loadRowPropToCache(rowID, pval)
        return undefined
    }else if(!value){
        return null
    }
    
    return value
}
const makegetLinks = (initialParseLinks, getCell, getColumnType) => function thisfn(rowID, fnString, linksObj, tries){
    if(linksObj === undefined){
        linksObj = initialParseLinks(fnString, rowID)
    }
    tries = tries || 0
    let done = 0
    let links = Object.keys(linksObj)
    let dataMissing = false
    for (const path in linksObj) {
        const pathInfo = linksObj[path];
        if(!pathInfo.done){//still has a link to find, gather all links that getCell returned false (means it sent request for data).
            if(!pathInfo.linkMulti && pathInfo.links.length === 1){//getCell should be a value
                pathInfo.data = getCell(pathInfo.currentRow, pathInfo.links[0])
                pathInfo.valueType = getColumnType(links[0])
            }else if(!pathInfo.linkMulti && pathInfo.links.length === 2){//getCell should be stringified link Obj
                let request = getCell(pathInfo.currentRow, pathInfo.links[0])
                if(request){
                    try{
                        request = JSON.parse(request)
                    }catch (e){
                        return console.log('Could not parse request:', request)
                    }
                    let links = 0
                    for (const link in request) {
                        const value = request[link];
                        if (value) {//is true
                            links ++
                        }
                    }
                    if(links === 1){//single link like it should be
                        console.log(pathInfo)
                        pathInfo.links.shift() //remove the successfully retrieved link
                        pathInfo.currentRow = Object.keys(request)[0]
                        pathInfo.data = getCell(pathInfo.currentRow,pathInfo.links[0])
                        pathInfo.valueType = getColumnType(pathInfo.links[0])
                    }else{
                        throw new Error('Column is not a link multiple, but there are multiple links')
                    }
                }else if(request === "" || request === null){//getting data do nothing??
                    pathInfo.data = request
                    pathInfo.links.shift() //remove the successfully retrieved link
                    pathInfo.valueType = getColumnType(pathInfo.links[0])
                }else{//getting data do nothing??
                    pathInfo.data = false
                }
            }else if(pathInfo.linkMulti && pathInfo.links.length === 2){//getCell should be stringified link Obj with one or more keys
                let request = getCell(pathInfo.currentRow, pathInfo.links[0])
                pathInfo.valueType = getColumnType(pathInfo.links[0])
                if(request){
                    try{
                        request = JSON.parse(request)
                    }catch (e){
                        throw new Error('Could not parse request:', request)
                    }
                    pathInfo.data = []
                    for (const link in request) {
                        const value = request[link];
                        if (value) {//is true
                            pathInfo.links.shift() //remove the successfully retrieved link
                            pathInfo.currentRow = Object.keys(request)[0]
                            let linkData = getCell(pathInfo.currentRow,pathInfo.links[0])
                            pathInfo.data.push(linkData)
                        }
                    }
                }else if(request === "" || request === null){//getting data do nothing??
                    pathInfo.data.push(request)
                    pathInfo.links.shift() //remove the successfully retrieved link
                }else{//getting data do nothing??
                    pathInfo.data = false
                }
            }else{
                
            }
        }else{
            done++
        }
        
    }
    if(done !== links.length){//we don't have all data
        for (const path in linksObj) {// go back through and see if we can do final value calcs
            const pathInfo = linksObj[path];
            if(!pathInfo.done){//still has a link it attempted to find, check value
                if(!pathInfo.linkMulti && pathInfo.links.length === 1){
                    if(pathInfo.data !== undefined){// data is present
                        if(typeof pathInfo.data === pathInfo.valueType){
                            pathInfo.value = pathInfo.data
                            pathInfo.done = true
                        }else{
                            pathInfo.value = convertValueToType(pathInfo.data, pathInfo.valueType, pathInfo.links[0])
                            pathInfo.done = true
                        }
                    }else{
                        dataMissing = true
                    }
                }else if(pathInfo.linkMulti && pathInfo.links.length === 1){//getCell should be stringified link Obj with one or more keys
                    let missing = 0
                    pathInfo.value = []
                    for (let i = 0; i < pathInfo.data.length; i++) {
                        const value = pathInfo.data[i];
                        if(value !== undefined){// data is present
                            if(typeof value === pathInfo.valueType){
                                pathInfo.value.push(value)
                                pathInfo.done = true
                            }else{
                                console.log(value)
                                pathInfo.value.push(convertValueToType(value, pathInfo.valueType, pathInfo.links[0]))
                                pathInfo.done = true
                            }
                        }else{
                            missing++
                            dataMissing = true
                        }
                        
                    }
                    if(!missing){
                        pathInfo.done = true
                    }
                }else if(pathInfo.linkMulti && pathInfo.links.length === 2){//getCell should be stringified link Obj with one or more keys
                    let missing = 0
                    pathInfo.value = []
                    for (let i = 0; i < pathInfo.data.length; i++) {
                        const value = pathInfo.data[i];
                        if(value !== undefined){// data is present
                            if(typeof value === pathInfo.valueType){
                                pathInfo.value.push(value)
                                pathInfo.done = true
                            }else{
                                pathInfo.value.push(convertValueToType(value, pathInfo.valueType, pathInfo.links[0]))
                                pathInfo.done = true
                            }
                        }else{
                            missing++
                            dataMissing = true
                        }
                        
                    }
                    if(!missing){
                        pathInfo.done = true
                    }
                }else{
                   dataMissing = true
                }
            }
        }
    }
    if(dataMissing){
        tries++
        console.log(linksObj, tries)
        if(tries < 2){
            setTimeout(thisfn,50,rowID,fnString, linksObj, tries)
            return
        }else{
            return null
        }
    }
    for (const path in linksObj){
        let pathInfo = linksObj[path]
        let rep = pathInfo.replace
        let val = pathInfo.value
        let summer = pathInfo.summation
        let args = pathInfo.summationargs
        if(summer && gfn[summer] !== undefined){
            if(summer !== 'JOIN'){
                val = gfn[summer](val)
            }else{
                val.unshift(args[0])
                val = gfn[summer](val)
            }
        }
        let find = new RegExp(rep, 'g')
        fnString = fnString.replace(find,val)
    }
    return fnString
}
module.exports = {
    evaluateAllFN,
    findTruth,
    findFN,
    findFNArgs,
    makesolve,
    makeinitialParseLinks,
    makegetCell,
    makegetLinks
}