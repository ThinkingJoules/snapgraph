import { setValue } from "./util";


export default function Resolver(root){
    let self = this
    
    
    
    
   this.resolveAsk = function(arrOfMsgs){
        let temp,diffs,resolved,hasRoot
        if((temp = arrOfMsgs.filter(x=>x.from.hasRoot)).length){
            //if from our own server, ignore sigs, and all other responses
            diffs = flattenMsgs(temp)
            hasRoot = true
        }else{
            diffs = flattenMsgs(arrOfMsgs)
        }
        if(diffs.length>1){//merge all these into one
            //we got more than one object that diverged
            //this is unfortunate and hopefully does not happen often
            root.opt.debug('DIVERGENT ASK RESPONSES')
            let first = diffs.shift()
            let now = root.util.encTime()
            resolved = diffs.reduce(function(first,msg){
                for (const id in msg.b) {
                    const incO = msg.b[id];
                    let curO = first[id] || (first[id] = incO)//just incase the first message was lacking this one
                    for (const p in incO) {
                        const incVase = incO[p];
                        const curVase = curO[p] || (curO[p] = incVase)
                        if(incVase.a>now){//defer
                            let then = root.util.decTime(incVase.a)
                            let o = {from:msg.from}
                            setValue(['b',id,p],incVase,o)
                            setTimeout(()=>{
                                self.resolveAsk([o])
                            },(then-Date.now()))
                            continue
                        }
                        if(self.resolveVal(curVase,incVase))root.opt.debug('value changed in reduce.diffs')//should mutate if needed
                    }
                }
                return first
            },first)
        }else resolved = diffs
        //the messages are now merged in to one dataset
        //now we can send them to the memStore where the cb's will fire
        if(hasRoot){
            root.memStore.resolvedAsk(resolved)//<<<<<MAKE THIS  SHOULD THIS TRY TO SEND IT ON TO PERSIST IF EXISTS?
            //we need to handle never seen and permission denied values at some point
            //not sure how they will go through the resolver..
            //every peer must return some sort of value for EVERY address in the ask request
            //otherwise our higher level cb's and chain commands can hang
            //resolvedAsk would make sense as it will have to put the values into mem and fire cb's
            //so it is already looking at every value
            //will have to add something for signature failure as well...
        }else{
            self.checkAskSigs(resolved,)//<<<<MAKE THIS
        }
   }
   this.flattenMsgs = function(arrOfMsgs){//dedup msgs in
        if(arrOfMsgs.length > 1){
            let flatten = {}
            for (const msg of arrOfMsgs) {
                let k = JSON.stringify(msg.b) //this seems a dumb way to do this...
                flatten[k] = msg // this will just give us the last message, which is fine since they are all equal???
            }
            return Object.values(flatten)
        }
        return arrOfMsgs
    }
    
    this.resolveNode = function(ido,node,fromPeer,next){
        //if this is an ask response we only need to check sigs on gossip
        //if this is an ask response with data, just merge into mem
        //ask responses, we shouldn't have any data in mem (why we asked for it)

        //if this is a say and data, we need to check permissions/disk before acking/replying
        //if say, we only want to validate,merge,update on disk the values that changed
        //(in case they pass the whole object, and only 1 prop changed)
    }
    this.resolveVal = function(cur,inc){
        //this is by property. so cur and inc should be vase obj {v,a,s,e}
        //is syncronous and mutates cur, so no need to return
        let {v:cv,a:ca} = cur
        let {v:iv,a:ia} = inc
        // let now = root.util.encTime()
        // if(now<ia){//for the future...defer the change
        //     return {defer:true} //let the outer scope know to defer this value
        //     //move this to the outer scope, that way we only return a value when it is changed
        // }
        if(ia<ca){return}//new value is older than current, ignore
        if(ca<ia){//within our range, and incoming is newer than cur
            if(iv !== cv){//values are different
                cur.v = inc.v
                return {change:true}
            }
            cur.a = inc.a //state changed but value is the same? soft update?
            return
        }
        if(ca === ia){
            let incomingValue = JSON.stringify(iv) || "";
            let currentValue = JSON.stringify(cv) || "";
            if(incomingValue === currentValue){return}
            if(incomingValue < currentValue){return};
            if(currentValue < incomingValue){ // Lexical only works on simple value types!
                cur.v = inc.v
                return {change:true}
            }
        }
    }
    this.verifyGossip = function(ido,node,cb){
        //assumes node is the full node
        //will return properties that pass in the cb
        //only used for ask replies. For say, everything is different
        //if we move away from SEA, all of this will change, as we will not store the value in the signature
        //so right now, v = s and verify returns v, but at somepoint it will not be
        let out = {}
        switch (ido.type) {
            case 'resource':
                let {b} = ido
                let toGet = Object.keys(node).length//not very efficient? need to find a faster way
                for (const ip in node) {
                    const {v,s} = node[ip]; //v is pub in this one, we signed the ip value
                    if(!s){toGet--;continue} //must be signed
                    root.verify(s,v,function(val){
                        if(val === ip){
                            out[ip] = node[ip]
                            toGet--
                            if(!toGet)cb(out)
                        }else{
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                break;
            case 'owns':
            case 'auth':
                let {pub} = ido
                let toGet = Object.keys(node).length//not very efficient? need to find a faster way
                for (const key in node) {
                    const {v,s} = node[key];
                    if(!s){toGet--;continue} //must be signed
                    root.verify(s,pub,function(val){
                        if(val === v){
                            out[key] = node[key]
                            toGet--
                            if(!toGet)cb(out)
                        }else{
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                break;
            case 'alias':
                let toGet = Object.keys(node).length//not very efficient? need to find a faster way
                for (const pub in node) {
                    const {v,s} = node[pub];
                    if(!s){toGet--;continue} //must be signed
                    root.verify(s,pub,function(val){
                        if(val === v){
                            out[pub] = node[pub]
                            toGet--
                            if(!toGet)cb(out)
                        }else{
                            console.log('sig failed. auth.verifyGossip')
                        }
                    })
                }
                //{pubkey:{v:randNum,a,s:sigOfRandNum,e}}
                break;
            default:
                break;
        }
    }




}