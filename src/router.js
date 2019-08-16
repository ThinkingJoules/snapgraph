import { on, setValue, getValue } from "./util";
const noop = function(){}
export default function Router(root){
    //assume root has ws setup and bootstrap peers already listed/connected
    //we may need to connect additional peers
    this.root = root
    const router = this
    router.pending = new Map()
    const send = router.send = {}
    const recv = router.recv = {}
    const route = router.route = {}

    router.getCellBufferState = false //only for getCell calls
    router.getCellBuffer = {}
    router.getCellDoneCBs = {} //{[addr:[[cb,raw]]]}
    router.batchedCellReq = function(){//direct to super peer(s??)
        let b = Object.assign({},router.getCellBuffer)
        router.getCellBuffer = {}
        router.getCellBufferState = true
        let dataRequests = new Map()
        let gossipRequests = new Map()
        for (const nodeID in b) {//sort requests
            let node = snapID(nodeID)
            const pArgs = b[nodeID];
            let to = (node.is === 'gossip') ? gossipRequests : dataRequests
            let ps = []
            if(node.is === 'gossip')to.set(node.toStr(),ps)
            else to.set(node,ps)
            for (const p in pArgs) {
                const argArray = pArgs[p];
                router.getCellDoneCBs[node.toAddress(p)] = argArray
                ps.push(p)
            }
        }
        if(gossipRequests.size)router.route.askGossip(gossipRequests)
        if(dataRequests.size)router.route.ask(dataRequests)
        //see if we have resources, if not add the messages to pending and setup connection cycle
        //if so, just send the messages
    }
    router.getNodeBufferState = false //only for getNode calls
    router.getNodeBuffer = {}
    router.getNodeDoneCBs = {} //{id:[[cb,raw]]}
    router.batchedNodeReq = function(){//direct to super peer(s??)
        let b = Object.assign({},router.getNodeBuffer)
        router.getNodeBuffer = {}
        router.getNodeBufferState = true
        let dataRequests = new Map()
        let gossipRequests = new Map()
        for (const nodeID in b) {//sort requests
            let node = snapID(nodeID)
            const cbArr = b[nodeID];
            let to = (node.is === 'gossip') ? gossipRequests : dataRequests
            let ps = false
            if(node.is === 'gossip')to.set(node.toStr(),ps)
            else to.set(node,ps)
            router.getNodeDoneCBs[node.toStr()] = cbArr
        }
        if(gossipRequests.size)router.route.askGossip(gossipRequests)
        if(dataRequests.size)router.route.ask(dataRequests)
        //see if we have resources, if not add the messages to pending and setup connection cycle
        //if so, just send the messages
    }
    router.addResouce = function(ido,node){
        //id should be ~!baseID node
        //node should be {ipAddress: {v:pubKeyBaseOwner}}
        //has already been validated, take as truth
        let {b} = ido
        let temp
        for (const ip in node) {
            setValue([b,'peers',ip],true,root.resources)
            if((temp=root.mesh.peers.get(ip))){
                setValue([b,'connected',ip],temp,root.resources)
            }
        }
    }
 

    //console.log('WIRE BATCH',requests,doneCBs)
    // gun._.on('out', {
    //     getBatch: requests,
    //     '#': gun._.ask(function(msg){
    //         let sg = msg.subGraph
    //         for (const soul in sg) {
    //             const putObj = sg[soul];
    //             for (const prop in putObj) {
    //                 if(prop === '_')continue//these are valid gun nodes
    //                 const value = putObj[prop];
    //                 let addr = toAddress(soul,prop)
    //                 sendToCache(soul,prop,value)
    //                 let argsArr = doneCBs[addr]
    //                 let e
    //                 if(e = isEnq(value)){//send it for another round...
    //                     let [s,p] = removeP(e)
    //                     for (const args of argsArr) {
    //                         getCell(s,p,...args)
    //                     }
    //                 }else{
    //                     handleGetValue(soul,prop,value,argsArr)
    //                 }      
    //             }    
    //         }
    //     })
    // })
    





    send.intro = function(peer,opts){//sender generates
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000*10))//shouldn't take too long
        let b = {isPeer:root.isPeer}
        let msg = new SendMsg('intro',b,['isPeer','has'],expireReq)
        track(msg,new TrackOpts(opts.acks,opts.replies,{},{onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}))
        if(!peer.met)peer.met = Date.now()
        root.opt.debug('sending intro',msg)
        peer.send(msg)
        function onAck(v,next){
            if(this.acks === 1){//only on first ack
                let n = Date.now()
                peer.ping = n-this.sent //round trip
            }
            next()
        }
        function onDone(value,next){//what to do with their response
            let {isPeer,has} = value
            peer.isPeer = isPeer
            if(has){//should be valid snap nodes
                //root.on.in(has,peer)//should send it back around to recv.gossip>resource
                root.resolver.resolveAsk({checkSigs:new Map(Object.entries(has))})//emulate an ask response
            }
            
            next()
            //b should have auth, need to verify sig and compare to challenge
        }
    }
    recv.intro = function(msg){//this is what the receiver is going to do on getting it
        let {b} = msg
        let {isPeer} = b
        //authcode would be an invite YOU sent to join your base,they are claiming it?, or like IoT (crypto-less) signin.
        let peer = msg.from
        peer.isPeer = isPeer
        let m = new RespMsg('intro',msg.s,{isPeer:root.isPeer})
        if(root.isPeer && root.persist){//we need to get our 'has'
            m.has = root.has
            //root has should be things we have on disk and match the public gossip
            //this will include more info than exactly what we have
            //but this is good, as it gives the peer backups incase we go offline
            //the peerer will validate all these records so this peer can't tamper with it.

        }
        peer.send(m)
        root.mesh.shuffle()
    }
    send.challenge = function(peer,opts){//sender generates
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000*60*60*8))//must auth within 8 hrs??? Probably only browsers that will be waiting on human 
        let b = {challenge:0}
        let msg = new SendMsg('challenge',b,['auth','pub'],expireReq)
        msg.b.challenge = msg.s //challenge is signing this msgID, that way the know where to respond
        track(msg,new TrackOpts(opts.acks,opts.replies,{},{onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}))
        peer.challenge = msg.s
        if(!peer.met)peer.met = Date.now()
        root.opt.debug('sending challenge',msg)
        peer.send(msg)
        function onDone(value,next){//what to do with their response
            console.log('HAS SIG',value,this)
            let {auth,pub} = value
            root.verify(auth,pub,function(valid){
                if(valid){
                    root.opt.debug('Valid signature, now authenticated!')
                    peer.pub = pub
                    peer.challenge = false
                    if(root.user)root.on.pairwise(peer)
                }else{
                    root.opt.log('Signature did not validate!')
                    //what to do? submit another challenge?
                    //send an error message?
                    //if these are two servers then no one will know this has failed
                }
            })
            next()
        }
    }
    recv.challenge = function(msg){//this is what the receiver is going to do on getting it
        let {challenge} = msg.b
        //authcode would be an invite YOU sent to join your base,they are claiming it?, or like IoT (crypto-less) signin.
        let peer = msg.from
        peer.theirChallenge = challenge
        peer.isPeer = isPeer
        if(root.sign){
            root.mesh.auth(peer)
        }else if(root.opt.authCode){
            let m = {m:'auth',r:challenge,b:{authCode:root.opt.authCode}}
            console.log(m)
            peer.send(m)
            //?? not sure if this will work, but for IoT or non-crypto things we can auth differently?
        }
        //else do nothing, we are not signed in.
        //if !root.isNode, handle 'has'
    }
    send.ping = function(peer){
        let msg = new SendMsg('ping',false,false,false,true)
        track(msg,new TrackOpts(1,0,0,false,onDone,function(v,n){n()}))
        peer.send(msg)
        function onDone(value){
            console.log('got pong')
            let n = Date.now()
            peer.ping = n-this.sent //round trip
        }
    }
    recv.ping = function(){}//no logic, the ack is the ping
    send.error = function(peer,err){
        let b = err
        let msg = new SendMsg('error',b,false)
        peer.send(msg)
    }


    route.askGossip = function(reqMap){
        let body = {}
        for (const [nodeID,pvals] of reqMap.entries()) {
            body[nodeID] = pvals
        }
        let peers = root.mesh.isPeer
        if(peers.length === 1){
            router.send.ask([peers[0]],body,{hops:2})
        }else if(peers.length >=2){
            router.send.ask([peers.slice(0,2)],body,{hops:2})
        }else{
            root.opt.log('You must be offline, no peers to route request to.')
        }
    }
    route.ask = function(reqMap){//only for data requests, can be from getCell or getNode
        //analyze each soul and figure out if we can route to it
        //if not, we need to ask where to find it, and once we have that, we connect to it and then send the request
        //will want to make sure we have authed with that peer before we send the message?
        //may need to put a listener on the peer and queue messages?
        //not everything needs an auth, but if it does, then we have to handle a long pending msg or error...
        let byB = {}
        for (const [ido,pvals] of reqMap.entries()) {
            let {b} = ido
            byB[b] = byB[b] || {}
            byB[b][ido.toStr()] = pvals   
        }
        for (const base in byB) {
            const body = byB[base];
            let peers
            if((peers = isConn(base))){
                tasks(body)(peers)//sending to all connected peers that have this data?? Sure
            }else if((peers = needsConn(base))){
                root.assets.addPendingMsg(base,tasks(body))
                for (const url of peers) {//connect all? sure, probably only 1-3
                    root.mesh.connect(url)
                }
            }else{
                root.assets.findResource(base)
                root.assets.addPendingMsg(base,tasks(body))
            }
                
        }
        function tasks(msgBody){//waiting for connection
            return function(to){//send message
                router.send.ask(to,msgBody)
            }
        }
        function isConn(base){
            let seen = getValue(['resources',b])
            if(!seen)return false
            let peers
            if((peers = Object.values(seen.connected)) && peers.length){
                let owns = peers.filter(x=>x.owns.has(base))
                if(owns.length) return owns//returning peerObjects
                return peers
            }
            return false
        }
        function needsConn(base){
            let seen = getValue(['resources',b])
            if(!seen)return false
            let peers
            if(seen.peers && (peers = seen.peers) && peers.length){
                return peers//returning array of urls
            }
            return false
        }

        
    }
    send.ask = function(peers, body ,opts){
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000))//breadth, short duration,message will keep getting repeated until it expires or makes it 2 hops
        let msg = new SendMsg('ask',body,true,expireReq,false,(opts.hops || 1))//hope body is formatted correctly
        msg.to = peers.map(x=>x.id)
        let ons = {onError: opts.onError,onDone:[onDone,opts.onDone],onReply:[onReply,opts.onReply],onAck:[onAck,opts.onAck]}
        track(msg,new TrackOpts(opts.acks,(opts.replies || peers.length),{},ons))
        peers.map(x=> (x.send && x.send(msg)))
        function onReply(msg,next){
            //{hasRoot:{id:pval:val},fromOwner:MAP{id:pval:val},checkSigs:{from:{id:pval:val},gossip:{id:pval:val}}}
            let val = this.value
            if(msg.from.hasRoot){//just merge the message down on receiving
                for (const id in msg.b) {
                    const incO = msg.b[id];
                    const curO = val.hasRoot[id] || (val.hasRoot[id] = incO)
                    root.resolver.resolveNode(id,curO,incO)
                }
            }else{//loop through souls, if it is gossip or the peer does not own {b} then checkSigs
                let pid = msg.from.id
                let owns = msg.from.owns
                for (const id in msg.b) {
                    let ido = snapID(id)
                    let {b} = ido
                    if(ido.is === 'gossip'){
                        const incO = msg.b[id];
                        const curO = val.gossip[id] || (val.gossip[id] = incO)
                        root.resolver.resolveNode(id,curO,incO)
                    }else if(owns && owns.has(b)){
                        const incO = msg.b[id];
                        const curO = val.fromOwner[id] || (val.fromOwner[id] = incO)
                        root.resolver.resolveNode(id,curO,incO)
                    }else{//need to check signatures, so we can't merge them yet, just collect them
                        val.checkSigs = val.checkSigs || {}
                        val.checkSigs[pid] = msg.b
                    }
                }
            }
            next()
        }
        function onDone(askReply,next){
            root.resolver.resolveAsk(askReply)
            next()
        }
    }
    recv.ask = function(msg){
        let {b,from} = msg
        

    }
    recv.gossip = function(idObj,node,fromPeer){//move to memstore??
        //if(root.isPeer)root.memStore.add(idObj,node)//clients don't store gossip in mem?//no one stores in mem?
        if(fromPeer.hasRoot)next(node)
        else root.verifyGossip(idObj,node,next)
        function next(obj){
            switch (idObj.type) {
                case 'resource':
                    router.addResouce(idObj,obj)
                    break;
                case 'owns':
                    root.mesh.verifyPeer(idObj,obj)
                    break;
                case 'auth':
                    break;
                case 'alias':
                    break;
                default:
                    break;
            }
        } 
    }
    /*
    All data sent/received in snap will be like:
    {soul:{
        sig:signature?? on node,special prop? stored only in db and transmitted(cannot be asked for independently?)
        if only for soul, how do we check that the specifc prop is signed? Soul could work for gossip, but data is harder
        need to store sig on prop?? Lots of overhead, but how else to do it? Only need sig for putting data on not-your-peer
        pval1: {v:value,a:encTime..State,s:signature,e:expire}
    }}  
    */

    // m:msgType, s:originalMsgID, r:respondingToThisOrigID er:expectsResponse, b:body, e:expiration date to:message went/is going to
    function SendMsg(type,body,expectResponse,expire,ack,hops){
        this.m = type
        this.s = root.util.rand(4,false,true)
        if(expectResponse)this.er = expectResponse //if we expect a response, which type? (more for humans, we don't do anything with it? Could reject resp if != to)
        if(body)this.b = body
        if(expectResponse)this.e = expire ? expire : (Date.now()+(1000*30))//30 seconds as default?? should have default per msg type
        if(hops)this.h = hops*1
        this.ack = !!ack //can ack a msg seperate from the reply, ack = acknowledge receipt
    }
    function RespMsg(type,respToMsgID,body){
        this.m = type
        this.r = respToMsgID
        this.b = body
    }
    function TrackOpts(acks,replies,initialValue,isSub,ons){
        //onError,Done,Reply will be an array of functions that run after snapsgraphs
        let missing = [undefined,false,null]
        let self = this
        this.acks = (!missing.includes(acks) && acks) || 0
        this.replies = (!missing.includes(replies) && replies) || 1
        this.initialValue = initialValue
        this.onAck = isArr(ons.onAck) || []
        this.onError = isArr(ons.onError) || [(err)=>{root.opt.log(err)}]
        this.onDone = isArr(ons.onDone) || []
        this.onReply = isArr(ons.onReply) || [function(msg,next){self.value = msg.b;next()}]//we should always pass one in for internal messages
        function isArr(value){
            if(!Array.isArray(value) && value instanceof Function)return [value]
            if(Array.isArray(value))return value.filter(x => x instanceof Function)
            return false
        }
    }
    function track(msg,opts){
        //create new Tracker
        //store tracker in self.pending.set(msg.s,tracker)
        opts = opts || {}
        let expire = msg.e || (Date.now()+(1000*9)) //default will only be set if we are not expecting a response? which we aren't tracking these anyway.
        let tracker = new Tracker(msg,opts)
        tracker.timer = (expire === Infinity) ? expire : setTimeout(()=>{
            tracker.on('error','MESSAGE EXPIRED: '+tracker.id)
        },(expire-Date.now()))
        tracker.on('ack',function(value,next){this.acks++;next()})
        tracker.on('ack',opts.onAck)
        tracker.on('ack',function(){
            this.test()
        })
        tracker.on('reply',function(newVal,next){this.replies++;next()})
        tracker.on('reply',opts.onReply)
        tracker.on('reply',function(){
            this.test()
        })//will always be last, no need for next
        tracker.on('error',opts.onError)
        tracker.on('error',function(){router.pending.delete(this.id)})
        tracker.on('done',opts.onDone)
        tracker.on('done',function(){
            if(!tracker.isSub){
                clearTimeout(self.timer)
                router.pending.delete(this.id)
            }
        })
        
        tracker.sent = Date.now()
        router.pending.set(tracker.id,tracker)
        //root.opt.debug('tracking msg',tracker)

        function Tracker(msg,opts){
            opts = opts || {}
            let self = this
            this.on = on
            this.id = msg.s || msg.r
            this.acks = 0
            this.replies = 0
            this.isSub = opts.isSub || false
            this.value = opts.initialValue
            this.test = function(){
                let acksNeeded = opts.acks
                let repliesNeeded = opts.replies
                if(acksNeeded >= self.acks && repliesNeeded >= self.replies){
                    self.on('done',self.value)
                }
            }
        }
    }
}

