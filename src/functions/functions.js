import {findTruth} from '../util'
//GBase FN wrappers
//all FN except IFERROR will recieve args already resolved of functions
//args will always be an array
const fnArgHelpText = {
    IF:         'True or False Expression, Executed if True, Executed if False',
    IFERROR:    'Executed if no Error, Executed if there is an Error',
    SWITCH:     'Value to determine which code to run, Match Value 1, Execute this code if value matches Match Value 1, Optional Default if No matches',
    SUM:        'value 1, value 2, ...value n',
    MULTIPLY:   'value 1, value 2, ...value n',
    AVG:        'value 1, value 2, ...value n',
    MAX:        'value 1, value 2, ...value n',
    MIN:        'value 1, value 2, ...value n',
    ABS:        'value',
    SQRT:       'value',
    MOD:        'value 1, divisor',
    CEILING:    'value',
    FLOOR:      'value',
    ROUND:      'value, Optional: decimal places Default: 2, Optional: UP or DOWN Default: neither (.5 Rounds up, .49 Rounds Down',
    INT:        'value, Optional: UP or DOWN Default: UP, Optional: EVEN or ODD Default: neither (next integer)',
    AND:        'T/F Expression 1, T/F Expression 2, ...T/F Expression n',
    OR:         'T/F Expression 1, T/F Expression 2, ...T/F Expression n',
    COUNT:      'value 1, value 2, ...value n',
    COUNTALL:   'value 1, value 2, ...value n',
    TRUE:       'NO ARGUMENTS',
    FALSE:      'NO ARGUMENTS',
    NOT:        'T/F Expression',
    T:          'value',
    CONCAT:     '"Strings ", "to ", "concatenate.",...',
    JOIN:       '"quoted seperation character", "string 1". "string 2", ..."string n"',
    TEST:       '"quoted string to test", javascript regex literal'
}
const fnExamples = {
    IF:         ['IF(2<3, "A is less than B", "B is greater than or equal to A") => "A is less than B"'],
    IFERROR:    ['IFERROR(3/0, "Error" => "Error"', 'IFERROR(3/3, "Error" => 1'],
    SWITCH:     ['SWITCH(1+2, 1, "One is a little odd", 2, "Even Stevens!", 3, "Huh, thats odd...", "I am obtuse") => "Huh, thats odd..."', 'SWITCH(10+2, 1, "One is a little odd", 2, "Even Stevens!", 3, "Huh, thats odd...", "I am obtuse") => "I am obtuse"'],
    SUM:        ['SUM(1,1,2) => 4', 'SUM(-2,1,1) => 0' ],
    MULTIPLY:   ['MULTIPLY(3,1,2) => 6', 'MULTIPLY(-2,1,1) => -2' ],
    AVG:        ['AVG(1,2,3) => 2', 'AVG(12,1,1) => 4' ],
    MAX:        ['MAX(4,2,3) => 4', 'MAX(3,7,8) => 8' ],
    MIN:        ['MIN(4,2,3) => 2', 'MIN(3,7,8) => 3' ],
    ABS:        ['ABS(-2.134) => 2.134', 'ABS(7) => 7'],
    SQRT:       ['SQRT(4) => 2', 'SQRT(144) => 12'],
    MOD:        ['MOD(4,2) => 0', 'MOD(10,3) => 1'],
    CEILING:    ['CEILING(-2.134) => -2', 'CEILING(2.134) => 3'],
    FLOOR:      ['FLOOR(-2.134) => -3', 'FLOOR(2.134) => 2'],
    ROUND:      ['ROUND(-2.134) => -2.13', 'ROUND(-2.134,0) => -2','ROUND(-2.134,0,UP) => -3'],
    INT:        ['INT(-2.134) => -3', 'INT(-2.134,DOWN) => -2','INT(-2.134,UP,EVEN) => -4', 'INT(-2.134,DOWN,EVEN) => -2'],
    AND:        ['AND(2+2 < 5, 2 = 2, 3 != 2) => TRUE()', 'AND(2+10 < 5, 2 = 2, 3 != 2) => FALSE()'],
    OR:         ['OR(2+10 < 5, 2 = 3, 3 != 3) => FALSE()', 'OR(2+10 < 5, 2 = 3, 3 != 2) => TRUE()'],
    COUNT:      ['COUNT("string", "another string") => 2', 'COUNT("string", "") => 1', 'COUNT(0,1,2,3) => 4'],
    COUNTALL:   ['COUNTALL("string", "another string") => 2', 'COUNTALL("string", "") => 2', 'COUNTALL(0,1,2,3) => 4'],
    TRUE:       ['TRUE() => true'],
    FALSE:      ['FALSE() => false'],
    NOT:        ['NOT(2+2 < 5) => FALSE()', 'NOT(8 < 5) => TRUE()', 'NOT(FALSE()) => TRUE()'],
    T:          ['T("String") => "String"', 'T(123) => ""'],
    CONCAT:     ['CONCAT("Strings ", "to ", "concatenate.") => "Strings to concatenate"', 'CONCAT("Quoted", "Spaces ", "are", "Preserved  .") => "QuotedSpaces arePreserved  ."'],
    JOIN:       ['JOIN(", ", "A", "B", "C") => "A, B, C"', 'JOIN(" ","Quoted", "Spaces ", "are", "Preserved  .") => "Quoted Spaces  are Preserved  ."'],
    TEST:       ['TEST("Some String",/Some/) => TRUE()', 'TEST("Some String",/some/) => FALSE()', 'TEST("Some String",/some/i) => TRUE()']
}
function fnHelp(fn){
    if(fnExamples[fn]){
        return [fnArgHelpText[fn],fnExamples[fn]]
    }else{
        return console.log('Cannot find fn requested. Should be one of: ' + Object.keys(fnExamples).join(', '))
    }
}
function IF(args){
    if(args.length !== 3){
        throw new Error('Must pass three arguments for IF()')
    }
    if(findTruth(args[0]))return args[1]
    return args[2]
}
function SWITCH(args){
    let argslen = args.length
    let Default = false
    let out
    if(argslen % 2 === 0){//if even, last arg is default case
        Default = args[argslen-1]
    }
    let test = args[0] //add type checking and Case type coersion?
    //do we need to evaluate test?
    let Case = args.indexOf(test,1)//what if the Case+1 === another case that test might find?
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
    //args[0]=  Number() <-- Value to round
    //args[1]= Number() <-- precision, optional: default = 2
    //args[2]= 'UP' || 'DOWN'
    //round up and down work the same as Math.round(), instead of Math.floor/ceil rounding w/negatives
    if(args.length < 1){
        throw new Error('Must pass at least the first argument to ROUND(): value to be rounded')
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
        if(!arg){//catch straight up falsy values
            out = false
            break
        }
    }
    return out
}
function OR(args){
    //One must be truthy
    let out = false
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if(arg){//catch straight up truthy values
            out = true
            break
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
        throw new Error('T() can only receive one value')
    }
    let arg = args[0]
    let out
    if(typeof arg === 'string' && !isNaN(arg*1)){
        out = arg
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
    let [seperator,...other] = args
    let out = other.reduce((prev,cur) => prev + seperator + cur)
    return out

}
function TEST(args){
    let eval2 =eval
    if(args.length !== 2)throw new Error('TEST expects two arugments. Value to test, and a regex string "/regExStuffHere/gi"')
    let [value,regexStr] = args
    console.log(value,regexStr)
    let [match,regex,flags] = regexStr.match(/(\/[^\n\r]+\/)([gimuy]+)?/) || []
    if(!match)throw new Error('Regex string was not valid. Should be "/regExStuffHere/gi"')
    let r = new RegExp(eval2(regex),flags)
    return r.test(value)
}
export {
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
    INT,
    TEST,
    fnHelp
}