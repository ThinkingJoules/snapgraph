//util deps

//di on fn


function setupQuery(path,queryArr,cb,isSub,sVal){
    if(!(cb instanceof Function))throw new Error('Must provide a callback!')
    if(!Array.isArray(queryArr) || !queryArr.length)throw new Error('Must provide arguments in the query Array')
    if(!queryArr.filter(x => x.CYPHER)[0] && !queryArr.filter(x => x.EXPAND)[0])throw new Error('Must specify a single CYPHER or EXPAND pattern to complete the query!')
    if(!queryArr.filter(x => x.RETURN)[0] && !queryArr.filter(x => x.EXPAND)[0])throw new Error('Must specify a single RETURN or EXPAND statement in your query!')
    if(isSub && !['string','number','symbol'].includes(typeof sVal) && !sVal)throw new Error('Must give a valid subID. Must be a truthy value that is either a string, number, or symbol')
    let qParameters = new Query(path,cb,sVal)
    parseQuery(path,qParameters,queryArr,false)
    if(isSub){
        let {b} = parseSoul(path)
        let qParams = getValue([b,sVal],querySubs)
        let validMatch = !!(qParams && !qParams.expand
            && qParams.originalReturnElements === findReturnElements(queryArr)
            && qParams.originalMatch === JSON.stringify(queryArr.filter(x => x.CYPHER)[0]))
        let validExpand = !!(qParams && qParams.expand && qParams.originalExpand === findStaticExpandElements(queryArr))
        if(validMatch || validExpand){
            //these queries have not changed since last call in a manner that will invalidate the return array structure
            //this should allow for sortBy, limit, skip, & filter changes without building a new query from scratch
            //SOME OF THE ELEMENT OPTIONS BREAK YET, NEED TO CHECK FOR MORE OPTIONS TO KNOW STUCTURE HASN'T CHANGED
            //FOR EXAMPLE anything to do with how the node structure is returned (returnAsArray, noID, noAddress, idOnly, etc..)
            qParameters = qParams
            console.log('Requery, using previously cached results as a starting point.')
            
            if(qParameters.originalQueryArr !== JSON.stringify(queryArr) || qParameters.expand){
                console.log('Updating query parameters on previous query')
                parseQuery(path,qParameters,queryArr,true)
                qParameters.resultState = false //through a requery at this point, can only effect the result shape
            }
        }
        if(qParameters.userCB !== cb)qParameters.userCB = cb //if different cb, but same sID, update value

    }
    qParameters.query()
    return {kill:qParameters.kill}
}
function findReturnElements(qArr){
    let rest = (qArr.filter(x => x.RETURN)[0] || {}).RETURN || []
    return JSON.stringify(rest.map(x => Object.keys(x)[0]))
}
function findStaticExpandElements(qArr){
    let {state,minLevel,maxLevel,uniqueness,beginSequenceAtStart,filterStartNode,labelFilter,relationshipFilter,sequence,endNodes,terminatorNodes,blacklistNodes,whitelistNodes} = ((qArr.filter(x => x.EXPAND)[0] || {}).EXPAND || [])[1] || {}
    return JSON.stringify({state,minLevel,maxLevel,uniqueness,beginSequenceAtStart,filterStartNode,labelFilter,relationshipFilter,sequence,endNodes,terminatorNodes,blacklistNodes,whitelistNodes})
}
function parseQuery(path,qParams,qArr,queryChange){//gb
    let {b} = parseSoul(path)
    qParams.sortBy = false // || ['userVar',{alias,dir}, {alias,dir},...]
    qParams.limit = Infinity
    qParams.prevLimit = Infinity
    qParams.skip = 0
    qParams.prevSkip = 0
    qParams.idOnly = false
    qParams.returning = []
    qParams.originalQueryArr = JSON.stringify(qArr)
    let elements = qParams.elements
    parseExpand()
    if(!queryChange)parseCypher()
    parseReturn()
    parseFilters()
    parseStates()
    findIDsAndTypes()
    makeCleanQ()
    scoreAll()
    if(!queryChange)qParams.originalReturnElements = findReturnElements(qArr)
    if(!queryChange)qParams.originalMatch = JSON.stringify(qArr.filter(x => x.CYPHER)[0])
    if(!queryChange)qParams.originalExpand = findStaticExpandElements(qArr)


    function parseCypher(){
        let obj = qArr.filter(x => x.CYPHER)[0]
        if(!obj && !qParams.expand)throw new Error('Must specify a single Cypher pattern to complete the query!')
        else if(!obj && qParams.expand)return
        let args = obj.CYPHER
        let {b} = parseSoul(path)
        const evaluate = {
            MATCH: function(str){
                //assign id's to each () [] or use user var
                //then parse thing by thing
                str = str.replace(/{[\s\S]*}/g,'')//remove any {prop: 'value'} filters
                console.log(str)
                str = str.replace(/(\(|\[)([a-zA-Z]+)?(:)?([a-zA-Z0-9:\`|\s]+)?/g, function(match, $1, $2, $3, $4) {//find gbID's for aliases of types,relations,labels
                    if(!$3)return match
                    let isNode = ($1 === '(')
                    let splitChar = (isNode) ? ':' : '|'
                    let aliases = [...$4.split(splitChar)]
                    let ids = []
                    let i = 0
                    let types = {t:{'#':true},r:{'-':true},l:{'&':true}}
                    for (let alias of aliases) {
                        alias = rmvBT(alias)//get rid of back ticks
                        let type
                        if(isNode && i === 0)type = types.t
                        else if(isNode)type = types.l
                        else type = types.r
                        let id = lookupID(gb,alias,makeSoul(Object.assign({},{b},type)))
                        if(id === undefined)throw new Error('Cannot parse alias for '+$4+' Alias: '+alias)
                        ids.push(id)
                        i++
                    }
                    let start = ($2) ? $1+$2+$3 : $1+$3
                    return start+ids.join(splitChar)
                });
                qParams.cleanMatch = 'MATCH '+str //what user passed in, but with no {} and ID's instead of alias'
                str = str.replace(/(<-|-)(\[[^\[\]]+\])?(->|-)/g,function(match,$1,$2,$3){// if ()--() make ()-[]-()
                    if(!$2)return $1+'[]'+$3
                    return match
                    })
                str = str.replace(/(?:\(|\[)([a-zA-Z]+)?/g, function(match, $1) {//assign id's to those that user didn't already do
                    if (!$1)return match+rand(8,'abcdefghijklmnopqrstuvwxyz')
                    return match
                });
                console.log(str)

                let m = [...str.matchAll(/(?:(\(|\[)([a-zA-Z]+)(?::)?([a-zA-Z0-9:\`|\s]+)?([*.0-9]+)?(\)|\])|(<-|->|-))/g)]
                //m[i] = ['(allParts)' || (-|->|<-), '('||'['|| undefined, id||undefined, labels||undefined, undefined||undefined||*length')'||']'|| undefined, undefined||(-|->|<-)]
                for (let i = 0; i < m.length; i+=2) {//every other element, create collector nodes first, then evaluate string
                    
                    let [match,left,id,types] = m[i];
                    let isNode = (left === '(')
                    let idx = i/2

                    if(isNode){//(id:Type:Label)
                        let typesArr = [],labelArr = [],notLabels = []
                        if(types){
                            //could be labels only..
                            //or multiple types
                            let a = types.split(':')
                            for (const name of a) {
                                let type = findID(gb,name,makeSoul({b,'#':true}))
                                let label = findID(gb,name,makeSoul({b,'&':true}))
                                if(type !== undefined)typesArr.push(type)
                                else if(label !== undefined){
                                    if(label[0] === '!')notLabels.push(label.slice(1))
                                    else labelArr.push(label)
                                }
                            }
                        }
                        //TODO MAKE SOME SORT OF SPECIAL '*' ALL INDICATOR
                        if(!typesArr.length)typesArr = getAllActiveNodeTypes(gb,path)//if none specified, can be any
                        elements[id] = new MatchNode(id,typesArr,labelArr,notLabels,idx)
                        
                    }else{//relation [id:Type|Type]
                        let typesArr
                        if(types){
                            typesArr = types.split('|')
                        }else{//could be any 'type' node
                            //TODO MAKE SOME SORT OF SPECIAL '*' ALL INDICATOR, SO WE CAN TRAVERSE QUICKLY (JUST GRAB LINKS THAT MATCH, DON'T HAVE TO CHECK)
                            //THAT WAY WE CAN JUST GET THE STATE INDICES INSTEAD OF TRAVERSING THE RELATION SRC/TRGT INDEX GRAPH
                            typesArr = getAllActiveRelations(gb,path) //double array on purpose?? Was going to AND OR with 2 arrays, took out for now.
                        }
                        elements[id] = new MatchRelation(id,typesArr,idx)
                    }
                }
                //if m.length === 1 simple nodeType query
                //if m.length > 1 then we need to parse more info
                let hasVarDepth
                if(m.length > 1){
                    for (let i = 2; i < m.length; i+=4) {//2,6,10,etc.. should be relations
                        let [match,left,id,types,length] = m[i];
                        const leftID = m[i-2] && m[i-2][2] || null
                        const rightID = m[i+2] && m[i+2][2] || null
                        let [lSign] = m[i-1]
                        let [rSign] = m[i+1]
                        let directed = (lSign !== rSign) // both '-'?
                        let thisRel = qParams.elements[id]
                        qParams.elements[id].leftThing = qParams.elements[leftID]
                        qParams.elements[id].rightThing = qParams.elements[rightID]
                        //set neighbor nodes to point at this node
                        qParams.elements[leftID].rightThing = qParams.elements[id]
                        qParams.elements[rightID].leftThing = qParams.elements[id]

                        let leftNode = qParams.elements[leftID] || null
                        let rightNode = qParams.elements[rightID] || null
                        if(length){
                            if(i!==2)throw Error('Currently only supports variable length as the first relation: ()-[*n...n]-()-[]..etc. ')
                            let l = length.match(/\*([0-9]+)?(\.+)?([0-9]+)?/)
                            let [match,min,dots,max] = l
                            if(match && hasVarDepth)throw new Error('Cannot have multiple variable length paths in one query')
                            if(match)hasVarDepth = true
                            if((!min && !dots && !max) || (dots && !max))thisRel.pathLengthRange = Infinity
                            if(min && min !== 1)thisRel.pathLength = min
                            if(dots && max)thisRel.pathLengthRange = max - thisRel.pathLength
                        }
                        if(!directed){
                            Object.defineProperties(thisRel,{
                                srcTypes:{
                                    get(){
                                        let allTypes = [...leftNode.types,...rightNode.types]
                                        return [...new Set(allTypes)]//remove duplicates
                                    },
                                    enumerable:true
                                },
                                trgtTypes:{
                                    get(){
                                        return thisRel.srcTypes
                                    },
                                    enumerable:true
                                },
                                leftIs:{
                                    value:'source',
                                    enumerable:true
                                },
                                rightIs:{
                                    value:'target',
                                    enumerable:true
                                }
                            })
                            
                            Object.defineProperties(leftNode,{
                                rightSigns:{
                                    value:['>','<'],
                                    enumerable:true
                                },
                                rightTypes:{
                                    get(){
                                        return thisRel.types
                                    },
                                    enumerable:true
                                }
                            })
                            Object.defineProperties(rightNode,{
                                leftSigns:{
                                    value:['>','<'],
                                    enumerable:true
                                },
                                leftTypes:{
                                    get(){
                                        return thisRel.types
                                    },
                                    enumerable:true
                                }
                            })                          

                        }else{
                            let src = (rSign.includes('>')) ? leftNode : rightNode //assume the other has it
                            let trgt = (rSign.includes('>')) ? rightNode : leftNode
                            Object.defineProperties(leftNode,{
                                rightSigns:{
                                    value:(rSign.includes('>')) ? ['>'] : ['<'],
                                    enumerable:true
                                },
                                rightTypes:{
                                    get(){
                                        thisRel.types
                                    },
                                    enumerable:true
                                }
                            })
                            Object.defineProperties(rightNode,{
                                leftSigns:{
                                    value:(rSign.includes('>')) ? ['<'] : ['>'],
                                    enumerable:true
                                },
                                leftTypes:{
                                    get(){
                                        thisRel.types
                                    },
                                    enumerable:true
                                }
                            })       
    
                            Object.defineProperties(thisRel,{
                                srcTypes:{
                                    get(){
                                        return src.types
                                    },
                                    enumerable:true
                                },
                                trgtTypes:{
                                    get(){
                                        return trgt.types
                                    },
                                    enumerable:true
                                },
                                leftIs:{
                                    value:(rSign.includes('>')) ? 'source' : 'target',
                                    enumerable:true
                                },
                                rightIs:{
                                    value:(rSign.includes('>')) ? 'target' : 'source',
                                    enumerable:true
                                }
                            })
                        }
                        
                    }
                }
                
    
                //on parse...
                //we need to get each 'thing' put in to it's object
                //if this is more than a simple (), then all 3 (or more..) things will effect each other.
                //need to figure out direction, *pathLength
                function mergeDefineProp(obj,prop){//for defining getter on the node
                    //a node can have two relations ()-[]->(here)<-[]-()
                    //getter needs to be accurate for `here` target. Could potentially be two different relations
                    //outgoing or incoming is [[],[]] inner arrays are OR outer array is AND
                    const define = {
                        configurable: true,
                        enumerable: true,
                        get(){
                            return thisRel.types
                        }
                    }
                    const altDefine = function(otherO){
                        return {
                            configurable: true,
                            enumerable: true,
                            get(){
                                return [...otherO.types,...thisRel.types]
                            }
                        }
                    }
                    let definition = define
                    if(obj.hasOwnProperty(prop)){
                        let leftO = obj.leftThing
                        definition = altDefine(leftO)
                    }
                    Object.defineProperty(obj,prop,definition)
                }
                function rmvBT(s){
                    return s.replace(/`([^`]*)`/g, function(match,$1){
                        if($1)return $1
                        return match
                    })
                }
            }
        }
        const validCypher = ['MATCH']
        for (let arg of args) {
            arg = arg.replace(/([^`]+)|(`[^`]+`)/g, function(match, $1, $2) {//remove whitespace not in backticks
                if($1)return $1.replace(/\s/g, '');
                return $2; 
            });
            let t
            arg = arg.replace(/([A-Z]+)/, function(match, $1) {//find and remove command ie: MATCH
                if ($1) {t = match;return ''}
            });
            if(!validCypher.includes(t))throw new Erro('Invalid Cypher command. Valid include: '+validCypher.join(', '))
            evaluate[t](arg)
        }
        
    
    }
    function parseReturn(){
        let obj = qArr.filter(x => x.RETURN)[0]
        let expand = qArr.filter(x => x.EXPAND)[0]
        let args = obj && obj.RETURN || []
        if((!obj || (args.length < 2 && !expand)) && !qParams.expand)throw new Error('Must specify at least one element from "MATCH" to return')
        else if(!obj && qParams.expand)return

        /* 
            args = //[{whole return Config},{userVar1:{configs}},...{userVarN:{configs}}]
            [
            {   //these are the options for the whole return
                sortBy: ['a',['pval1','DESC','pval2','ASC']],
                limit: 50,
                skip: 0,
                idOnly: boolean
            },
            {a:{//<<userVar, Options for returning this particular nodeThing
                returnAsArray: false,
                props: [],//can be [alias1, alias2] or options [{alias1:{as:'Different Name',raw:true}}]
                propsByID:false,//only for returnAs {}, false={'Prop Alias': propValue}, true={pval: propValue} >> also applies for include
                noID: false,//on returnAs object> object.ID = NodeID
                noAddress: false,//object.address = {}||[] if returnAs = {} then>propsByID=false={'Prop Alias': address}||true={pval: address}
                raw: false,//override setting, set for all props (helpful if props not specified(allActive) but want them as raw)
                rawLinks:false//for linked columns, it will attempt to replace with the HumanID
                idOnly: false //for list building.
                humanID: false //for getting metaData under a 'human' name based on the human ID config
                }
            }]
        */
        //parse first arg, that should be easy
        let [mainArgs,...thingsArgs] = args
        

        for (const tArg of thingsArgs) {
            let userVar = Object.keys(tArg)[0]
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            qParams.returning.push(userVar)
            elements[userVar].toReturn = true
            let args = tArg[userVar]
            for (const arg in args) {
                if(!['returnAsArray','props','propsByID','noID','noAddress','noInherit','raw','idOnly','humanID'].includes(arg))continue //skip over invalid keys
                const value = args[arg];
                if(arg === 'props'){
                    if(!Array.isArray(value))throw new Error('"props" must be an array of values')
                    parseProps(userVar,value)
                }else elements[userVar][arg] = !!value
            }
        }
        for (const key in mainArgs) {
            const arg = mainArgs[key];
            if(key === 'sortBy')parseSort(arg)
            else if(key === 'groupBy')parseGroup(arg)
            else if(key === 'limit')parseLimit(arg)
            else if(key === 'skip')parseSkip(arg)
            else if(key === 'idOnly')qParams.idOnly = !!arg
        }
        //parse each thing arg.
        //  convert props to objects. If thing already has a types.length === 1 then we can get propID as well. store as !#. ,since could have multiple types
        


        //can we allow multiple node types? yes, otherwise MATCH isn't useful
        //how do we describe the format, array of objects would be required if multitype
        function parseLimit(userArg){//done
            if(isNaN(userArg))throw new Error('Limit argument must be a number. {limit: Number()}')
            qParams.limit = userArg*1
        }
        function parseSkip(userArg){//done
            if(isNaN(userArg))throw new Error('Limit argument must be a number. {LIMIT:[Number()]}')
            qParams.skip = userArg*1
        }
        function parseSort(userArg){//done
            //args =[pval, asc || dsc]
            let [userVar, ...args] = userArg
            //can't replace pval unless we know the userVar.types.length===1
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            if(!elements[userVar].toReturn)throw new Error('Variable referenced must be part of the return')
            qParams.sortBy = []
            qParams.sortBy.push(userVar)
            for (let i = 0; i < args.length; i+=2) {
                const alias = args[i];
                if(alias === undefined)throw new Error('Must specify a property to sortBy')
                let dir = args[i+1]
                if(!dir)dir = 'DESC'
                if(!['ASC','DESC'].includes(dir))throw new Error('Direction must be either "ASC" or "DESC".')
                qParams.sortBy.push({alias,dir})
            }
            //store as self.sortBy = [userVar,{alias: userArg, ids:[],dir:ASC},{alias: userArg, ids:[], dir:DESC}]
            
        }
        function parseGroup(userArg){//done
            //userArg should be [userVar, pval]
            let [userVar,...args] = userArg
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            qParams.groupBy = []
            qParams.groupBy.push(userVar)
            for (const alias of args) {
                if(alias === undefined)throw new Error('Must specify a single property to groupBy')
                qParams.groupBy.push({alias})
            }
        }
        function parseProps(userVar,userArg){
            //can be [alias1, alias2] or options [{alias1:{as:'Different Name',raw:true}}]
            elements[userVar].props = []
            for (const arg of userArg) {
                if(typeof arg === 'string'){
                    elements[userVar].props.push({alias:arg})
                }else if(typeof arg === 'object'){
                    let {alias,as,raw} = arg
                    elements[userVar].props.push({alias,as,raw})
                }
            }
        }
        
    }
    function parseExpand(){
        //[{EXPAND:[arrOfnodeIDs, {expand configs}]}]
        //returnAs: "nodes","relationships", or "paths"
        //userVarFromMatch = isNode
        //configs{returnAs,states,minLevel,maxLevel,uniqueness,skip,limit,beginSequenceAtStart,labelFilter,relationshipFilter,sequence,whitelistNodes,blacklistNodes,endNodes,terminatorNodes}
        let obj = qArr.filter(x => x.EXPAND)[0]
        let retur = qArr.filter(x => x.RETURN)[0]
        if(!obj && !retur)throw new Error('Must specify a single RETURN/EXPAND statement in your query!')
        if(!obj)return
        if(obj && retur)throw new Error('Can only specify a single RETURN/EXPAND statement in your query!')
        let args = obj.EXPAND
        if(args.length < 1)throw new Error('Must specify an array of IDs to work from.')
        let [arrOfnodeIDs,configs] = args
        if(!Array.isArray(arrOfnodeIDs) && typeof arrOfnodeIDs === 'string' && DATA_INSTANCE_NODE.test(arrOfnodeIDs))arrOfnodeIDs = [arrOfnodeIDs]
        else if(!Array.isArray(arrOfnodeIDs))throw new Error('Must specify an array of nodeIDs for EXPAND, first element in arguments array.')
        if(!elements.EXPAND)qParams.elements.EXPAND = new MatchNode('EXPAND',false,false,false,0)

        let validArgs = ['returnAs','minLevel','maxLevel','uniqueness','limit','skip','beginSequenceAtStart',
            'filterStartNode','whitelistNodes','blacklistNodes','endNodes','terminatorNodes','labelFilter','relationshipFilter','sequence','states']
        let validSkip = ['labelFilter','relationshipFilter','sequence','skip','limit','returnAs']

        for (const arg in configs) {
            if(!validArgs.includes(arg) || validSkip.includes(arg))continue
            const value = configs[arg];
            if(['whitelistNodes','blacklistNodes','endNodes','terminatorNodes'].includes(arg)){
                if(!Array.isArray(value))throw new Error('If specifiying a list of Nodes, it must be an array.')
                for (const id of value) {
                    if(!DATA_INSTANCE_NODE.test(id))throw new Error('Invalid ID specified in list')
                }
            }else if(['minLevel','maxLevel','limit','skip'].includes(arg)){
                if(isNaN(value))throw new Error('Argument must be a number for: minLevel, maxLevel,skip, limit')
            }else if(arg === 'uniqueness'){
                const valid = ['NODE_GLOBAL','RELATIONSHIP_GLOBAL','NONE']
                if(!valid.includes(value))throw new Error('Only valid uniqueness checks are: '+valid.join(', '))
            }else{//rest are boolean
                value = !!value
            }
            if(arg === 'states' && !Array.isArray(value))['active']
            elements.EXPAND[arg] = value
        }

        let {labelFilter,relationshipFilter,sequence,skip,limit,returnAs} = configs
        if(skip !== undefined)qParams.skip = skip
        if(limit !== undefined)qParams.limit = limit
        if(sequence){
            if(!Array.isArray(sequence) || !sequence.length)throw new Error('Sequence must be an array with one or more filter arguments')
            let convert = []
            if(!beginSequenceAtStart)elements.EXPAND.firstRelations = [parseRelationFilter(sequence[0])]
            sequence = sequence.slice(1)
            for (let i = 0; i < sequence.length; i++) {
                const seqArg = sequence[i];
                if(i%2){//odds
                    convert.push(parseRelationFilter(seqArg))                    
                }else{
                    convert.push(parseLabelFilter(seqArg))
                } 
            }
            elements.EXPAND.sequence = convert
        }else if(labelFilter){
            if(!Array.isArray(labelFilter) || !labelFilter.length)throw new Error('labelFilter must be an array with one or more filter arguments')
            //labelFilter must be an array ['someLabel|andOtherLabel','sequenceLabel']
            if(labelFilter.length > 1){
                sequence = []
                for (const seqArg of labelFilter) {
                    sequence.push(parseLabelFilter(seqArg))
                    sequence.push(parseRelationFilter('*'))// * means any/all relations/dirs
                }
                elements.EXPAND.sequence = sequence
            }else{
                elements.EXPAND.labelFilter = parseLabelFilter(labelFilter[0])
            }  
        }else if(relationshipFilter){
            if(!Array.isArray(relationshipFilter) || !relationshipFilter.length)throw new Error('relationshipFilter must be an array with one or more filter arguments')
            if(relationshipFilter.length > 1){
                if(!beginSequenceAtStart){
                    firstRelations = [parseRelationFilter(relationshipFilter[0])]
                    relationshipFilter = relationshipFilter.slice(1)
                }
                sequence = ['*']
                //parse/add to sequence
                for (const seqArg of relationshipFilter) {
                    sequence.push(parseRelationFilter(seqArg))
                    sequence.push('*')// * means any/all nodes
                }
                elements.EXPAND.sequence = sequence
            }else{
                elements.EXPAND.relationshipFilter = [parseRelationFilter(relationshipFilter[0])]
            }
        }else{//they provided no filters at all
            //default is any relationship
            elements.EXPAND.relationshipFilter = [parseRelationFilter('*')]

        }
        qParams.expand = true

        qParams.elements.EXPAND.startNodes = [...new Set(arrOfnodeIDs.filter(x => DATA_INSTANCE_NODE.test(x)))]
        qParams.elements.EXPAND.returnAs = ['nodes','relationships','paths'].includes(returnAs) && returnAs || 'nodes'

        function parseLabelFilter(arg){
            let orLabels = arg.split('|')
            let labels = [],not = [],term = [],end = []
            for (const label of orLabels) {
                //any can be compound label1:label2
                //any of the elements can have one of +-/> leading
                let [firstChar,andLabels] = splitAndType(label)
                andLabels = andLabels.map(x => lookupID(gb,x,path))
                if(firstChar === '>')end.push(andLabels)
                else if(firstChar === '/')term.push(andLabels)
                else if(firstChar === '-')not.push(andLabels)
                else labels.push(andLabels)
            }
            return {labels,not,term,end}
            function splitAndType(orLabel){
                let f = orLabel[0]
                if('+/>-'.includes(f))orLabel = orLabel.slice(1)
                let ands = orLabel.split(':')
                return [f,ands]
            }

        }
        function parseRelationFilter(arg){
            let bsoul = makeSoul({b})
            let orLabels = arg.split('|')
            let args = dirAndType(orLabels)
            return args
            function dirAndType(orLabels){
                let out = {}
                for (let orLabel of orLabels) {
                    let f = orLabel[0]
                    let l = orLabel[orLabel.length-1]
                    let dirs = []
                    if(f === '<'){orLabel = orLabel.slice(1);dirs.push(f)}
                    else if(l === '>'){orLabel = orLabel.slice(0,-1);dirs.push(l)}
                    else dirs = ['<','>']
                    if(orLabel && orLabel !== '*'){
                        out[lookupID(gb,orLabel,bsoul)] = dirs
                    }else{
                        let allTypes = getAllActiveRelations(gb,path)
                        let toRet = []
                        for (const rType of allTypes) {
                            let strType
                            if(dirs.length === 1){
                                if(dirs[0] === '<')strType = '<'+rType
                                else strType = rType+'>'
                            }else{
                                strType = rType
                            }
                            toRet.push(strType)
                        }
                        Object.assign(out, dirAndType(toRet))
                    }
                }
                
                return out
            }
        }
    
    }
    function parseFilters(){
        let parse = ['FILTER','RANGE']
        for (const qArgObj of qArr) {
            let key = Object.keys(qArgObj)[0]
            if(!parse.includes(key))continue
            if(!Array.isArray(qArgObj[key]))throw new Error('Query arguments must be in an array: [{ARG:[parameters]}]')
            if(key==='FILTER')parseFilter(qArgObj)
            else if(key==='RANGE')parseRange(qArgObj)
        }

        function parseFilter(obj){//
            //obj = {FILTER: [userVar,'FN string']}
            //fnString = 'ID(!#$)' || '{prop} > 3' || 'AND({prop1} > 3,{prop2} < 5) if prop has spaces or symbols, must be in `prop with space!!@#$`
            let validFilterFN = ['ABS','SQRT','MOD','CEILING','FLOOR','ROUND','INT','COUNT','NOT','T','AND', 'OR','TRUE','FALSE','TEST']
            let [userVar,fnString] = obj.FILTER
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            let fnSearch = /([A-Z]+)\(/g //get fn names
            let IDpattern = /ID\((.*)\)/
            let noBT = fnString.replace(/`.*`/g,0)//backticks might match pattern accidentally
            let fn
            let idMatch = noBT.match(IDpattern) || []
            if(idMatch.length){
                console.log(idMatch[1])
                console.log(idMatch[1].matchAll(/![a-z0-9]+(?:#|-)[a-z0-9]+\$[a-z0-9_]+/gi))
                elements[userVar].ID = [...idMatch[1].matchAll(/![a-z0-9]+(?:#|-)[a-z0-9]+\$[a-z0-9_]+/gi)].map(x => x[0])
                return
            }
            let i = 0
            while (fn = fnSearch.exec(noBT)) {
                let [m,a] = fn
                if(i === 0 && a === 'AND')elements[userVar].filterArgs = findFNArgs(noBT).length
                else if(!elements[userVar].filterArgs)elements[userVar].filterArgs = 1
                if(!validFilterFN.includes(a))throw new Error('Invalid FN used inside of "FILTER". Valid FNs :' + validFilterFN.join(', '))
            }
            basicFNvalidity(fnString)//  ??
            elements[userVar].filter = fnString
        }
        function parseRange(obj){
            //obj = {RANGE: [userVar,{index:{from,to,items,relativeTime,timePointToDate,lastTimeUnit,firstDayOfWeek}}]}
            //Needs to end up with a from, to
            //from and to must be date obj or unix time
            console.log("RANGE",obj)
            if(!obj.RANGE)return false
            let [userVar,ranges] = obj.RANGE
            //ranges is an object with keys of index's (props || _CREATED) and value of object with params
            if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
            elements[userVar].ranges = []
            for (const index in ranges) {
                const params = ranges[index];
                let {to,from} = calcToFrom(params)
                elements[userVar].ranges.push({alias:index,to,from})
            }
            function calcToFrom(args){
                let {from,to,relativeTime,timePointToDate,lastTimeUnit,firstDayOfWeek} = args
                let out = {}
                if((from || to) && (timePointToDate || lastTimeUnit || relativeTime))throw new Error('Too many arguments in RANGE. use "from" & "to" OR "toDate" OR "last" OR "relavtiveTime"')
                if(firstDayOfWeek){
                    if(isNaN(firstDayOfWeek)){
                        throw new Error('Invalid first day of week. Must be a number between 0-6. Sunday = 0')
                    }
                }else{
                    firstDayOfWeek = 0
                }
                if(timePointToDate && !lastTimeUnit){
                    let valid = ['year','month','week','day']
                    if(!valid.includes(timePointToDate.toLowerCase()))throw new Error('toDate preset only accepts: '+ valid.join(', '))
                    let now = new Date()
                    let year = now.getFullYear()
                    let month = now.getMonth()
                    let dayOfMonth = now.getDate()
                    let dayOfWeek = now.getDay()
                    switch (timePointToDate.toLowerCase()) {
                        case 'year':
                            from = new Date(year,0)
                            break;
                        case 'month':
                            from = new Date(year,month)
                            break;
                        case 'week':  
                            let nd = dayOfWeek
                            let fd = firstDayOfWeek
                            let diff = 0
                            if(nd-fd > 0){
                                diff = nd-fd
                            }else if(nd-fd < 0){
                                diff = nd-fd + 7
                            }                
                            dayOfMonth += diff*-1
                            from = new Date(year,month,dayOfMonth)
                            break;
                        case 'day':
                            from = new Date(year,month,dayOfMonth)
                            break;
                        default:
                            break;
                    }
                }else if(!timePointToDate && lastTimeUnit){
                    let valid = ['year','quarter','month','week','day','hour']
                    if(!valid.includes(lastTimeUnit.toLowerCase()))throw new Error('"last" preset only accepts: '+ valid.join(', '))
                    let now = new Date()
                    let year = now.getFullYear()
                    let month = now.getMonth()
                    let dayOfMonth = now.getDate()
                    let dayOfWeek = now.getDay()
                    let hour = now.getHours()
    
                    switch (lastTimeUnit.toLowerCase()) {
                        case 'year':
                            from = new Date(year-1,0)
                            to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                            break;
                        case 'quarter':
                            let current = (month + 1)/3
                            if(current <=1){//q1
                                from = new Date(year-1,9)
                                to = new Date(year,0,1,0,0,0,-1)//last ms in last year
                            }else if(current <= 2){
                                from = new Date(year,0)//jan 1
                                to = new Date(year,3,1,0,0,0,-1)//last ms in march
                            }else if(current <=3){
                                from = new Date(year,3)//april 1
                                to = new Date(year,5,1,0,0,0,-1)//last ms in june
                            }else{
                                from = new Date(year,3)//July 1
                                to = new Date(year,9,1,0,0,0,-1)//last ms in sept
                            }
                            break;
                        case 'month':
                            from = new Date(year,month-1)
                            to = new Date(year,month,1,0,0,0,-1)//last ms in last month
                            break;
                        case 'week':  
                            let nd = dayOfWeek
                            let fd = firstDayOfWeek
                            let diff = 0
                            if(nd-fd > 0){
                                diff = nd-fd
                            }else if(nd-fd < 0){
                                diff = nd-fd + 7
                            }                
                            dayOfMonth += diff*-1
                            from = new Date(year,month,dayOfMonth-7)
                            to = new Date(year,month,dayOfMonth,0,0,0,-1)//last ms in yesterday
                            break;
                        case 'day':
                            from = new Date(year,month,dayOfMonth-1)
                            to = new Date(year,month,dayOfMonth,0,0,0,-1)//last ms in yesterday
                            break;
                        case 'hour':
                            from = new Date(year,month,dayOfMonth,hour-1)
                            to = new Date(year,month,dayOfMonth,hour,0,0,-1)//last ms in last hour
                            break;
                        default:
                            break;
                    }
                }
                if(relativeTime){
                    //Number() + ...
                    //y = year (relative date, from: -365days to: Infinity)
                    //w = week (-Number() * 7days)
                    //d = day (-Number() of days)
                    //h = hours (-Number() of hours)
                    //m = minutes
                    let valid = 'ywdhm'
                    let num = relativeTime.slice(0,relativeTime.length-1)*1
                    let unit = relativeTime[relativeTime.length-1]
                    if(isNaN(num))throw new Error('If you are specifiying a relative time it should be some number with a single letter specifying units')
                    if(!valid.includes(unit.toLowerCase()))throw new Error('Invalid unit. Must be one of: y, m, w, d, h. (year, month, week, day, hour)')
                    let now = new Date()
                    let year = now.getFullYear()
                    let dayOfMonth = now.getDate()
                    let curHour = now.getHours()
                    let minute = now.getMinutes()
                    let fromDate = new Date()
                    switch (unit) {
                        case 'y':
                            from = fromDate.setFullYear(year-num)
                            break;
                        case 'w':
                            from = fromDate.setDate(dayOfMonth-(7*num))
                            break;
                        case 'd':
                            from = fromDate.setDate(dayOfMonth-num)
                            break;
                        case 'h':
                            from = fromDate.setHours(curHour-num)
                            break;
                        case 'm':
                            from = fromDate.setMinutes(minute-num)
                            break;
                        default:
                            break;
                    }
            
                }
                if(from && from instanceof Date){
                    out.from = from.getTime()
                }else if(from && !(from instanceof Date)){
                    let d = new Date(from) //if it is unix or anything valid, attempt to make a date
                    if(d.toString() !== 'Invalid Date'){
                        out.from = d.getTime()
                    }else{
                        throw new Error('Cannot parse "from" argument in RANGE')
                    }
                }else{
                    out.from = -Infinity
                }
                if(to && to instanceof Date){
                    out.to = to.getTime()
                }else if(to && !(to instanceof Date)){
                    let d = new Date(to) //if it is unix or anything valid, attempt to make a date
                    if(d.toString() !== 'Invalid Date'){
                        out.to = d.getTime()
                    }else{
                        throw new Error('Cannot parse "to" argument in RANGE')
                    }
                }else{
                    out.to = Infinity
                }
                if(out.from === -Infinity && out.to === Infinity)throw new Error('Must specifiy at least one limit in a time range')
    
                return out
            }
        }
        
    }
    function parseStates(){
        for (const qArgObj of qArr) {
            let key = Object.keys(qArgObj)[0]
            if(key !== 'STATE')continue
            if(!Array.isArray(qArgObj[key]))throw new Error('Query arguments must be in an array: [{ARG:[parameters]}]')
            parseState(qArgObj)
        }
        function parseState(obj){
            //obj = {STATE: [{userVar:[allowable states... 'active' &| 'archived']}]}
            //Needs to end up with a from, to
            //from and to must be date obj or unix time
            if(!obj.STATE)return false
            let [stateObj] = obj.RANGE
            //ranges is an object with keys of index's (props || _CREATED) and value of object with params
            for (const userVar in stateObj) {
                if(!elements[userVar])throw new Error('Variable referenced was not declared in the MATCH statement')
                const stateArr = stateObj[userVar];
                if(!Array.isArray(stateArr)) stateArr = ['active'] //default instead of error
                elements[userVar].validStates = stateArr
            }
        }
    }
    function findIDsAndTypes(){
        //collect all pvals reffed for the this particular thing
        //  sort,group,filter,ranges
        //for each alias, go find all potential types that have that.
        //  index results on self.aliasToID = {!#:{[alias]:pval}}
        //if all potential list is longer than user-specified, ignore the potential list
        //  else if the potential is shorter, update the things.types array with the potentials

        for (const userVar in elements) {
            const {isNode,filter,ranges,props,types:curTypes} = elements[userVar];
            let propRef = /\{(?:`([^`]+)`|([a-z0-9]+))\}/gi
            let allNames = new Set()
            if(filter){
                let names = [...filter.matchAll(propRef)]
                for (const [m,a,b] of names) {
                    let name = (a !== undefined) ? a : b
                    allNames.add(name)
                    elements[userVar].filterProps.push(name)

                    let v = collectPropIDs(gb,path,name,isNode)
                    for (const key in v) {
                        const vals = v[key];
                        if(!qParams.aliasToID[key])qParams.aliasToID[key] = vals
                        else Object.assign(qParams.aliasToID[key],vals)
                    }
                }
            }
            for (const {alias:name} of ranges) {
                if(name === '_CREATED')continue //??
                allNames.add(name)
                let v = collectPropIDs(gb,path,name,isNode)
                for (const key in v) {
                    const vals = v[key];
                    if(!qParams.aliasToID[key])qParams.aliasToID[key] = vals
                    else Object.assign(qParams.aliasToID[key],vals)
                }
            }

            for (const {alias:name} of props) {
                allNames.add(name)
                let v = collectPropIDs(gb,path,name,isNode)
                for (const key in v) {
                    const vals = v[key];
                    if(!qParams.aliasToID[key])qParams.aliasToID[key] = vals
                    else Object.assign(qParams.aliasToID[key],vals)
                }
                
            }
            if(qParams.sortBy && qParams.sortBy[0] === userVar){//has a sort output
                let arr = qParams.sortBy.slice(1)
                for (const {alias:name} of arr) {
                    allNames.add(name)
                    
                    let v = collectPropIDs(gb,path,name,isNode)
                    for (const key in v) {
                        const vals = v[key];
                        if(!qParams.aliasToID[key])qParams.aliasToID[key] = vals
                        else Object.assign(qParams.aliasToID[key],vals)
                    }
                }
            }
            //console.log(allNames)
            //console.log(elements[userVar].types,self.aliasToID.types([...allNames],isNode),[...allNames])
            let potentials
            if(!allNames.length){//nothing specified, potential... is.. limitless...
                potentials = (isNode) ? getAllActiveNodeTypes(gb,path) : getAllActiveRelations(gb,path)
            }else{
                potentials = [...intersect(new Set(elements[userVar].types),new Set(qParams.aliasToID.types([...allNames],isNode)))]
            }
            elements[userVar].types = (curTypes.length <= potentials.length) ? curTypes : potentials
            //^^Intersect what is existing, with what is valid
        }




        //all rules below are for those nodes that don't already have a thing.types.length ===1

        //if it is being sorted,grouped or there are a subset or props being returned back, then all nodeTypes must have those alias's
        //if it has a filter/range then match all types that have those alias's
        //replace out all references.
    }
    function makeCleanQ(){
        let noCypher = qArr.filter(x => !x.CYPHER)
        let c = {CYPHER:[qParams.cleanMatch]}
        noCypher.push(c)
        qParams.cleanQuery = noCypher
    }
    function scoreAll(){
        //time ranges are worth ((1000*60*60*24)*100)/(to-from) <<<Basically 100 points for the range being only a single day.
        //^^^if to=Infinity => to = new Date(99999).getTime() if from=-Infinity => from = new Date(-99999).getTime()

        //ID is worth Infinity points (basically always start with that)

        //Labels are labels.length * 20

        //Type = 20/thing.types.length

        //filters = filterArgs*20 >> if the top fn is AND, then we multiply the args since it is more specific.

        //relation specific: 40/(leftThing.types.length + rightThing.types.length)

        //thing has a total score, then it must have an internal 'start' index > 'range','types','labels','id'


        //pick highest range score + filter score + ID + label + type

        for (const thing in elements) {
            const obj = elements[thing];
            obj.scoreCalc()
        }
        for (const thing in elements) {
            const obj = elements[thing];
            obj.leftScore = scoreLeft(obj)
            obj.rightScore = scoreRight(obj)
        }
        function scoreLeft(thing){
            let l = thing.leftThing || null
            let score = 0
            if(l === undefined)return score
            while (l !== null) {
                score += l.score
                if([null,undefined].includes(l.leftThing))break
                l = l.leftThing
            }
            return score
        }
        function scoreRight(thing){
            let r = thing.rightThing || null
            let score = 0
            if(r === undefined)return score
            while (r !== null) {
                score += r.score
                if([null,undefined].includes(r.rightThing))break
                r = r.rightThing
            }
            return score
        }
    }
}
function MatchNode(userVar,types,labelArr,notLabels,mIdx){
    this.userVar = userVar
    this.isNode = true
    this.types = types || []
    this.labels = labelArr || []
    this.not = notLabels || []
    this.score = 0
    this.bestIndex = ''
    this.toReturn = false
    this.localDone = false
    this.matchIndex = mIdx
    this.nodeUsedInPaths = {} //{nodeID: Set{JSON.stringify(fullPath)}}
    this.validStates = ['active']
    this.nodes = {} //{[nodeID]:{state:true,labels:true,filter:true,match:true,passing:true}}

    //expand
    this.minLevel = 1
    this.maxLevel = 1
    this.uniqueness = "NODE_GLOBAL"
    this.beginSequenceAtStart = true
    this.filterStartNode = false
    this.labelFilter = false
    this.relationshipFilter = false
    this.sequence = false
    this.expand = false
    this.firstRelations = []
    this.whitelistNodes = []
    this.blacklistNodes = []
    this.terminatorNodes = []
    this.endNodes = []

    this.startNodes = []
    this.startNodesChecked = new Set()
    this.previousStarts = []


    
    //traversal
    this.toCheck = new Set()
    this.traversed = new Set()
    this.passing = {}//things that passed locally (filters,ranges. Nothing todo with connected nodes)
    this.filtered = {}
    this.failing = {}
    this.activeExpandNodes = new Set()

    //filters
    this.filter = '' //fnString
    this.filterProps = [] //contains alias' from the filter fnString
    this.filterArgs = 0 //use for scoring
    this.ranges = [] //[{alias,to,from,score},..etc] //score ranges as they are entry points as well.
    this.ID = []


    //return config, only used if output = true
    this.returnAsArray = false // {} || []
    this.props = [] //[{alias,as:'Different Name',raw:true}]{alias}]//
    this.propsByID = false//only for returnAs {}, false={'Prop Alias': propValue}, true={pval: propValue} >> also applies for include
    this.noID = false//on returnAs object> object.ID = NodeID
    this.noAddress = false//object.address = {}||[] if returnAs = {} then>propsByID=false={'Prop Alias': address}||true={pval: address}
    this.raw = false//override setting, set for all props (helpful if props not specified(allActive) but want them as raw)
    this.rawLabels = false//for label prop, it will replace with the alias
    let self = this
    Object.defineProperties(self, {
        scoreCalc: {
            value: function(){
                let id=0,filter,range=0,types,labels
                if(this.ID.length)id=Infinity
                filter = this.filterArgs*20
                types = Math.round(20/this.types.length)
                types = (types === Infinity) ? 0 : types
                labels = this.labels.length*20
                for (const idx of this.ranges) {
                    let {from,to} = idx;
                    if(from === -Infinity)from = new Date(-99999,0).getTime()
                    if(to === Infinity)to = Date.now()
                    let s = Math.round(((1000*60*60*24)*100)/(to-from))
                    idx.score = s
                    if(s>range)range = s
                }
                this.ranges.sort((a,b)=>b.score-a.score)
                this.bestIndex = [[id,'id'],[range,'range'],[types,'types'],[labels,'labels']].sort((a,b)=>b[0]-a[0])[0][1]
                let total = id+filter+range+types+labels
                this.score = total
                return total
            }
        },
        validRelations:{
            value: function(leftOrRight){
                //returns [rIDarr,signsArr] || false
                let signs,types//if it is either, then it doesn't matter
                let dirThing = this[leftOrRight+'Thing']
                if(!dirThing)return false
                types = dirThing.types
                signs = this[leftOrRight+'Signs']
                return [types,signs]
            }
        }
    });

}
function MatchRelation(userVar,types,mIdx){
    this.userVar = userVar
    this.isNode = false
    this.types = types || []
    this.pathLength = 1 //lower limit on the range
    this.pathLengthRange = 0 //pathLength + this number for upper limit
    this.score = 0
    this.return = false
    this.localDone = false
    this.matchIndex = mIdx
    this.validStates = ['active']
    this.nodes = {} //{[nodeID]:{state:'active',labels:[],filter:{pval:val}}}


    //traversal
    this.traversed = new Set()
    this.toCheck = new Set()
    this.linksToRight = {}
    this.relations = {} //{relationID:'src' OR 'trgt'}
    this.passing = {}//things that passed locally (filters,ranges. Nothing todo with connected nodes)
    this.failing = {}

    //filters
    this.filter = '' //fnString
    this.filterProps = [] //contains alias' from the filter fnString
    this.filterArgs = 0 //use for scoring
    this.ranges = [] //[{alias,to,from,score},..etc] //score ranges as they are entry points as well.
    this.ID = []

    //return config, only used if output = true
    this.returnAsArray = false // {} || []
    this.props = [] //[{alias,ids:[],as:'Different Name',raw:true}]{ids:[]}]//pvals should be !#. || !-.
    this.propsByID = false//only for returnAs {}, false={'Prop Alias': propValue}, true={pval: propValue} >> also applies for include
    this.noID = false//on returnAs object> object.ID = NodeID
    this.noAddress = false//object.address = {}||[] if returnAs = {} then>propsByID=false={'Prop Alias': address}||true={pval: address}
    this.raw = false//override setting, set for all props (helpful if props not specified(allActive) but want them as raw)
    Object.defineProperties(this, {
        scoreCalc: {
            value: function(){
                let id=0,filter,range=0,types
                if(this.ID.length)id=Infinity
                filter = this.filterArgs*20
                types = Math.round(60/(this.srcTypes.length + this.trgtTypes.length + this.types.length))
                types = (types === Infinity) ? 0 : types
                for (const idx of this.ranges) {
                    let {from,to} = idx
                    if(from === -Infinity)from = new Date(-99999,0).getTime()
                    if(to === Infinity)to = Date.now()
                    let s = Math.round(((1000*60*60*24)*100)/(to-from))
                    idx.score = s
                    if(s>range)range = s
                }
                this.ranges.sort((a,b)=>b.score-a.score)
                this.bestIndex = [[id,'id'],[range,'range'],[types,'types']].sort((a,b)=>b[0]-a[0])[0][1]
                let total = id+filter+range+types
                if(this.varLen)total = 0 //we cannot start on a variable length relation pattern
                this.score = total
                
                return total
            }
        },
        varLen: {
            value: !!this.pathLengthRange,
            enumerable:true
        },
        maxDepth: {
            value: this.pathLength + this.pathLengthRange,
            enumerable:true
        }


    });
}
function Path(thingObj,id,nextRel,idType){
            
    if(thingObj instanceof Path){//copy a path for branching
        let newPath = thingObj.curPath.slice()
        let otherType = (idType === 'SRC') ? 'TRGT' : 'SRC'
        let rThing = [nextRel]
        rThing[idType] = id
        rThing[otherType] = newPath[newPath.length-1]
        if(nextRel)newPath.push(rThing)
        this.curPath = newPath
        this.depth = (nextRel) ? thingObj.depth + 1 : thingObj.depth
        this.minLevel = thingObj.minLevel
        this.maxLevel = thingObj.maxLevel
        this.filterBy = thingObj.filterBy
        this.fullSeq = thingObj.fullSeq
        this.firstRelations = thingObj.firstRelations
        this.curID = id
        this.hasEndNode = JSON.parse(JSON.stringify(thingObj.hasEndNode))
        this.filter = JSON.parse(JSON.stringify(thingObj.filter))//if this is a sequence 
        this.validStates = thingObj.validStates

    }else{
        let {minLevel,maxLevel,sequence,labelFilter,relationshipFilter,firstRelations,validStates} = thingObj
        this.curPath = []
        this.depth = 0
        this.minLevel = minLevel
        this.maxLevel = maxLevel
        this.filterBy = (sequence && 'sequence') || (labelFilter && 'label') || (relationshipFilter && 'relationship')
        this.fullSeq = JSON.parse(JSON.stringify(sequence || [])) //in case we are using a sequence, we need to 'copy' it to filter if filter is fully consumed.
        this.filter = sequence || labelFilter || relationshipFilter || []
        this.firstRelations = JSON.parse(JSON.stringify(firstRelations || []))
        this.curID = id
        this.hasEndNode = (this.filterBy === 'label' && labelFilter.filter(x=>x.end.length)[0]) || false
        this.filter = JSON.parse(JSON.stringify(this.filter))
        this.validStates = validStates
    }
    
}
function Query(path,userCB,sID){//gb,data(gun/snap)
    this.userCB = userCB
    this.sID = sID
    this.b = parseSoul(path).b
    this.elements= {}
    this.sortBy = false // || ['userVar',{alias,dir}, {alias,dir},...]
    this.limit = Infinity
    this.prevLimit = Infinity
    this.skip = 0
    this.prevSkip = 0
    this.idOnly = false
    this.aliasToID = {} //{!#:{[alias]:pval}}
    this.returning = []
    this.expand = false


    this.result = []  //using preReturn, preserve order and get the props user requested. This is what is returned
    

    this.runs = 0
    this.checkNodes = {}
    this.state = '' //to know if this is already set to requery or not
    //VV these are state flags for when data has changed. It will false the state that probably needs to be checked.
    this.filterState = false //is filter accurate?
    this.sortState = false //is sort accurate?
    this.resultState = false //is result accurate?
    this.pathsToRemove = {}
    
    this.observedStates = {} //{nodeID: 'active' || 'archived' || null}

    this.nodeIn = {}
    this.paths = []
    this.pathStrings = {}

    this.expandTraversed = new Set() //used in expand, based on 'uniqueness' setting, could have relations, nodes
    this.relationsTraversed = new Set() //used in match

    
    //subscription mgmt
    this.addrSubs = {} //{[addr]:{sort:sID,element:{[userVar]:{state:sID,labels:sID,range: sID,filter:sID}},paths:{[pathStr]:{[jval]:sID}}}}


    //metrics
    this.noMetrics = false //need like meta options for the query
    this.counter1 = 0
    this.counter2 = 0
    this.metrics = {}

    Object.defineProperty(this.aliasToID,'aliasTypes',{
        value: function(alias,isNode){
            let a = Object.entries(this)
            let has = (isNode) ? '#' : '-'
            let b = a.filter(ar => ar[0].includes(has) && (ar[1][alias] !== undefined || Object.values(ar[1]).includes(alias))).map(arr => parseSoul(arr[0])[has])
            return b
        }
    })
    Object.defineProperty(this.aliasToID,'types',{
        value: function(aliasArr,isNode){
            let a = Object.entries(this)
            let sym = (isNode) ? 't' : 'r'
            let valid = a.filter(ar => ALL_TYPE_PATHS.test(ar[0]) && ar[0].includes(sym))
            let allTypes = new Set(valid.map(x => parseSoul(x[0])[sym]))
            for (const alias of aliasArr) {
                let has = new Set(this.aliasTypes(alias,isNode))
                allTypes = intersect(allTypes,has)
            }
            return [...allTypes]
            
        }
    })
    Object.defineProperty(this.aliasToID,'id',{
        value: function(node,alias){
            let {b,t,r} = parseSoul(node)
            let thingType = makeSoul({b,t,r})
            let id = getValue([thingType,alias],this) || Object.values(this[thingType]).includes(alias) && alias || undefined
            return id
            
        }
    })
    
    Object.defineProperty(this,'elementRank',{
        get(){
            let e = Object.entries(this.elements)
            return e.sort((a,b)=> b[1].score-a[1].score).map(el => el[0])
        },
        enumerable:true
    })
    Object.defineProperty(this,'leftMostThing',{
        get(){
            let userVar = Object.keys(this.elements)[0]//just take first one
            let leftMost = userVar
            let hasLeft = this.elements[userVar].leftThing
            if(hasLeft === undefined)return leftMost
            while (hasLeft !== null) {
                hasLeft = this.elements[leftMost].leftThing
                if(hasLeft !== null)leftMost = hasLeft.userVar
            }
            return leftMost
        },
    })
    Object.defineProperty(this,'leftToRightReturnOrder',{
        get(){
            let order = []
            let curThingVar = this.leftMostThing
            let hasRight
            while (hasRight !== null) {
                let {toReturn} = this.elements[curThingVar]//just take first one
                if(toReturn)order.push(this.elements[curThingVar].userVar)
                hasRight = this.elements[curThingVar].rightThing
                curThingVar = hasRight && hasRight.userVar || false
            }
            return order
        },
        enumerable:true
    })
    Object.defineProperty(this,'pathOrderIdxMap',{//so we know the order of elements in the path array
        get(){
            let order = []
            let curThingVar = this.leftMostThing
            let hasRight
            while (![null].includes(hasRight)) {
                order.push(this.elements[curThingVar].userVar)
                hasRight = this.elements[curThingVar].rightThing || null
                curThingVar = hasRight && hasRight.userVar || false
            }
            return order
        },
        enumerable:true
    })

    Object.defineProperty(this,'newStates',{
        value: function(stateBuffer){
            //stateBuffer = {[nodeID]:state}
            this.checkNodes = stateBuffer
            this.query()
        }
    })
    
    this.cleanMatch = ''//String of user MATCH with it cleaned, and id's swapped out (must maintain original userVar assignment (no randIDs))
    this.cleanQuery = [] //[{CYPHER:[cleanMatch]},...EXPAND?Clean?...FILTER,SEARCH,ID,RANGE,RETURN(all as-is)]
    

    let self = this

    const get = gunGet(gun)


    this.query = function(){//determine whether to run startQuery or reQuery
        self.metrics = new Metrics()
        console.log('starting query:',self)
        self.state = 'running'
        self.lastStart = Date.now()
        self.runs++
        let qParams = self
        let {observedStates,expand,checkNodes} = qParams
        self.requery = (self.runs > 1) ? true : false
        self.bufferTrigger = false
        self.limitHit = false
        if(checkNodes){
            if(expand){//checkNodes can come from the stateBuffer or a label change on a nodeID
                //if a new relation comes in, then we need to get it's src & trgt to see if either of them are in the 'active' list
                //if nothing is touching the nodes that have passed, then stop. else, just start expand over from the top.
                let findSrcTrgt = []
                self.pathsToRemove = {}
                for (const nodeID in checkNodes) {
                    observedStates[nodeID] = checkNodes[nodeID]
                    let {r} = parseSoul(nodeID)
                    if(!r){
                        self.invalidatePath(nodeID)
                    }else{
                        findSrcTrgt.push(nodeID)
                    }
                }
                let find = findSrcTrgt.length * 2
                for (const relationID of findSrcTrgt) {
                    //for expand, there is only one userVar
                    const checkForID = (id) =>{
                        find--
                        self.invalidatePath(id)
                        if(!find)self.startQuery()
                    }
                    getCell(relationID,'SRC',checkForID,true)
                    getCell(relationID,'TRGT',checkForID,true)
                }
                if(!find)self.startQuery()
            }else{//checkNodes can only come from the stateBuffer
                for (const nodeID in checkNodes) {
                    let state = checkNodes[nodeID]
                    if(observedStates[nodeID] !== undefined)continue//we already looked at this previously
                    //can be any type, could be relation
                    let {t,r} = parseSoul(nodeID)
                    //all ID's are unique across a base, so only need to see if any nodes have them
                    for (const userVar of qParams.elementRank) {
                        const {validStates,types} = qParams.elements[userVar];
                        //qParams.elements[userVar].toCheck.clear()
                        if(observedStates[nodeID] === undefined && (types.includes(t) || types.includes(r))){//add it to the highest scoring match.
                            if(validStates.includes(state)){//check to see if it has the correct state
                                qParams.elements[userVar].toCheck.add(nodeID)
                                self.bufferTrigger = true

                                //if it does, then we need to see if this can be added to the query
                                //the hope is that most will get filtered about before traversal
                            }
                            break
                        }//else doesn't match anything and we can ignore it
                    }
                    delete qParams.checkNodes[nodeID]
                }
                self.startQuery()
            }
        }else{
            self.startQuery()
        }
        

    }
    this.startQuery = function(){
        delete self.checkNodes
        if(self.expand)self.expandNodes()//expand is a different branch in this..
        else if(self.bufferTrigger){console.log('Evaluating incoming nodes with state changes');self.evaluateNodes()}
        else if(self.requery){
            if(!self.filterState || (!self.sortBy && self.limit !== Infinity)){
                if(!self.filterState)console.log('Requery, checking changed nodes to see if they pass')
                else console.log('Requery, getting new skip and/or limit return')
                self.evaluateNodes()
            }else if(!self.sortState){
                console.log('Requery, sort has changed')
                self.sortPaths()
            }else if(!self.resultState){
                console.log('Requery, rebuilding output')
                self.buildResults()
            }else{
                console.log('Requery, just firing cb')
                self.queryDone(true)
            }
            console.log('Requery, rebuilding output')
        }
        else self.getIndex()//firstCall not expand
    }
    //util
    this.invalidatePath = function(nodeID){
        if(self.nodeIn[nodeID]){//we want to destroy these paths, then take the 'startNode' and add it back toCheck to see if it can get added back.
            //nodeIn[id] = Set{pathStr,pathStr}
            for (const pathStr of self.nodeIn[nodeID]) {
                let curPathIdx = self.pathStrings[pathStr]
                self.pathsToRemove[pathStr] = curPathIdx
                let pathStart = self.paths[curPathIdx].startNodeID
                qParams.elements.EXPAND.startNodesChecked.delete(pathStart)
            }
            self.bufferTrigger = true
        }
    }
    this.removePaths = function(){
        if(Object.keys(self.pathsToRemove).length){
            self.resultState = false
            for (const pathStr in self.pathsToRemove) {
                let pathIdx = self.pathsToRemove[pathStr]
                removeFromArr(self.paths,pathIdx)
                delete self.pathsToRemove[pathStr]
            }
            self.setPathIndices()
        }
    }
    this.setPathIndices = function(){
        self.pathStrings = {}
        let l = self.paths.length
        for (let i = 0; i < l; i++) {//get new indices
            self.pathStrings[self.paths[i][0]] = i    
        }
    }
 

    //expand stuff
    this.expandNodes = function(){
        let {startNodes, startNodesChecked, previousStarts} = self.elements.EXPAND
        let needsPathRemoved = new Set(previousStarts)
        for (const nodeID of startNodes) {
            if(!startNodesChecked.has(nodeID)) self.elements.EXPAND.toCheck.add(nodeID)
            needsPathRemoved.delete(nodeID)//things from prev query and are also part of current query
        }
        for (const id of needsPathRemoved) {//should be diff between sets
            self.invalidatePath(id)//remove things that are in previousStarts, and not in startNodes
        }
        console.log([...startNodesChecked],[...self.elements.EXPAND.toCheck],[...needsPathRemoved])
        self.removePaths()
        self.startExpand()
    }
    this.startExpand = function(){
        self.elements.EXPAND.previousStarts = self.elements.EXPAND.startNodes.slice()
        let thing = self.elements.EXPAND
        let {toCheck} = thing

        self.openPaths = 0
        let needed = self.skip+self.limit-self.paths.length //not getting extra, because this will *probably* spawn more paths than requested

        //console.log('things left',toCheck.size, 'currently getting:',needed)
        for (const nodeID of toCheck) {
            if(self.openPaths > needed)break
            self.openPaths++
            setTimeout(self.expandNode,1,new Path(thing,nodeID))
        }
        if(!self.openPaths){
            console.log('No nodes to evaluate')
            self.sortPathsByStartNodes()
        }
    }
    this.expandNode = function(pathParams){
        //This function will only ever be called with nodeIDs. We will do all relationship stuff infunction. So ()-[] then ()-[] || ()<<END NODE
        let {curPath,curID,depth,minLevel,maxLevel,filterBy,fullSeq,filter,firstRelations,hasEndNode,validStates} = pathParams
        let {toCheck,startNodesChecked,nodes,blacklistNodes,terminatorNodes,endNodes,whitelistNodes,filterStartNode,beginSequenceAtStart,uniqueness} = self.elements.EXPAND
        //console.log({curPath,curID,depth,minLevel,maxLevel,filterBy,fullSeq,filter,firstRelations,hasEndNode,validStates})

        let {b,t,i} = parseSoul(curID)
        let endPath = false
        curPath.push(curID)
        if(depth === 0){
            toCheck.delete(curID)
            startNodesChecked.add(curID)
            
        }
        if(blacklistNodes.length && blacklistNodes.includes(curID)){
            done(false)
        }else if(terminatorNodes.length && terminatorNodes.includes(curID)){
            done(true)
        }else if((depth === 0 && !filterStartNode) || filterBy === 'relationship'){
            getRelations()
        }else{
            checkNodeState()
        }
        function checkNodeState(){
            if(sID && getValue([curID,'state'],nodes) === true){//requery
                checkLabels()
                return
            }
            if(observedStates[curID]){
                let state = observedStates[curID]
                evalState(state)
            }else{//have not seen it, go get it.
                getCell(curID,'STATE',function(state){
                    self.counter1++
                    self.observedStates[curID] = state
                    evalState(state)
                },true,sID)
            }
            function evalState(state){
                if(!validStates.includes(state)){
                    setValue([curID,'state'],false,nodes)
                    done(false)
                }else{
                    setValue([curID,'state'],true,nodes)
                    if(isNode)checkLabels()
                    else checkRange()
                }
            }
        }
        function checkLabels(){
            if(filter[0] === '*'){
                if(filterBy === 'sequence')filter.shift()
                getRelations()
                return
            }
            let {labels,not,term,end} = (filterBy === 'sequence') ? filter.shift() : filter[0]
            getCell(curID,'LABELS',function(curLabelsArr){
                self.counter1++
                let addr = toAddress(curID,'LABELS')
                if(sID && !getValue(['addrSubs',addr,'element','EXPAND','labels'],self)){
                    let subID = subThing(addr,checkLocalSubExpand('labels',curID),false,{raw:true})
                    setValue(['addrSubs',addr,'element',el,'labels'],subID,self)
                }
                let allLabels = curLabelsArr.slice()
                if(evalLabels(allLabels,not,true)){//failed
                    done(false)
                    return
                }
                if(filterBy === 'label' && term.length && evalLabels(allLabels,term,false)){//non-sequence, want to skip this block if it isn't term
                    done(true)
                    return
                }
                if(filterBy === 'sequence' && term.length){//for sequence, if this has any term args, this block MUST call done and return                        
                    done(evalLabels(allLabels,term,false))
                    return
                }
                if(filterBy === 'label' && evalLabels(allLabels,end,false)){//non-sequence endNode
                    endPath = true
                }
                if(filterBy === 'sequence' && end.length ){//must be an end node
                    if(!evalLabels(allLabels,end,false)){//if it is valid, we want to let things continue to getRelations
                        done(false)
                        return
                    }
                }
                if(!evalLabels(allLabels,labels,false)){//does not pass the label requirements
                    done(false)
                    return
                }
                getRelations()
            },true)
            function evalLabels(curLabels,against,andAll){
                let hasOr = !!andAll
                for (const orBlocks of against) {//ALL labels it cannot have
                    let hasAnd = true
                    for (const ands of orBlocks) {
                        if(!curLabels.includes(ands)){
                            hasAnd = false
                            break
                        }
                    }
                    if(!andAll && hasAnd){
                        hasOr = !hasOr
                        break
                    }else if(andAll && !hasAnd){
                        hasOr = !hasOr
                        break
                    }
                    
                }
                return hasOr
            }
        }
        function getRelations(){
            if(depth === maxLevel){
                done(true)
                return
            }
            let rTypes = (!beginSequenceAtStart && depth === 0 && firstRelations) || (filterBy === 'sequence') ? filter.shift() : filter[0]
            if(filterBy === 'sequence' && !filter.length){//start the sequence over, relation should always be the last in the sequence
                pathParams.filter = JSON.parse(JSON.stringify(fullSeq))
            }
            
            let statesToCheck = []
            let nextToGet = []
            let toGet = Object.keys(rTypes).length

            if(!toGet){//weird state to be in, basically a parameter given has to be incorrect.
                done(false)
                return
            }
            for (const rid in rTypes) {
                let signs = rTypes[rid]
                let linkSoul = makeSoul({b,t,r:rid,i})
                gun.get(linkSoul).once(function(linkNode){
                    toGet--
                    if(linkNode !== undefined){
                        for (const linkAndDir in linkNode) {
                            const boolean = linkNode[linkAndDir];
                            if(linkAndDir === '_' || !boolean)continue
                            let [sign,relationID] = linkAndDir.split(',')
                            if(uniqueness !== 'RELATIONSHIP_GLOBAL' || (uniqueness === 'RELATIONSHIP_GLOBAL' && !self.elements.EXPAND.traversed.has(relationID))){
                                if(uniqueness === 'RELATIONSHIP_GLOBAL')self.elements.EXPAND.traversed.add(relationID)
                                if(signs.includes(sign)){
                                    statesToCheck.push([relationID,sign])
                                }
                            }
                        
                        }
                    }
                    if(!toGet)checkStates()
                })

            }

            function checkStates(){
                // /console.log('getting states',statesToCheck)
                //see if node is current, mostly doing this to make sure we keep the query correct if a sub
                let toGet = statesToCheck.length
                for (const [id,sign] of statesToCheck) {
                    if(self.observedStates[curID]){
                        let state = self.observedStates[curID]
                        evalState(id,state,sign)
                    }else{//have not seen it, go get it.
                        getCell(id,'STATE',function(state){
                            self.counter1++
                            self.observedStates[id] = state
                            evalState(id,state,sign)
                        },true)
                    }
                    
                }
                function evalState(id,state,sign){
                    toGet--
                    if(!validStates.includes(state)){
                        setValue([id,'state'],false,nodes)
                    }else{
                        let need = (sign === '>') ? 'TRGT' : 'SRC' //invert where we are to what we need
                        setValue([id,'state'],true,nodes)
                        nextToGet.push([id,need])   
                    }
                    if(!toGet)getNextNodeIDs()
                }
            }
            function getNextNodeIDs(){
                let toGet = nextToGet.length
                for (const [id,pType] of nextToGet) {
                    getCell(id,pType,function(nextNode){
                        toGet--
                        self.openPaths++
                        //self.expandNode(new Path(pathParams,nextNode,id,pType))
                        setTimeout(self.expandNode,1,new Path(pathParams,nextNode,id,pType))
                        if(!toGet)done(true)//pass this current path, done will see if it should add this to result or not
                    },true)
                }
            }
        }
        function done(passed){
            self.openPaths--
            
            if(passed && depth >= minLevel && depth <= maxLevel){//in range, should we add this path to result?
                //console.log('passed',curID)
                let addPath = false
                if(terminatorNodes.length){
                    addPath = terminatorNodes.includes(curID)
                }else if(endNodes.length){
                    addPath = endNodes.includes(curID)
                }else if(filterBy === 'label' && ((hasEndNode && endPath) || !hasEndPath)){
                    addPath = true
                }else if(filterBy !== 'label'){//evreything else can get through
                    addPath = true
                }
                if(uniqueness === 'NODE_GLOBAL' && self.elements.EXPAND.traversed.has(curID)){
                    //console.log('has traversed, failed')
                    addPath = false
                }
                if(addPath && whitelistNodes.length){
                    addPath = whitelistNodes.includes(curID)
                }
                let pStr = JSON.stringify(curPath)
                if(self.pathStrings[pStr] !== undefined)addPath = false //already added
                if(addPath){
                    self.pathStrings[pStr] = true //index doesn't matter, we will rebuild the index after all openPaths are done
                    if(uniqueness === 'NODE_GLOBAL'){
                        self.elements.EXPAND.traversed.add(curID)
                    }
                    for (const id of curPath) {
                        if(!self.nodeIn[id])self.nodeIn[id] = new Set()
                        self.nodeIn[id].add(pStr)
                    }
                    let pathThing = [pStr]
                    pathThing.pathArr = curPath.slice()
                    pathThing.sortValues = [self.elements.EXPAND.startNodes.indexOf(curPath[0]),curPath.length] //sorting by position in startNode array
                    pathThing.resultRow = 
                        (self.elements.EXPAND.returnAs === 'paths' && curPath.slice()) 
                        || (self.elements.EXPAND.returnAs === 'nodes' && curPath.slice(-1)) 
                        || (self.elements.EXPAND.returnAs === 'relationships' && curPath.filter(x=>Array.isArray(x)));
                        
                    self.paths.push(pathThing)
                }
                
            }
            //console.log(self.sortBy,self.paths.length,self.skip+self.limit,self.openPaths)
            if(self.paths.length < self.skip+self.limit && self.limit !== Infinity && !self.openPaths){
                //we are not sorting, there is a non-infinite limit, and we do not have as many paths as skip/limit specify and there are no pending paths
                self.startExpand()
                return
            }

            if((self.paths.length > self.skip+self.limit && !self.limitHit) || !self.openPaths && !self.limitHit){ //not sure if I can combine these two..
                self.limitHit = true //could have n number of paths that are in proccess that will exceed limit, we only want to fire the next step once.

                self.sortPathsByStartNodes()//Everything has been checked (or we hit limit), all possible paths have been evaluated (given the starting)
            }
        }
    }
    function checkLocalSubExpand(type,nodeID){
        //type, state, labels, range, filter, match (range is part of filter)
        let {nodes} = self.elements.EXPAND
        let curStates = nodes[nodeID]
        return function(newVal){
            console.log('Local Node Filtering value changed')
            curStates[type] = null
            let potentialPassing = true

            for (const type in curStates) {
                if(type === 'passing')continue
                const val = curStates[type];
                if(val === false)potentialPassing = false
            }
            if(potentialPassing){
                //was failing but now could be passing, or was passing and may be failing (the single null value just set)
                self.filterState = false
                if(!self.checkNodes)self.checkNodes = {}
                self.checkNodes[nodeID] = self.observedStates[nodeID] //need to pretend it is from state buffer, since checkNodes will change observeredStates
                if(self.state !== 'pending'){
                    //even if this is 'running' it will schedule another run through.
                    self.state = 'pending'
                    setTimeout(self.query,25)
                }
            }
        }
    }

    this.sortPathsByStartNodes = function(){
        self.paths.sort(compareSort)
        self.setPathIndices()
        self.buildExpandResults()
        function compareSort(a,b){
            return multiCompare(0,a,b)
            function multiCompare(idx,a,b){
                let aval = a.sortValues[idx]
                let bval = b.sortValues[idx]
                let comparison = aval - bval
                if (comparison === 0 && idx < 1) {
                    return multiCompare(1,a,b)
                }
                return comparison
            }
        }
        
    }
    this.buildExpandResults = function(){
        self.metrics.addThingCount('Build Paths',self.counter1)
        self.metrics.addTimeSplit('Paths Built')
        self.counter1 = 0
        let {skip,limit,prevSkip,prevLimit} = self
        if(skip+limit > self.paths.length)limit=self.paths.length - skip
        if(skip !== prevSkip || limit !== prevLimit)self.resultState = false
        self.prevSkip = skip
        self.prevLimit = limit
        if(self.resultState){//skip and limit is the same and nothing structural changed, should be really rare for expand
            //console.log('resultState is true, skipping build')
            self.queryDone(true)
            return
        }else{
            console.log('Building result for output...')
        }
        const result = self.result = self.paths.slice(skip,skip+limit)
        Object.defineProperty(self.result,'out',{value:{}}) //remake our outer result arr
        for (let i = 0,l = result.length; i < l; i++) {//i is matching paths
            result[i] = result[i].resultRow
        }
        self.queryDone(true)

    }




    //match stuff
    this.getIndex = function(){
        let qParams = self
        let {b} = self
        let startVar = qParams.elementRank[0]
        let {types,labels,ranges,ID,isNode, bestIndex,srcTypes,trgtTypes,validStates} = qParams.elements[startVar]
        console.log('Beginning query by',bestIndex)

        //bestIndex could be one of ['id','range','types','labels']
        switch (bestIndex) {
            case 'id':
                for (const id of ID) {
                    qParams.elements[startVar].toCheck.add(id)
                }
                self.evaluateNodes()
                break;
            case 'types':
                getTypes()
                break;
            case 'labels':
                getLabels()
                break;
            case 'range':
                getRange()
                break;
            default:
                break;
        }
        function getTypes(){
            let toGet = types.length
            for (const id of types) {
                // need existence soul for each type
                if(isNode){
                    let s = makeSoul({b,t:id,i:true})//created/existence soul
                    get(s,false,function(node){
                        for (const nodeID in node) {
                            let state = node[nodeID];//true = 'active', false = 'archived', null = 'deleted
                            state = state == true && 'active' || state === false && 'archived' || state === null && 'deleted'
                            self.observedStates[nodeID] = state
                            if (validStates.includes(state)) {
                                qParams.elements[startVar].toCheck.add(nodeID)
                            }
                        }
                        toGet--
                        if(!toGet)self.evaluateNodes()
                    })
                }else{
                    let s = makeSoul({b,r:id})//type identifier
                    //if we have a "_CREATED" time range for these nodes, we can narrow further
                    let {from,to} = ranges.filter(x=>x.alias === '_CREATED')[0] || {}
                    getRelationNodes(gun,s,srcTypes,trgtTypes,function(relationIDarr){
                        for (const id of relationIDarr) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        toGet--
                        if(!toGet)self.evaluateNodes()
                    },{from,to})
                }
                
            }

        }
        function getLabels(){
            let toGet = types.length
            for (const id of types) {
                let s = makeSoul({b,t:id})
                getLabeledNodes(gun,getCell,s,labels,function(nodes){
                    toGet--
                    for (const id of nodes) {
                        qParams.elements[startVar].toCheck.add(id)
                    }
                    if(!toGet)self.evaluateNodes()
                })
                //each node type is independent from each other
                //but each nodeType added must have ALL labels
            }
        }
        function getRange(){
            let {from,to,alias} = ranges[0] //already reverse sorted
            let toGet = types.length
            for (const id of types) {
                let sym = (isNode) ? 't' : 'r'
                if(alias !== '_CREATED'){
                    let idx
                    let type = makeSoul({b,[sym]:id})
                    let p = qParams.aliasToID.id(type,alias)
                    idx = makeSoul({b,[sym]:id,p})
                    qIndex(idx,function(nodes){
                        toGet--
                        for (const id of nodes) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        if(!toGet)self.evaluateNodes()
                    },Infinity,from,to)
                }else if(!isNode){//only created for relations is on a different index
                    let s = makeSoul({b,r:id})//created/existence soul
                    //if we have a "_CREATED" time range for these nodes, we can narrow further
                    let {from,to} = ranges.filter(x=>x.alias === '_CREATED')[0] || {}
                    getRelationNodes(gun,s,srcTypes,trgtTypes,function(relationIDarr){
                        for (const id of relationIDarr) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        toGet--
                        if(!toGet)self.evaluateNodes()
                    },{from,to})
                }else{//isNode, _CREATED
                    let idx = makeSoul({b,[sym]:id})
                    qIndex(idx,function(nodes){
                        toGet--
                        for (const id of nodes) {
                            qParams.elements[startVar].toCheck.add(id)
                        }
                        if(!toGet)self.evaluateNodes()
                    },Infinity,from,to)
                }
            }
        }
    }
    this.evaluateNodes = function(){
        self.metrics.addTimeSplit('getIndex')
        if(self.sortBy === false && self.limit !== Infinity){
            self.checkNextStartNode()
        }else{
            self.findAllPaths()
        }

    }
    this.checkNextStartNode = function(){
        let qParams = self
        

        //this is only for match pattern w/ normal return

        //could have some nodes to test in any of the userVar's if this is a requery
        //otherwise there will only be one userVar that has toCheck
        //either way, our runner needs to be able to start anywhere in the match statement
        //will need to make a little query object to pass around 
        let varsToCheck = qParams.elementRank
        //console.log(varsToCheck)

        if(!varsToCheck.length){
            self.queryDone(!bufferTrigger)
            return
        }//nothing matched the query, return the result
        self.openPaths = 0
        let needed = (self.skip+self.limit-self.paths.length)*1.25 //need extra so some that fail can still give use enough so we are batching larger
        let pathsInitiated = 0

        for (const startVar of varsToCheck) {
            let thing = qParams.elements[startVar];
            const {toCheck} = thing
            if(!toCheck.size){
                continue
            }
            console.log('things left',toCheck.size, 'currently getting:',needed)
            for (const nodeID of toCheck) {
                pathsInitiated++
                if(pathsInitiated > needed)break
                self.openPaths++
                setTimeout(self.checkPath,1,false,false,startVar,nodeID)
            }
        }

        if(!self.openPaths){//ran out of nodes to start new paths from proceed with rest of query
            self.checkPathState()
        }
    }
    this.findAllPaths = function (){
        let qParams = self
        

        //this is only for match pattern w/ normal return

        //could have some nodes to test in any of the userVar's if this is a requery
        //otherwise there will only be one userVar that has toCheck
        //either way, our runner needs to be able to start anywhere in the match statement
        //will need to make a little query object to pass around 
        let varsToCheck = qParams.elementRank
        //console.log(varsToCheck)

        if(!varsToCheck.length){
            self.queryDone(!bufferTrigger)
            return
        }//nothing matched the query, return the result
        self.openPaths = 0
        let started = false
        for (const startVar of varsToCheck) {
            let thing = qParams.elements[startVar];
            const {toCheck} = thing
            if(!toCheck.size){
                continue
            }
            started = true
            console.log(`Start Nodes to check on "${startVar}":`,toCheck.size)
            for (const nodeID of toCheck) {
                self.openPaths++
                setTimeout(self.checkPath,1,false,false,startVar,nodeID)
                //checkAndTraverse(false,false,startVar,nodeID)
            }
        }

        if(!started){
            self.queryDone(true)
            console.log('No nodes to evaluate')
        }
    }
    this.checkPath = function(curPath,pathParams,startVar,startID,secondPass){
        let qParams = self
        let {paths,pathStrings,elements} = qParams
        curPath = curPath || []
        let dir,otherDir
        if(pathParams){//this is a branched path
            dir = pathParams.curDir
            startVar = pathParams[dir].curVar
            startID = pathParams[dir].curID
        }else{
            const dirParams = (leftOrRight) =>{ return {done:!elements[startVar][leftOrRight+'Thing'],curVar:startVar,curID:startID}} //both are the same at the start

            dir = (elements[startVar].leftScore < elements[startVar].rightScore) ? 'right' : 'left'
            pathParams = {
                startVar,
                startID,
                left:dirParams('left'),
                right:dirParams('right'),
                curDir: dir,
                rTraversed: {}

            }
        }
        let thing = qParams.elements[startVar]
        let {b} = parseSoul(startID)
        let {isNode,nodes} = thing//notDistinct is not yet implemented
        otherDir = (dir === 'right') ? 'left' : 'right'//might already be done, but this way we can check easily
        if(getValue([startID,'passing'],nodes) === true){ //already evaluated this node, so just traverse
            traverse(true)
        }else{
            self.checkLocal(startVar,startID,traverse)
        }
        
        function traverse(passing){
            let qParams = self
            let thing = qParams.elements[startVar]
            if(!passing){
                setValue([startID,'match'],null,nodes)
                pathComplete()
                return
            }
            let {t,i} = parseSoul(startID)
            let nextThing = thing[dir+'Thing']
            let toTraverse = []
            let op = (dir === 'left') ? 'unshift' : 'push'
            if(!secondPass)curPath[op](startID)
            //console.log('POST LOCAL, PRE-TRAVRESE',{curPath:JSON.parse(JSON.stringify(curPath)),dir,curID:startID})
            if(isNode){
                let [rTypes,signs] = thing.validRelations(dir) || []
                if([null,undefined].includes(nextThing)){//must have nextThing === null to consider dirDone
                    dirDone()
                    return
                }else if(!rTypes){//should have a next, but nothing valid to get (bad query?)
                    setValue([startID,'match'],false,nodes)
                    pathComplete()
                    return
                }

                let toGet = rTypes.length
                for (const rid of rTypes) {
                    let linkSoul = makeSoul({b,t,r:rid,i})
                    gun.get(linkSoul).once(function(linkNode){
                        //console.log(linkSoul,linkNode)
                        self.counter1++
                        toGet--
                        if(linkNode !== undefined){
                            for (const linkAndDir in linkNode) {
                                const boolean = linkNode[linkAndDir];
                                if(linkAndDir === '_' || !boolean)continue
                                let [sign,relationID] = linkAndDir.split(',')
                                if(signs.includes(sign)){
                                    toTraverse.push(relationID)
                                }
                            }
                        }
                        if(!toGet)attemptTraversal()
                    })
                }
            }else{
                let p = (thing[dir+'Is'] === 'source') ? 'SRC' : 'TRGT' //looking for source/target pval
                //technically if this is undirected, I think we should branch our path again, and navigate this dir with both src and trgt ids...
                //not doing that now, just going to have bidirectional paths show as a single path in results
                getCell(startID,p,function(nodeid){
                    self.counter1++
                    toTraverse.push(nodeid)
                    attemptTraversal()
                },true)
            }
            function attemptTraversal(){
                if(!toTraverse.length){
                    //should have had more links to get, which means this doesn't match the pattern
                    setValue([startID,'match'],false,nodes)
                    pathComplete()
                    return
                }
                setValue([startID,'match'],true,nodes)
                setValue([startID,'passing'],true,nodes)
                //console.log('NEXT', nextThing.userVar)
                pathParams[dir].curVar = nextThing.userVar
                let copyParams
                if(isNode){
                    copyParams = JSON.parse(JSON.stringify(pathParams))
                }
                for (const id of toTraverse) {
                    if(isNode){//currently a node, will be traversing relationships
                        let newParams = Object.assign({},copyParams,{[dir]:{curID:id,curVar:nextThing.userVar}})
                        //console.log(newParams,newParams[dir])
                        self.checkPath(curPath.slice(),newParams)//we branch and create a new path
                        self.openPaths++
                    }else{//should only be a single id in this array, we are on a relationship getting a nodeID
                        pathParams[dir].curID = id //we don't copy anything, because a path can only end on a node.
                        if(!secondPass && !isNode && self.relationsTraversed.has(startID)){
                            pathComplete()
                            return
                        }
                        self.relationsTraversed.add(startID)//can only traverse a relationID once per query (should prevent circular?)
                        self.checkPath(curPath,pathParams)

                        //we also not opening a new path, since we are in the 'middle' of evaluating this one.
                    }
                }
                if(isNode)self.openPaths--//since we branched n times, techically this particular path has ended (but it spawned a bunch more potentials)
                
            }
            function dirDone(){
                //console.log('DIRDONE',{PARAMS:JSON.parse(JSON.stringify(pathParams)),curPath:curPath.slice()})
                pathParams[dir].done = true
                if(pathParams[otherDir].done){
                    //self.openPaths--
                    //add to paths array that we will be using to assembleOutput
                    //need to make sure the path is unique..., or atleast does not duplicate a path in the output
                    let pStr = JSON.stringify(curPath)
                    let pathIdx = pathStrings[pStr]
                    if(pathIdx == undefined){//first call, or a new path added
                        self.sortState = false //could have been false, but is now passing
                        let pathInfo = [pStr]
                        pathInfo.pathArr = curPath.slice()
                        pathInfo.resultRow = []
                        pathInfo.sortValues = []
                        paths.push(pathInfo)
                        pathStrings[pStr] = paths.lengths-1 //since we pushed it, it should be in the last position
                    }//else already part of the result, and is still part of it

                    pathComplete()
                }else{//started in the middle, need to verify other half
                    //we are not starting a new path, as we are continuing the current path
                    pathParams.curDir = otherDir
                    self.checkPath(curPath,pathParams,false,false,true)

                }
            }
        }
        function pathComplete(){
            self.openPaths--
            let {startVar,startID} = pathParams
            self.elements[startVar].toCheck.delete(startID)
            //console.log(self.sortBy,self.paths.length,self.skip+self.limit,self.openPaths)
            if(!self.sortBy && self.paths.length < self.skip+self.limit && self.limit !== Infinity && !self.openPaths){
                //we are not sorting, there is a non-infinite limit, and we do not have as many paths as skip/limit specify and there are no pending paths
                self.checkNextStartNode()
                return
            }

            if((!self.sortBy && self.paths.length > self.skip+self.limit && !self.limitHit) || !self.openPaths && !self.limitHit){ //not sure if I can combine these two..
                self.limitHit = true //could have n number of paths that are in proccess that will exceed limit, we only want to fire the next step once.

                self.checkPathState()//Everything has been checked, all possible paths have been evaluated (given the starting)
            }

        }
    }
    this.checkLocal = function(el,nodeID,cb){
        let qParams = self
        let {observedStates, sID} = qParams
        let thing = qParams.elements[el]
        let {t,r,i} = parseSoul(nodeID)
        let {isNode,validStates,nodes} = thing

        checkIDandType()
        function checkIDandType(){
            if(isNode){//checking created date in ID
                let hasCreated = thing.ranges.filter(x=>x.alias === '_CREATED')[0]
                if(hasCreated){
                    let [id,createdUnix] = i.split('_')
                    let {from,to} = hasCreated
                    if(createdUnix<from || createdUnix>to){localDone(false); return}
                } 
            }
            if(thing.ID.length){//in case we are requerying, a list of ID's is basically a filter on IDs, this is the filter
                if(!thing.ID.includes(nodeID)){
                    localDone(false)
                    return
                }
            }
            let typeID = t || r
            if(!thing.types.includes(typeID)){
                localDone(false)
                return
            }
            checkState()
        }
        function checkState(){
            //see if node is current
            if(sID && getValue([nodeID,'state'],nodes) === true){//requery
                if(isNode)checkLabels()
                else checkRange()
                return
            }
            if(observedStates[nodeID]){
                let state = observedStates[nodeID]
                evalState(state)
            }else{//have not seen it, go get it.
                getCell(nodeID,'STATE',function(state){
                    self.counter1++
                    self.observedStates[nodeID] = state
                    evalState(state)
                },true,sID)
            }
            function evalState(state){
                if(!validStates.includes(state)){
                    setValue([nodeID,'state'],false,nodes)
                    localDone(false)
                }else{
                    setValue([nodeID,'state'],true,nodes)
                    if(isNode)checkLabels()
                    else checkRange()
                }
            }
        }
        function checkLabels(){
            if(sID && getValue([nodeID,'labels'],nodes) === true){//requery
                checkRange()
                return
            }

            if(!thing.labels.length && !thing.not.length){//skip retrieval if nothing to check
                setValue([nodeID,'labels'],true,nodes)
                checkRange()
                return
            }
            getCell(nodeID,'LABELS',function(curLabelsArr){
                self.counter1++
                let addr = toAddress(nodeID,'LABELS')
                if(sID && !getValue(['addrSubs',addr,'element',el,'labels'],self)){
                    let subID = subThing(addr,checkLocalSub(el,'labels',nodeID),false,{raw:true})
                    setValue(['addrSubs',addr,'element',el,'labels'],subID,self)
                }
                if(!Array.isArray(curLabelsArr) && thing.labels.length){//needs to have a label, but doesn't
                    setValue([nodeID,'labels'],false,nodes)
                    localDone(false)
                    return
                }else if(Array.isArray(curLabelsArr)){//has labels, but either has andLabel and/or notLabels
                    for (const andLabel of thing.labels) {//ALL labels it must have
                        if(!curLabelsArr.includes(andLabel)){
                            setValue([nodeID,'labels'],false,nodes)
                            localDone(false)
                            return
                        }
                    }
                    for (const notLabel of thing.not) {//ALL labels it cannot have
                        if(curLabelsArr.includes(notLabel)){
                            setValue([nodeID,'labels'],false,nodes)
                            localDone(false)
                            return
                        }
                    }
                }
                //if ((has no labels, and only notLabels were specified) || has labels, and meets query) => pass this node
                setValue([nodeID,'labels'],true,nodes)
                checkRange()
            },true,sID)
        }
        function checkRange(){
            if(sID && getValue([nodeID,'range'],nodes) === true){//requery
                checkFilter()
                return
            }

            let propRanges = thing.ranges.filter(x=>x.alias !== '_CREATED')
            let toGet = propRanges.length
            if(!toGet){setValue([nodeID,'range'],true,nodes);checkFilter();return}
            let values = []
            console.log(propRanges)
            for (const range of propRanges) {
                let {from,to,alias} = range
                let p = qParams.aliasToID.id(nodeID,alias)
                if(p===undefined){
                    console.warn('Cannot find '+alias+' for '+nodeID+' ---considered not passing---')
                    setValue([nodeID,'range'],false,nodes)
                    localDone(false)
                    return
                }//?? undefined is basically out of range? node does not have this property? User passed invalid alias?
                getCell(nodeID,p,function(value){
                    self.counter1++
                    let addr = toAddress(nodeID,p)
                    if(sID && !getValue(['addrSubs',addr,'element',el,'range'],self)){
                        let subID = subThing(addr,checkLocalSub(el,'range',nodeID),false,{raw:true})
                        setValue(['addrSubs',addr,'element',el,'range'],subID,self)
                    }
                    values.push([from,value,to])
                    toGet--
                    if(!toGet){verifyRanges();return}
                },true,sID)
            }
            function verifyRanges(){
                let fail = values.filter(a=>{
                    let [from,value,to] = a
                    return (from>value || value>to)
                })
                if(fail.length){setValue([nodeID,'range'],false,nodes);localDone(false);return}
                checkFilter()
            }
        }
        function checkFilter(){
            if(sID && getValue([nodeID,'filter'],nodes) === true){//requery
                localDone(true)
                return
            }

            let toGet = thing.filterProps.length
            if(!toGet){setValue([nodeID,'filter'],true,nodes);localDone(true);return}
            let values = {}
            for (const alias of thing.filterProps) {
                let p = qParams.aliasToID.id(nodeID,alias)
                if(p===undefined){
                    console.warn('Cannot find '+alias+' for '+nodeID+' ---considered not passing---')
                    setValue([nodeID,'filter'],false,nodes)
                    localDone(false)
                    return
                }//?? undefined is basically a fail? node does not have this property?
                
                getCell(nodeID,p,function(value){//this should only run on first call, so we will make sub here
                    self.counter1++
                    let addr = toAddress(nodeID,p)
                    if(sID && !getValue(['addrSubs',addr,'element',el,'filter'],self)){
                        let subID = subThing(addr,checkLocalSub(el,'filter',nodeID),false,{raw:true})
                        setValue(['addrSubs',addr,'element',el,'filter'],subID,self)
                    }
                    values[alias] = value
                    toGet--
                    if(!toGet){verifyFilter();return}
                },true,sID)
            }
            function verifyFilter(){
                let eq = thing.filter.replace(/\{(?:`([^`]+)`|([a-z0-9]+))\}/gi,function(match,$1,$2){
                    let alias = ($1!==undefined) ? $1 : $2
                    return values[alias]
                })
                //console.log('{} replaced',eq)
                let result = evaluateAllFN(eq)//could techincally construct a function that does not eval to true or false, so truthy falsy test?
                //console.log(result)
                if(!result){setValue([nodeID,'filter'],false,nodes);localDone(false)}
                else localDone(true)
            }
        } 
        function localDone(passed){
            //console.log(nodeID, (passed)?'passed':'did not pass')
            if(!passed){
                //console.log(startID, 'did not pass')
                let wasPassing = getValue([nodeID,'passing'],nodes)
                if(wasPassing){//can only run if this is a query subscription
                    setValue([nodeID,'passing'],false,nodes)

                    for (let i = 0, l = paths.length; i < l; i++) {
                        const pathInfo = paths[i];
                        let pStr = pathInfo[0]
                        if(pathInfo.nodes.has(nodeID)){
                            self.sortState = false
                            self.pathsToRemove[pStr] = i
                        }
                        
                    }
                }
                cb(false)
            }else{
                setValue([nodeID,'passing'],true,nodes)
                cb(true)
            }
        }
    }
    function checkLocalSub(el,type,nodeID){
        //type, state, labels, range, filter, match (range is part of filter)
        let {nodes} = self.elements[el]
        let curStates = nodes[nodeID]
        return function(newVal){
            console.log('Local Node Filtering value changed')
            curStates[type] = null
            let potentialPassing = true

            for (const type in curStates) {
                if(type === 'passing')continue
                const val = curStates[type];
                if(val === false)potentialPassing = false
            }
            if(potentialPassing){
                //was failing but now could be passing, or was passing and may be failing (the single null value just set)
                self.filterState = false
                self.elements[el].toCheck.add(nodeID)
                if(self.state !== 'pending'){
                    //even if this is 'running' it will schedule another run through.
                    self.state = 'pending'
                    setTimeout(self.query,25)
                }
            }
        }
    }


    this.checkPathState = function(){
        self.metrics.addThingCount('Build Paths',self.counter1)
        self.metrics.addTimeSplit('Paths Built')
        self.counter1 = 0
        self.removePaths()
        self.filterState = true
        if(!self.sortState){
            self.sortPaths()
        }else if(!self.resultState){
            self.buildResults()
        }else{
            console.log('requery has not changed sort or result structure, returning results')
            self.queryDone(true)
        }
    }
  


    this.sortPaths = function(){
        let qParams = self
        let {sortBy,paths,sID} = qParams
        if((!sortBy || self.sortState) && !self.resultState){//no sort needed, but result is incorrect
            console.log('Either no sort value, or the sort is accurate, but needing to build the result')
            self.buildResults()
            return
        }else if((!sortBy || self.sortState) && self.resultState){//resultState is fine, some value updated that didn't effect the output structure.
            console.log('query does not need sorting or building, skipping to return')
            self.queryDone(true)
            return
        }
        console.log('Getting sort values')
        let [sortUserVar,...sortArgs] = sortBy
        let sortProps = sortArgs.map(x=>x.alias)
        let pathIdx = qParams.pathOrderIdxMap.indexOf(sortUserVar)
        let toGet = paths.length
        let hasPending = false
        for (let i = 0, l = paths.length; i < l; i++) {
            const {sortValues,pathArr} = paths[i]
            let nodeID = pathArr[pathIdx]
            if(sortValues.length === sortProps.length){//assumes that they are filled with values already and subscribed
                toGet--
                continue
            } 
            let propsToGet = sortProps.length
            for (let j = 0, lj = sortProps.length; j < lj; j++) {
                let alias = sortProps[j]
                if(sortValues[j] !== undefined){//not sure?
                    toGet--
                    continue
                }
                hasPending = true
                let p = qParams.aliasToID.id(nodeID,alias)
                if(p!==undefined){
                    self.counter1++
                    getCell(nodeID,p,addVal(sortValues,j),true,sID)
                    if(sID){
                        let addr = toAddress(nodeID,p)
                        if(!getValue(['addrSubs',addr,'sort'],self)){
                            let subID = subThing(addr,sortSub(sortValues,j),false,{raw:true})
                            setValue(['addrSubs',addr,'sort'],subID,self)
                        }
                    }
                }else{
                    //what to do? put in a 0 so it is alway top or bottom?
                    console.warn('Cannot find '+alias+' for '+nodeID+' ---  sorting as value: -1  ---')
                    addVal(sortValues,j)(-1)
                }
            }
            function addVal(obj,j){
                return function(val){
                    obj[j] = val
                    propsToGet--
                    if(!propsToGet){
                        toGet--
                        if(!toGet)sortAllPaths()
                    }
                }
                
            }
        }
        if(!hasPending)sortAllPaths()//we didn't need to get any values
        function sortAllPaths(){
            paths.sort(compareSubArr(sortArgs.map(x=>x.dir)))
            self.sortState = true
            self.resultState = false // we always sort, and always assume the sort has changed the order of the paths in the result
            self.setPathIndices()
            self.metrics.addTimeSplit('Sorted all paths')
            self.metrics.addThingCount('getData for sorting',self.counter1)
            self.counter1 = 0
            self.buildResults()
            function compareSubArr(sortQueries){
                return function(a,b){
                    return multiCompare(0,sortQueries,a,b)
                    function multiCompare(idx,dirArr,a,b){
                        let aval = a.sortValues[idx]
                        let bval = b.sortValues[idx]
                        let comparison = naturalCompare(aval,bval)
                        if (comparison === 0 && dirArr.lenth-1 > idx) {
                            comparison = multiCompare(idx++,dirArr.slice(1),a,b)
                        }
                        return (
                            (dirArr[0] == 'DESC') ? (comparison * -1) : comparison
                            );
                    }
                }
                //a and b should be [idx, [p0Val,p1Val, etc..]]
                //sortQueries = [dir,dir,dir]
                
            }
        }
    }

    this.buildResults = function(){
        let qParams = self
        let {limit,skip,prevLimit,prevSkip,returning,sID,cleanQuery,idOnly:allIDonly,pathOrderIdxMap,elements} = qParams       
        //need to build all paths that are within the skip and limit
        //with whatever list we have at this point, we need to getCell on all props,apply/skip formatting,put in array/object/optionally attach ids/addresses

        if(skip+limit > self.paths.length)limit=self.paths.length - skip
        if(skip !== prevSkip || limit !== prevLimit)self.resultState = false
        self.prevSkip = skip
        self.prevLimit = limit
        

        
        if(self.resultState){//skip and limit is the same and nothing structural changed
            console.log('resultState is true, skipping build')
            self.queryDone(true)
            return
        }else{
            console.log('building result for output')
        }

        const result = self.result = self.paths.slice(skip,skip+limit)
        Object.defineProperty(self.result,'out',{value:{}}) //remake our outer result arr
        self.result.out.query = cleanQuery.slice() //what user can pass back in/save as a 'saved' query
        let countO = {count:0}
        let thingsToBuild = []
        for (let i = 0,l = result.length; i < l; i++) {//i is matching paths
            let pathArr = result[i].pathArr
            let pathO = result[i] //this is the pathInfoO [pathStr].resultRow
            result[i] = result[i].resultRow
            if(result[i].length == returning.length)continue//assume that we ran all code below once on a previous query
            for (let j = 0,l = returning.length; j < l; j++) {// j is the thing we are returning from the matched path
                let indexInPathArr = pathOrderIdxMap.indexOf(returning[j])
                let nodeID = pathArr[indexInPathArr]
                result[i][j] = newThing(returning[j],nodeID) //will return [] || {} w/metadata according to params
                let {props:getProps,returnAsArray,propsByID,noAddress,noInherit,raw:allRaw,rawLabels,idOnly,humanID} = elements[returning[j]]
                let allPropsToGet = []
                if(humanID && (idOnly || allIDonly)){
                    countO.count += 1
                    let {humanID:hidP} = getValue(configPathFromChainPath(nodeID),gb) || {}
                    thingsToBuild.push([[nodeID,hidP,addValue(0,hidP,countO,true),true,sID]])//getCell arguments
                    let addr = toAddress(nodeID,hidP)
                    if(sID && !getValue(['addrSubs',addr,'paths',pathO[0],indexInPathArr],self)){
                        let subID = subThing(addr,resultSub(addr,result[i][j],0,rawLabels,hidP),false,{raw:true})
                        setValue(['addrSubs',addr,'paths',pathO[0],indexInPathArr],subID,self)
                    }
                }
                if(!getProps.length)continue
                for (let k = 0, l = getProps.length; k < l; k++) {// k is the property for [i][j]
                    const {alias,as:propAs,raw:rawProp} = getProps[k];
                    let raw = !!allRaw || !!rawProp
                    let p = qParams.aliasToID.id(nodeID,alias)
                    if(p!==undefined){
                        let addr = toAddress(nodeID,p)
                        if(idOnly || allIDonly){
                            result[i][j].address[k] = addr
                            continue //don't run rest of code in the loop
                        }
                        let propKey = returnKeyAs(k,p,alias,propAs)
                        allPropsToGet.push([nodeID,p,addValue(propKey,p,countO),raw,sID])//getCell arguments
                        countO.count += 1
                        //getCell(nodeID,p,addValue(propKey,p,counter),raw,sID)
                        if(sID && !getValue(['addrSubs',addr,'paths',pathO[0],indexInPathArr],self)){
                            let subID = subThing(addr,resultSub(addr,result[i][j],propKey,rawLabels,p),false,{raw})
                            setValue(['addrSubs',addr,'paths',pathO[0],indexInPathArr],subID,self)
                        }
                    }else{
                        //what to do? neo returns `null`
                        console.warn('Cannot find '+alias+' for '+nodeID+' ---setting value as: `undefined`---')
                        addValue(propKey,p)(undefined)
                    }
                }
                if(allPropsToGet.length)thingsToBuild.push(allPropsToGet) 
                    
                function returnKeyAs(i,p,alias,propAs){
                    let property = propAs || (propsByID) ? p : alias
                    if(returnAsArray){
                        property = i
                    }
                    return property
                }
                function addValue(property,p,counter,forHumanID){
                    return function(val,from){
                        result[i][j][property] = val
                        let fullPath = toAddress(nodeID,p)
                        if(!noAddress && !forHumanID){
                            result[i][j].address[property] = fullPath
                        }
                        if(!noInherit){
                            result[i][j].inherit[property] = (fullPath === from) ? false : from
                        }
                        if(!rawLabels && p === 'LABELS' && Array.isArray(val)){
                            replaceLabelIDs(result[i][j],property,val)
                        }
                        counter.count -=1
                        if(!counter.count){
                            self.queryDone(true)
                        }
                    }
                    
                }
            }
            //get args
        }
        //console.log(thingsToBuild)
        for (let i = 0,l = thingsToBuild.length; i < l; i++) {//have to collect everything, otherwise we don't know the total pending cb's
            let nodeArr = thingsToBuild[i]
            for (let j = 0, lj=nodeArr.length; j < lj; j++) {
                const args = nodeArr[j];
                self.counter1++
                getCell(...args)//for all ids, find all prop data
            }
        }
        if(!thingsToBuild.length)self.queryDone(true)//did not need to get any data, so we must call done manually
        self.resultState = true
        function newThing(el,id){
            let {props,returnAsArray,noID,noAddress,noInherit,idOnly,humanID} = elements[el]
            let nodeObj
            if((idOnly || allIDonly) && !humanID){
                nodeObj = [id]
            }else if(returnAsArray || humanID){
                nodeObj = []
                if(!idOnly && !allIDonly)nodeObj.length = props.length
            }else{
                nodeObj = {}
            }
            if(!noID)Object.defineProperty(nodeObj,'id',{value: id})
            if(!noAddress)Object.defineProperty(nodeObj,'address',{value: (returnAsArray) ? [] : {}})
            if(!noInherit)Object.defineProperty(nodeObj,'inherit',{value: (returnAsArray) ? [] : {}})
            return nodeObj
        }
    }

    function sortSub(obj,j){
        //obj = [pathStr].sortValues = []
        return function(newVal){
            console.log('Value used for sorting has changed')
            //was failing but now could be passing, or was passing and may be failing (the single null value just set)
            self.sortState = false
            obj[j] = newVal
            if(self.state !== 'pending'){
                //even if this is 'running' it will schedule another run through.
                self.state = 'pending'
                setTimeout(self.query,25)
            }
        }
    }
    function resultSub(addr,obj,k,rawLabels,p){
        //obj = [] || {}  j = pval || arrIdx
        return function(newVal,from){
            //was failing but now could be passing, or was passing and may be failing (the single null value just set)
            if(!rawLabels && p === 'LABELS' && Array.isArray(val)){
                replaceLabelIDs(obj,k,newVal)
            }else{
                obj[k] = newVal
            }
            if(addr !== from && obj.inherit && !obj.inherit[k])obj.inherit[k] = from
            else if(addr === from && obj.inherit && obj.inherit[k])obj.inherit[k] = false
            if(self.state !== 'pending'){
                //even if this is 'running' it will schedule another run through.
                self.state = 'pending'
                setTimeout(self.query,5)
            }
        }
    }
    function replaceLabelIDs(nodeObj,property,raw){
        //raw could be either a string (soul) or array of souls (or if Label labelID)
        //pType indicates whether this is label or not
        //dType will tell us what data type to expect in raw
        let allLabels = Object.entries(gb[b].labels)
        let out = []
        for (const labelID of raw) {
            out.push(allLabels.filter(x=>x[1] === labelID)[0])
        }
        nodeObj[property] = out
    }

    this.queryDone = function(returnResult){
        //setup up subscription, fire user cb
        let qParams = self
        let {sID,userCB} = qParams
        if(['string','number','symbol'].includes(typeof self.sID) && self.sID && self.runs === 1){//is valid type, truthy
            console.log('Setting up query: '+ sID)
            let kType = typeof self.sID === 'string' && `'${self.sID}'` || `${self.sID}`
            console.log(`To remove this query: snap.base('${self.b}').kill(${kType})`)
            setValue([self.b,self.sID],qParams,querySubs)
        }
        qParams.state = ''
        self.metrics.addTimeSplit('buildResults/getData')
        self.metrics.addThingCount('buildResults/getData',self.counter1)
        self.counter1=0
        setValue(['result','out','time'],self.metrics.last-self.metrics.start,self)
       
        if(!self.noMetrics)self.metrics.log()
        if(returnResult)userCB(qParams.result)
    }

    this.kill = function(){
        //{[addr]:{sort:sID,element:{[userVar]:{labels:sID,range: sID,filter:sID}},paths:{[pathStr]:{[jval]:sID}}}}
        for (const addr in self.addrSubs) {
            if (self.addrSubs.hasOwnProperty(addr)) {
                const {sort,element,paths} = self.addrSubs[addr];
                if(sort)sort.kill()
                for (const userVar in element) {
                    for (const type in element[userVar]) {
                        element[userVar][type].kill()
                    }
                }
                for (const path in paths) {
                    for (const j in paths[path]) {
                        paths[path][j].kill()
                    }
                }
            }
        }
        //console.log(self.b,self.sID,querySubs)
        delete querySubs[self.b][self.sID]
    }

    function Metrics(){
        let start = Date.now()

        this.timeTable = {}
        
        this.start = start
        this.last = start
        this.cumulativeTime = 0
        let self = this
        this.addTimeSplit = function(actionCompleted){
            let now = Date.now()
            let dif = now-self.last
            self.cumulativeTime = now - self.start
            self.last = now
            let data = {'Split in ms': dif,'Total Time Elapsed':self.cumulativeTime}
            self.timeTable[actionCompleted]=data
        }
        this.thingTable = {}
        this.totalReq = 0
        this.addThingCount = function(stepAddingThings,amountOfThings){
            self.totalReq +=amountOfThings
            let data = {'Data Points Requested':amountOfThings,'Total Requests':self.totalReq}
            self.thingTable[stepAddingThings] = data
        }

        this.log = function(){
            let tot = self.last-self.start
            let summaryTab = {'Summary':{'Total Requests':self.totalReq,'Total Time(ms)':tot,'ms/Request':Math.round((tot/self.totalReq)*100)/100}}
            for (const event in self.timeTable) {
                const tObj = self.timeTable[event];
                tObj.percent = (Math.round((tObj['Split in ms']/tot)*10000)/100)+'%'
            }
            console.table(self.timeTable)
            console.table(self.thingTable)
            console.table(summaryTab)
        }

    }
}