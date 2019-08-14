export default function MemStore(root){
    
    function dumpStateChanges(){//should be on an in listener
        let buffer = Object.assign({}, nodeStatesBuffer)
        nodeStatesBuffer = {}
        stateBuffer = !stateBuffer
        sendToSubs(buffer)
    }

    function sendToSubs(buffer){
        for (const baseid in querySubs) {
            if(!buffer[baseid])continue
            const subO = querySubs[baseid];
            for (const sVal in subO) {
                const qParams = subO[sVal];
                qParams.newStates(buffer[baseid])   
            }
        }
        
    }
    
    function formatData(format, pType,dType,val){
        //returns the formatted value
        if(format){
            if(pType === 'date'){
                //date formatting
                //format should be an object
            }else{
                //solve()? need a subsitute
                //might make a formatter solve so it is faster
            }
        }
        return val
    }
    function handleCacheDep(nodeID, p, val){
        const address = toAddress(nodeID,p)
        let inheritsNodeID = isEnq(val)
        if(!inheritsNodeID){//could have changed from Enq to val
            return removeDep()
        }
        const looksAtAddress = inheritsNodeID
        if(!downDeps[address]){//add
            addDep()
            return true
        }
        if(downDeps[address] && downDeps[address] !== inheritsNodeID){//change if different
            removeDep()
            addDep()
            return true
        }
        return false
        function addDep(){
            downDeps[address] = looksAtAddress
            if(!upDeps[looksAtAddress])upDeps[looksAtAddress] = new Set()
            upDeps[looksAtAddress].add(address)
        }
        function removeDep(){
            let oldDep = downDeps[address]
            if(oldDep && upDeps[oldDep])upDeps[oldDep].delete(address)
            if(oldDep) delete downDeps[address]
    
            if(upDeps[address])return true
            return false
    
        }
    }
    function sendToCache(nodeID, p, value){
        let newEnq = handleCacheDep(nodeID,p,value)//will get deps correct so we can return proper data to buffer
        let address = toAddress(nodeID,p)
        let v = cache.get(address)//if it is inherited we want the value to go out to buffer
        let from = address
        while (isEnq(v)) {
            let lookup = isEnq(v)
            v = cache.get(lookup)
            from = lookup
        }
        if(newEnq || (from === address && value !== v)){//this is some sort of new/changed value
            cache.set(address,value)//should fire the watch cb
            handlePropDataChange()
            return
        }
        function handlePropDataChange(){
            let {p} = parseSoul(address)
            let startAddress = (address === from) ? from : address
            checkDeps(startAddress)
            function checkDeps(changedAddress){
                let deps = upDeps[changedAddress]
                if(deps){
                    for (const depAddr of deps) {
                        let subs = addrSubs[depAddr]
                        if(subs === undefined)continue
                        let [nodeID,pval]= removeP(depAddr)
                        getCell(nodeID,pval,processValue(depAddr,subs),true,true)
                        checkDeps(depAddr)//recur... until it can't
                    }
                }
            }
            
        }
    }
    function processValue(addr,subs){
        return function(val,from){
            let {format,propType,dataType} = getValue(configPathFromChainPath(addr),gb)
            if(dataType === 'array'){
                try{
                    val = JSON.parse(val)
                }catch(e){} 
            }
            for (const sID in subs) { //value has changed, trigger all subs
                handleSub(subs[sID],val)
            }
            const syms = Object.getOwnPropertySymbols(subs)
            for (const sym of syms) {
                handleSub(subs[sym],val)
            }
            function handleSub(subO,val){
                //console.log('firing sub for',addr)
                const {cb,raw} = subO
                if(!raw){
                    val = formatData(format,propType,dataType,val)
                }
                //console.log('firing sub with value:',val)
                cb.call(cb,val,from)
            }
        }
    }


}



