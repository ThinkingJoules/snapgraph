const {evaluateAllFN, findTruth} = require('./function_utils')
//GBase FN wrappers
//all FN except IFERROR will recieve args already resolved of functions
//args will always be an array
function IF(args){
    if(args.length !== 3){
        throw new Error('Must pass three arguments for IF()')
    }
    let torf = findTruth(args[0])
    if(torf){
        let out = args[1]
        return out
    }else{
        let out = args[2]
        return out
    }
}
function IFERROR(args){
    if(args.length !== 2){
        throw new Error('Must pass three arguments for IF()')
    }
    let out
    try{
        out = evaluateAllFN(args[0])
    }catch(e){
        out = evaluateAllFN(args[1])
    }
    return out
}
function SWITCH(args){
    let argslen = args.length
    let Default = false
    let out
    if(argslen % 2 === 0){//if even, last arg is default case
        Default = args[argslen-1]
    }
    let test = args[0] //add type checking and Case type coersion?
    let testType = typeof args[0]
    for (let i = 1; i < args.length; i++) {
        let arg = args[i];
        let value = false
        if(i%2){//odd args
            if(!Default){
                value = arg
            }else if(Default && i !== argslen-1){
                value = arg
            }
            if(value){
                args[i] = convertValueToType(value,testType, "SWITCH CASE")
            }
        }
        
    }
    let Case = args.indexOf(test,1)
    if(Case !== -1){//is a match
        out = args[Case+1]
    }else if(Default){
        out = Default
    }else{
        throw new Error('Cannot find matching case, and no default was specified')
    }
    return out
}
function SUM(args){
    let result = 0;
    for (let i = 0; i < args.length; i++) {
        let value = parseInt(args[i]);
        if(isNaN(value)){
            throw new Error('Value is not a number: '+ args[i])
        }
        result += value
    }
    return result;
}
function MULTIPLY(args){
    let result = 1;
    for (let i = 0; i < args.length; i++) {
        let value = parseInt(args[i]);
        if(isNaN(value)){
            throw new Error('Value is not a number: '+ args[i])
        }
        result = result * value
    }
    return result;
}
function AVG(args){
    if(args.length === 0){
        throw new Error('No arguments detected')
    }
    let result = 1;
    for (let i = 0; i < args.length; i++) {
        let value = parseInt(args[i]);
        if(isNaN(value)){
            throw new Error('Value is not a number: '+ args[i])
        }
        result = result * value
    }
    result = result / args.length
    return result;
}
function MAX(args){
    let out = Math.max(...args)
    if(isNaN(out)){
        throw new Error('All arguments must be numbers')
    }
    return out
}
function MIN(args){
    let out = Math.min(...args)
    if(isNaN(out)){
        throw new Error('All arguments must be numbers')
    }
    return out
}
function ABS(args){
    if(args.length !== 1){
        throw new Error('ABS() can only receive one value')
    }
    let out = Math.abs(args[0])
    if(isNaN(out)){
        throw new Error('Argument must be number')
    }
    return out
}
function SQRT(args){
    if(args.length !== 1){
        throw new Error('ABS() can only receive one value')
    }
    let out = Math.sqrt(args[0])
    if(isNaN(out)){
        throw new Error('Argument must be number')
    }
    return out
}
function MOD(args){
    if(args.length !== 1){
        throw new Error('ABS() can only receive one value')
    }
    let value = parseInt(args[0]);
    let divisor = parseInt(args[1])
    if(isNaN(value) || isNaN(divisor)){
        throw new Error('Value and divisor must both be numbers')
    }
    let out = value % divisor
    return out
}
function CEILING(args){
    if(args.length !== 1){
        throw new Error('CEILING() can only receive one value')
    }
    let out = Math.ceil(args[0])
    if(isNaN(out)){
        throw new Error('Argument must be number')
    }
    return out
}
function FLOOR(args){
    if(args.length !== 1){
        throw new Error('FLOOR() can only receive one value')
    }
    let out = Math.floor(args[0])
    if(isNaN(out)){
        throw new Error('Argument must be number')
    }
    return out
}
function ROUND(args){
    //args[0]= 'UP' || 'DOWN'
    //args[1]= Number() <-- Value to round
    //args[2]= Number() <-- precision, optiona;: default = 2
    //round up and down work the same as Math.round(), instead of Math.floor/ceil rounding w/negatives
    if(args.length < 2){
        throw new Error('Must pass at least the first two arguments to ROUND(): value to be rounded, and the number of decimal placess')
    }
    let [val,prec,dir] = args
    let out
    let sign = Math.sign(val)
    val = Math.abs(val)
    if(typeof dir === 'string'){
        dir = dir.toLowerCase()
    }else if(dir === undefined){
        dir = false
    }
    if(dir && (dir !== "up" && dir !== "down")){
        throw new Error('If third arugument in ROUND() is specified it must be either "up" or "down"')
    }
    if(isNaN(val)){
        throw new Error('First argrument of ROUND() must be a number')
    }
    if(prec === undefined){
        prec = 2
    }else if(isNaN(prec*1)){
        throw new Error('Second argrument of ROUND() must be a number')
    }else{
        prec = prec*1
    }
    let mult = Math.pow(10,prec)
    if(dir === 'up'){
        out = Math.ceil(val * mult) / mult
    }else if(dir === 'down'){
        out = Math.floor(val * mult) / mult
    }else{
        out = Math.round(val * mult) / mult
    }
    out = out * sign
    return out
}
function INT(args){
    //args[0]= Number() <-- Value to get to INT
    //args[1]= 'UP' || 'DOWN'
    //args[2]= 'EVEN' || 'ODD' <-- optional: default = neither
    //same as round, 
    if(args.length < 1){
        throw new Error('Must pass at least one argument to INT(): value to be changed to an integer.')
    }
    let [val,dir, eo] = args
    let out
    let sign = Math.sign(val)
    val = Math.abs(val)
    if(typeof dir === 'string'){
        dir = dir.toLowerCase()
    }else if(dir === undefined){
        dir = "up"
    }
    if(dir !== 'up' && dir !== 'down'){
        throw new Error('If second arugument in INT() is specified it must be either "up" or "down"')
    }
    if(isNaN(val)){
        throw new Error('First argrument of INT() must be a number')
    }
    if(eo === undefined){
        eo = false
    }else if(eo && (eo !== "even" && eo !== "odd")){
        throw new Error('Third argrument of INT() must be be either "even" or "odd"')
    }
    if(dir === 'up'){
        out = Math.ceil(val)
    }else if(dir === 'down'){
        out = Math.floor(val)
    }
    if(eo === 'even'){
        if(out%2 !== 0){
            if(dir === 'up'){
                out ++
            }else{
                out --
            }
        }
    }else if(eo === 'odd'){
        if(out%2 !== 1){
            if(dir === 'up'){
                out ++
            }else{
                out --
            }
        }
    }
    out = out * sign
    return out
}
function AND(args){
    //Must all be truthy
    let out = true
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let containsCompareChars = /[()+\-*/<>=!]/g.test(arg)
        if(out){//if not already false, test
            if(!arg){//catch straight up falsy values
                out = false
            }else if(containsCompareChars){//needs comparison done
                out = findTruth(arg)
            }
        }       
    }
    return out
}
function OR(args){
    //One must be truthy
    let out = false
    let falsy = [0,"",null,false,undefined]
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let containsCompareChars = /[()+\-*/<>=!]/g.test(arg)
        if(!out){//if not already true, test
            if(!containsCompareCharsarg && falsy.indexOf(arg) === -1){//catch straight up truthy values
                out = true
            }else if(containsCompareChars){//needs comparison done
                out = findTruth(arg)
            }
        }       
    }
    return out
}
function COUNT(args){
    //args.length - empty string args
    let empty = 0
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if(arg === ""){
            empty += 1
        }
        
    }
    let out = args.length - empty
    return out
}
function COUNTALL(args){
    return args.length
}
function TRUE(){
    return true
}
function FALSE(){
    return false
}
function NOT(args){
    if(args.length !== 1){
        throw new Error('NOT() can only receive one value')
    }
    return !args[0]
}
function T(args){
    //Returns the argument if it is text and blank otherwise.
    if(args.length !== 1){
        throw new Error('ABS() can only receive one value')
    }
    let arg = args[0]
    let out
    if(typeof arg === 'string'){
        if(!isNaN(arg*1)){
            out = arg
        }else{
            out = ""
        }
    }else{
        out = ""
    }
    return out
}
function CONCAT(args){
    //litereally need to concat..
    let out = args.reduce((prev,cur) => prev + cur)
    return out
}
function JOIN(args){
    //args[0] = seperator
    //args[1-n]= values to join
    let seperator = args[0]
    let other = args.slice(1)
    let out = other.reduce((prev,cur) => prev + seperator + cur)
    return out

}
module.exports = {
    IFERROR,
    SUM,
    IF,
    SWITCH,
    MULTIPLY,
    AVG,
    MAX,
    MIN,
    ABS,
    SQRT,
    MOD,
    CEILING,
    FLOOR,
    AND,
    OR,
    COUNT,
    COUNTALL,
    TRUE,
    FALSE,
    NOT,
    T,
    CONCAT,
    JOIN,
    ROUND,
    INT
}