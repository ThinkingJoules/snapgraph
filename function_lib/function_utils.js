const gfn = require('./functions')
const {convertValueToType,getValue,isMulti,getColumnType} = require('../gbase_core/util')
//FUNCTION STUFF
const makesolve = getLinks =>function solve(rowID, eq, tries){
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
        }else{
            //console.log(linksResolved)
            logicResolved = evaluateAllFN(linksResolved)
            let containsInvalidChars = /[^()+\-*/0-9.\s]/gi.test(logicResolved);
            if(!containsInvalidChars){
                let solver = new MathSolver()
                output = solver.solve(logicResolved)
                console.log(output)
                return output
            }else{
                let cleaned = stripDoubleQuotes(logicResolved)
                console.log(cleaned)
                return cleaned
            }
        }
    }catch(e){
        return console.log(e)
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
    let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
    let match
    let nextUsed = false
    let [b,t,p] = path.split('/')
    while (match = allLinkPattern.exec(fnString)) {
        let replace = match[0]
        let path = match[1]
        let links = path.split('.')

        let [lb,lt] = links[0].split('/')
        let {type} = getValue([lb,'props',lt], gb)

        let linkMulti = isMulti(gb,links[0])
        let valueType = getColumnType(gb,links[0])
        let summation = false
        if(valueType === 'next'){nextUsed = true}
        if(linkMulti || type !== 'static'){
            let fnPattern =  regexVar("[A-Z]+(?=\\(~\\))", replace, 'g')//this will find the summation name ONLY for .linked link
            try{
                summation = fnPattern.exec(fnString)[0]                
            }catch(e){
                if(linkMulti){
                    let err = 'Cannot find summation function on multiple field: '+ links[0]
                    throw new Error(err)
                }else{
                    throw new Error('Cannot find summation function for an interaction field')
                }
            }
            if(valueType === 'next' && summation !== 'JOIN'){
                throw new Error('"next" Column can only be summarized with a "JOIN()" function')
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
    if(nextUsed || p === 'p0'){//final check; if any of the references were next columns, cannot have any math symbols
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

const verifyLILinksAndFNs = (gb, path, fnString)=>{
    let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
    let match
    let [b,t,li] = path.split('/')
    while (match = allLinkPattern.exec(fnString)) {
        let path = match[1]
        let links = path.split('.')
        let valueType = getColumnType(gb,links[0])
        let [lb,lt,lli,lp] = links[0].split('/')
        if([lb,lt,lli].join('/') !== [b,t,li].join('/')){
            throw new Error('List items functions can only reference other list item columns')
        }
        if(valueType === 'context' && links[1]){
            let subType = getColumnType(gb,links[1])
            if(!['string','number','boolean'].includes(subType)){
                throw new Error('Context column can only reference a "string", "number", or "boolean" property')
            }
        }else if(valueType === 'contextLink'){
            throw new Error('Cannot use a "contextLink" column in an equation')
        }
    }
    
    return true
}
const initialParseLinks = (gb, fnString, rowID, toLi)=>{
    let allLinkPattern = /\{([a-z0-9/.]+)\}/gi
    let out = {}
    let match
    while (match = allLinkPattern.exec(fnString)) {
        let replace = match[0]
        let path = match[1]
        let links = path.split('.')
        let linkMulti = isMulti(gb,links[0],toLi)
        let valueType = getColumnType(gb,links[0])
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
        out[path] = {replace,summation,summationargs,links,linkMulti,value:false, currentRow: rowID, valueType}
    } 
    return out
}
const makegetLinks = (gb, getCell) => function getlinks(rowID, fnString, toLi, linksObj, tries){
    if(linksObj === undefined){
        linksObj = initialParseLinks(gb, fnString, rowID, toLi)
    }
    tries = tries || 0
    let done = 0
    let links = Object.keys(linksObj)
    let dataMissing = []
    let dataLinks = Object.assign({},linksObj)
    for (const path in linksObj) {
        const pathInfo = linksObj[path];
        let changes = dataLinks[path]
        if(!pathInfo.done){//still has a link to find, gather all links that getCell returned false (means it sent request for data).
            let[b,t,pval] = pathInfo.links[0].split('/')
            if(!pathInfo.linkMulti && pathInfo.links.length === 1){//getCell should be a value
                changes.data = getCell(pathInfo.currentRow, pval)
                changes.valueType = getColumnType(gb,changes.links[0])
            }else if(!pathInfo.linkMulti && pathInfo.links.length === 2){//getCell should be array
                let request = getCell(pathInfo.currentRow, pval)
                if(request !== undefined && (request === "" || request === null || request.length === 0)){//null data, no links
                    changes.data = 0
                    changes.links.shift() //remove the successfully retrieved link
                    changes.valueType = getColumnType(gb,changes.links[0])
                }else if(request !== undefined){
                    if(request.length === 1){//single link like it should be
                        changes.links.shift() //remove the successfully retrieved link
                        changes.currentRow = request[0]
                        let [b,t,p] = changes.links[0].split('/')
                        changes.data = getCell(request[0],p)
                        changes.valueType = getColumnType(gb,changes.links[0])
                    }else if(request.length > 1){
                        throw new Error('Column is not a link multiple, but there are multiple links')
                    }
                }else{//getting data do nothing??
                    changes.data = false
                }
            }else if(pathInfo.linkMulti && pathInfo.links.length === 2){//getCell should be arr w/ one or more keys
                let request = getCell(pathInfo.currentRow, pval)
                changes.valueType = getColumnType(gb,pathInfo.links[0])
                if(request !== undefined && (request === "" || request === null || request.length === 0)){//null data
                    changes.data.push(0)
                    changes.links.shift() //remove the successfully retrieved link
                }else if(request !== undefined){//acutal data
                    changes.data = []
                    for (let i = 0; i < request.length; i++) {
                        const value = request[i];
                        changes.links.shift() //remove the successfully retrieved link
                        changes.currentRow = value
                        let [b,t,p] = changes.links[0].split('/')
                        let linkData = getCell(pathInfo.currentRow,p)
                        changes.data.push(linkData)
                    }
                }else{//getting data do nothing??
                    changes.data = false
                }
            }else{
                
            }
        }else{
            done++
        }
        
    }
    if(done !== links.length){//we don't have all data
        for (const path in dataLinks) {// go back through and see if we can do final value calcs
            const pathInfo = dataLinks[path];
            if(!pathInfo.done){//still has a link it attempted to find, check value
                if(!pathInfo.linkMulti && pathInfo.links.length === 1){
                    if(pathInfo.data !== undefined){// data is present
                        if(typeof pathInfo.data === pathInfo.valueType){
                            pathInfo.value = pathInfo.data
                            pathInfo.done = true
                        }else{
                            //console.log(pathInfo)
                            pathInfo.value = convertValueToType(gb,pathInfo.data, pathInfo.valueType, pathInfo.links[0])
                            pathInfo.done = true
                        }
                    }else{
                        dataMissing.push(pathInfo)
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
                                //console.log(value)
                                pathInfo.value.push(convertValueToType(gb,value, pathInfo.valueType, pathInfo.links[0]))
                                pathInfo.done = true
                            }
                        }else{
                            missing++
                            dataMissing.push(pathInfo)
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
                                pathInfo.value.push(convertValueToType(gb, value, pathInfo.valueType, pathInfo.links[0]))
                                pathInfo.done = true
                            }
                        }else{
                            missing++
                            dataMissing.push(pathInfo)
                        }
                        
                    }
                    if(!missing){
                        pathInfo.done = true
                    }
                }else{
                    dataMissing.push(pathInfo)
                }
            }
        }
    }
    if(dataMissing.length !== 0){
        tries++
        //console.log(dataMissing)
        if(tries < 2){
            setTimeout(getlinks,50,rowID,fnString,toLi, dataLinks, tries)
            return
        }
    }
    for (const path in dataLinks){
        let pathInfo = dataLinks[path]
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
    //console.log(fnString)
    return fnString
}
module.exports = {
    evaluateAllFN,
    findTruth,
    findFN,
    findFNArgs,
    makesolve,
    initialParseLinks,
    makegetLinks,
    verifyLinksAndFNs,
    verifyLILinksAndFNs,
    regexVar
}