function incomingPutMsg(msg,soul){//wire listener should get all emitted puts (either from us, or from other peers)
    if(msg && msg.put){
        soul = (soul !== undefined) ? soul : Object.keys(msg.put)[0]
        let putObj = msg.put[soul]
        if(IS_STATE_INDEX.test(soul)){//watching for a change on an index
            let stateAlias = {true:'active',false:'archived',null:'deleted'}
            for (const nodeID in putObj) {
                let {b} = parseSoul(nodeID)
                const state = putObj[nodeID];
                let toBuffer = stateAlias[state]
                setValue([b,nodeID],toBuffer,nodeStatesBuffer)
            }
            if(stateBuffer){
                stateBuffer = !stateBuffer
                setTimeout(dumpStateChanges,50)
            }
        }else if(!/\/UP$/.test(soul) && !TIME_INDEX_PROP.test(soul) && INSTANCE_OR_ADDRESS.test(soul) && !msg['@']){//watching for incoming data
            if(ALL_INSTANCE_NODES.test(soul)){//non-unorderedSet values
                for (const p in putObj) {
                    if(p === '_')continue
                    let addr = toAddress(soul,p)
                    let cVal = cache.get(addr)
                    //console.log('INC DATA; Cache is..',cVal)
                    if(cVal === undefined)continue //nothing is subscribing to this value yet, ignore
                    const v = putObj[p];
                    if(cVal === v)continue //value is unchanged, do nothing
                    let isSet = (typeof v === 'object' && v !== null && v['#'])
                    if(!isSet)sendToCache(soul,p,v)//value changed, update cache; sendToCache will handle Enq dependencies
                    let subs = addrSubs[addr]
                    console.log('NEW ADDR CACHE VALUE:',v, {subs})
                    if(subs === undefined)continue //no current subscription for this addr
                    
                    if(isEnq(v) || isSet)getCell(soul,p,processValue(addr,subs),true,true)//has subs, but value isEnq, get referenced value, then process subs
                    else processValue(addr,subs)(v,addr)//value is a value to return, process subs with value available
                }
            }else if(ALL_ADDRESSES.test(soul)){//this is an unorderedSet, soul is the address
                let cVal = cache.get(soul)
                console.log('INCOMING ADDRESS/SET',soul,putObj,cVal)

                if(cVal === undefined)return //nothing is subscribing to this value yet, ignore
                let v = (Array.isArray(cVal)) ? new Set(cVal) : new Set()
                for (const item in putObj) {
                    if(item == '_')continue
                    const boolean = putObj[item];
                    if(boolean)v.add(item) //added something to the set that wasn't there before
                    else if(!boolean && v.has(item))v.delete(item) //removed something that was previously in the set
                }
                v = [...v]
                let [s,p] = removeP(soul)
                sendToCache(s,p,v)//value changed, update cache; sendToCache will handle Enq dependencies
                let subs = addrSubs[soul]
                if(subs === undefined)return //no current subscription for this addr
                processValue(soul,subs)(v,soul)//value is a value to return, process subs with value available
            }
            
        }else if(/\/UP$/.test(soul) && !TIME_INDEX_PROP.test(soul) && ALL_ADDRESSES.test(soul) && !msg['@']){//UP looking inheritance dependencies
            //this will be for cascade/function stuff
            
        }else if(IS_CONFIG_SOUL.test(soul) && !msg['@']){//watching for config updates
            let type = IS_CONFIG(soul)
            if(!type)return
            let {b,t,r} = parseSoul(soul)
            if(!gbBases.includes(b))return//so we don't load other base configs.
            let data = JSON.parse(JSON.stringify(putObj))
            delete data['_']
            if(type === 'baseConfig'){
                data.props = {}
                data.groups = {}
                data.relations = {}
                data.labels = {}
                let configpath = configPathFromChainPath(soul)
                setValue(configpath,data,gb,true)
            }else if(type === 'typeIndex'){
                for (const tval in data) {//tval '#' + id || '-'+id
                    const boolean = data[tval];
                    let {t,r} = parseSoul(tval)
                    let path = configPathFromChainPath(makeSoul({b,t,r}))
                    let current = getValue(path,gb)
                    if(boolean && !current){//valid things, that is not in gb
                        setValue(path,{},gb)
                    }else if(!boolean && current){//deleted but was active, null from gb
                        setValue(path,null,gb)
                    }
                }
            }else if(type === 'propIndex'){
                for (const p in data) {
                    const boolean = data[p];
                    let path = configPathFromChainPath(makeSoul({b,t,r,p}))
                    let current = getValue(path,gb)
                    if(boolean && !current){//valid things, that is not in gb
                        setValue(path,{},gb)
                    }else if(!boolean && current){//deleted but was active, null from gb
                        setValue(path,null,gb)
                    }
                }
            }else if(['thingConfig','propConfig','labelIndex'].includes(type)){
                let configpath = configPathFromChainPath(soul)
                let data = JSON.parse(JSON.stringify(putObj))
                delete data['_']
                if(data.usedIn)data.usedIn = JSON.parse(data.usedIn)
                if(data.pickOptions)data.pickOptions = JSON.parse(data.pickOptions)
                setValue(configpath,data,gb,true)

            }
            if(['typeIndex','propIndex','labelIndex'].includes(type))return
            let values = JSON.parse(JSON.stringify(getValue(configPathFromChainPath(soul),gb)))
            for (const subID in configSubs) {
                const {cb,soul:cSoul} = configSubs[subID];
                if(cSoul === soul){
                    cb(values)
                }
            }
        }
    }
}