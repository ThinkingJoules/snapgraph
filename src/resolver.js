import { setValue, snapID } from "./util";


export default function Resolver(root){
    let self = this
    
    
    

    this.flattenMsgs = function(arrOfBodies){//dedup msgs in
        if(arrOfBodies.length > 1){
            let flatten = {}
            for (const setOfNodes of arrOfBodies) {
                let k = JSON.stringify(setOfNodes) //this seems a dumb way to do this...
                flatten[k] = setOfNodes // this will just give us the last message, which is fine since they are all equal???
            }
            return Object.values(flatten)
        }
        return arrOfMsgs
    }
   this.resolveAsk = function(askReply){
        //{hasRoot:{id:pval:val},fromOwner:{id:pval:val},gossip:{id:pval:val},checkSigs:pid:msg.b}
        
        //WHERE TO HANDLE PERMISSION DENIED VALUES OR 'NOT FOUND' VALUES?
        if(askReply.hasRoot){
            root.memStore.resolvedAsk(askReply.hasRoot)
        }else if(askReply.fromOwner){
            root.memStore.resolvedAsk(askReply.fromOwner)
        }
        if(askReply.checkSigs){
            resolveAll(Object.values(askReply.checkSigs))
        }
        if(askReply.gossip){
            for (const id in askReply.gossip) {
                const obj = askReply.gossip[id];
                self.verifyGossip(id,obj,function(node){
                    //root.memStore.handleGossip(ido,node)
                    root.memStore.resolvedAsk({id:node})
                })
            }
            
        }
        function resolveAll(arrOfBodies){
            arrOfBodies = self.flattenMsgs(arrOfBodies)
            if(arrOfBodies.length>1){//merge all these into one
                //we got more than one object that diverged
                //this is unfortunate and hopefully does not happen often
                root.opt.debug('DIVERGENT ASK RESPONSES')
                let cur = arrOfBodies.shift()
                crunch(cur,arrOfBodies)
            }else{
                self.checkAskSigs(arrOfBodies[0])//single response
            }
            function crunch(cur,arr){//reducer that validates signatures on conflicting objects, and ignores invalid data
                //the goal is to verify as few of signatures as possible
                //if only one value is different, then it should only verify one value
                //the next step is to check all the sigs, so however many we check here is duplicate work
                let next = arr.shift()
                let toGet = Object.keys(next).length
                for (const id in next) {
                    const incO = next[id];
                    let curO = cur[id] || (cur[id] = incO)//just incase the first message was lacking this one
                    self.resolveNode(id,curO,incO,clear)
                }
                function clear(){
                    toGet--
                    if(!toGet){
                        if(arr.length)crunch(cur,arr)
                        else self.checkAskSigs(cur)
                    }
                }
            }
        }
   }
   
    this.checkAskSigs = function(batch){
        let toGet = Object.keys(batch).length
        for (const id in batch) {
            const obj = batch[id];
            verifyVals(obj,got)
        }
        function got(){
            toGet--
            if(!toGet)root.memStore.resolvedAsk(batch)
        }
    }
    //if this is an ask response we only need to check sigs on gossip
    //if this is an ask response with data, just merge into mem
    //ask responses, we shouldn't have any data in mem (why we asked for it)

    //if this is a say and data, we need to check permissions/disk before acking/replying
    //if say, we only want to validate,merge,update on disk the values that changed
    //(in case they pass the whole object, and only 1 prop changed)
    this.resolveDeferred = function(nodeID,pval,valueObj){//NEED TO FINISH AFTER I HAVE 'SAY' GOING
        let cur = root.memStore.get(nodeID,pval)
        let changed = this.resolveVal(cur,valueObj)
        if(changed)root.memStore.resolvedDeferred({[nodeID]:{[pval]:cur}})// .add?? needs to fire change cb
    }
    this.resolveNode = function(id,curO,incO,pub,cb){
        let now = root.util.encTime()
        let toGet
        if(pub)toGet = Object.values(incO)
        for (const p in incO) {
            const incVase = incO[p];
            const curVase = curO[p] || (curO[p] = incVase)
            if(incVase.a>now){//defer
                let then = root.util.decTime(incVase.a)
                setTimeout(()=>{
                    self.resolveDeferred(id,p,incO)
                },(then-Date.now()))
                continue
            }
            if(pub){
                self.resolveVal(curVase,incVase,pub,done)
            }else{
                if(self.resolveVal(curVase,incVase))root.opt.debug('value changed in reduce.diffs')//should mutate if needed
            }            
        }
        function done(){
            toGet--
            if(!toGet)cb()
        }
    }
    this.resolveVal = function(cur,inc,pub,cb){
        //this is by property. so cur and inc should be vase obj {v,a,s,e}
        //is syncronous and mutates cur, so no need to return
        let {v:cv,a:ca} = cur
        let {v:iv,a:ia} = inc
        let now = root.util.encTime()
        // if(now<ia){//for the future...defer the change
        //     return {defer:true} //let the outer scope know to defer this value
        //     //move this to the outer scope, that way we only return a value when it is changed
        // }
        //now safety check incase first value was out of range, legal values although older, will change it
        if(ia<ca && ca<now){done()}//new value is older than current, ignore
        if(ca<ia || ca>now){//within our range, and incoming is newer than cur
            if(iv !== cv){//values are different
                if(pub){//untrusted
                    root.verify(inc.s,function(passed){
                        if(passed)cur.v = inc.v
                        done(passed)
                    })
                    return
                }else{
                    cur.v = inc.v
                    return true
                }
            }
            cur.a = inc.a //state changed but value is the same? soft update?
            return
        }
        if(ca === ia){
            let incomingValue = JSON.stringify(iv) || "";
            let currentValue = JSON.stringify(cv) || "";
            if(incomingValue === currentValue){done();return}
            if(incomingValue < currentValue){done();return};
            if(currentValue < incomingValue){ // Lexical only works on simple value types!
                if(pub){//untrusted
                    root.verify(inc.s,function(passed){
                        if(passed)cur.v = inc.v
                        cb(passed)
                    })
                    return
                }else{
                    cur.v = inc.v
                    return true
                }
            }
        }
        function done(change){
            if(cb && cb instanceof Function)cb()
            return change
        }
    }
    
    this.verifyVals = function(node,cb){
        let toGet = Object.keys(node).length//not very efficient? need to find a faster way
        for (const p in node) {
            const {v,s} = node[p]; //v is pub in this one, we signed the ip value
            if(!s){got(node,p);continue} //must be signed
            root.verify(s,v,function(val){
                if(val === v){
                    got()
                }else{
                    got(node,p)
                    console.log('sig failed. auth.verifyVals')
                }
            })
        }
        function got(thing,key){
            toGet--
            if(thing)thing[key].v = 'INVALID SIGNATURE'
            if(!toGet)cb(node)
        }
    }
    this.verifyGossip = function(ido,node,cb){
        ido = (ido instanceof snapID)?ido:snapID(ido)
        //assumes node is the full node
        //will return properties that pass in the cb
        //only used for ask replies. For say, everything is different
        //if we move away from SEA, all of this will change, as we will not store the value in the signature
        //so right now, v = s and verify returns v, but at somepoint it will not be
        let toGet = Object.keys(node).length//not very efficient? need to find a faster way
        switch (ido.type) {
            case 'owns': //~*PUB> 
                let {pub} = ido
                for (const ip in node) {
                    const {v,s} = node[ip]; //v is just true..., 
                    if(!s){got(node,ip);continue} //must be signed
                    root.verify(s,pub,function(val){
                        if(val === (ip+v)){
                            got()
                        }else{
                            got(node,ip)
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                break;
            case 'resource': //~!BASEID
                for (const ip in node) {
                    const {v,s} = node[ip]; //v is pub in this one, we signed the ip value
                    if(!s){got(node,ip);continue} //must be signed
                    root.verify(s,v,function(val){
                        if(val === (ip+v)){
                            got()
                        }else{
                            got(node,ip)
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                break;
            case 'auth': //~*PUB
                for (const key in node) {//keys are gun auth node keys
                    const {v,s} = node[key];
                    if(!s){got(node,key);continue} //must be signed
                    root.verify(s,pub,function(val){
                        if(val === (key+v)){
                            got()
                        }else{
                            got(node,key)
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                break;
            case 'alias': //~@ALIAS
                for (const pub in node) {
                    const {v,s} = node[pub];//v is powhash/randNumber
                    if(!s){got(node,pub);continue} //must be signed
                    root.verify(s,pub,function(val){
                        if(val === (pub+v)){
                            got()
                        }else{
                            got(node,pub)
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                //{pubkey:{v:randNum,a,s:sigOfRandNum,e}}
                break;
            default:
                break;
        }
        function got(thing,key){
            toGet--
            if(thing)thing[key].v = 'INVALID SIGNATURE'
            if(!toGet)cb(node)
        }
    }




}