import { on, setValue, getValue } from "./util";
import EventEmitter from 'eventemitter3'
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
    const batch = router.batch = {}
    const msgs = router.msgs = {send:{},recv:{}}
    batch.getCell = new GetBatch(sendCellReq)
    batch.getNode = new GetBatch(sendNodeReq)
    batch.gossip = new GossipBatch(root)
    function sendCellReq(b){//direct to super peer(s??)
        let dataRequests = new Map()
        let gossipRequests = new Map()
        for (const addr in b) {//sort requests
            let node = snapID(addr),nodeID = node.toNodeID(), p = node.p,temp
            const argArray = b[addr];
            let to = (node.is === 'node') ? dataRequests : gossipRequests
            if(!(temp = to.get(nodeID)))temp=to.set(nodeID,[]).get(nodeID)
            root.store.addAskCB(nodeID,p,argArray)
            temp.push(p)
        }
        if(gossipRequests.size)router.route.askGossip(gossipRequests)
        if(dataRequests.size)router.route.ask(dataRequests)
        //see if we have resources, if not add the messages to pending and setup connection cycle
        //if so, just send the messages
    }
    function sendNodeReq(){//direct to super peer(s??)
        let dataRequests = new Map()
        let gossipRequests = new Map()
        for (const nodeID in b) {//sort requests
            let node = snapID(nodeID)
            const cbArr = b[nodeID];
            let to = (node.is === 'node') ? dataRequests : gossipRequests
            let ps = false
            to.set(nodeID,ps)
            root.store.addAskCB(nodeID,false,cbArr)
        }
        if(gossipRequests.size)router.route.askGossip(gossipRequests)
        if(dataRequests.size)router.route.ask(dataRequests)
        //see if we have resources, if not add the messages to pending and setup connection cycle
        //if so, just send the messages
    }
    
    send.intro = function(peer,opts){//sender generates
        opts = opts || {}
        let msg = msgs.send.intro(opts)
        let ons = {onDone,onAck}
        track(msg,new TrackOpts(1,1,{},ons))
        if(!peer.met)peer.met = Date.now()
        root.opt.debug('sending intro',msg)
        peer.send(msg)
        function onAck(v){
            if(this.acks === 1){//only on first ack
                let n = Date.now()
                peer.ping = n-this.sent //round trip
                console.log(peer.ping)
            }
        }
        function onDone(value){//what to do with their response
            console.log(value)
            let {isPeer,has} = value
            console.log('intro reply',{isPeer,has})
            peer.isPeer = isPeer
            if(has){//should be valid snap nodes
                let things = Object.keys(has)
                //emulating an ask response
                if (things.length){
                    for (const id of things) {
                        root.store.addAskCB(id,false,[(node)=>{root.assets.processResourceNode(id,node)}])
                        root.assets.subResource(id)
                    }
                    root.resolver.resolveAsk({checkSigs:has})//emulate an ask response
                }
                
            }
        }
    }
    msgs.send.intro = function(opts){
        let expireReq = opts.expire || (Date.now()+(1000*20))//shouldn't take too long
        let b = {isPeer:root.isPeer}
        return new SendMsg('intro',b,['isPeer','has'],expireReq,true)
    }  
    recv.intro = function(msg){//this is what the receiver is going to do on getting it
        console.log('incoming intro')
        let {b} = msg
        let {isPeer} = b
        let peer = msg.from
        peer.isPeer = isPeer
        let m = msgs.recv.intro(msg)
        console.log('sending intro reply',m)
        peer.send(m)
    }
    msgs.recv.intro = function(incMsg){
        let b = {isPeer:root.isPeer}
        if(root.isPeer && root.opt.persist.data){//we need to get our 'has'
            b.has = root.has
            //root has should be things we have on disk and match the public gossip
            //this will include more info than exactly what we have
            //but this is good, as it gives the peer backups in case we go offline
            //the peerer will validate all these records so this peer can't tamper with it.
        }
        return new RespMsg(incMsg,b)
    }
    send.challenge = function(peer,opts){//sender generates
        opts = opts || {}
        let ons = {onDone,onExpire}
        let msg = msgs.send.challenge(opts)
        track(msg,new TrackOpts(opts.acks,opts.replies,{},ons))
        peer.challenge = msg.s
        if(!peer.met)peer.met = Date.now()
        root.opt.debug('sending challenge',msg)
        peer.send(msg)
        function onDone(value){//what to do with their response
            console.log('HAS SIG',value,this)
            let {auth,pub,is} = value
            root.verify(auth,pub,function(valid){
                if(valid){
                    root.opt.debug('Valid signature, now authenticated!')
                    peer.pub = pub
                    peer.challenge = false
                    peer.verified = true //need to add this, since we are adding pubs to peers as we see gosisp nodes
                    if(is){
                        let things = Object.keys(is)
                        //emulating an ask response
                        for (const id of things) {
                            root.store.addAskCB(id,false,[(node)=>{root.assets.processPeerOwnershipNode(id,node)}])
                            root.assets.subPeerOwnership(id)
                        }
                        root.resolver.resolveAsk({checkSigs:is})//emulate an ask response
                    }
                    if(root.user)root.on.pairwise(peer)
                }else{
                    root.opt.log('Signature did not validate!')
                    //what to do? submit another challenge?
                    //send an error message?
                    //if these are two servers then no one will know this has failed
                }
            })
        }
        function onExpire(value){
            peer.challenge = false
        }
    }
    msgs.send.challenge = function(opts){
        let expireReq = opts.expire || (Date.now()+(1000*60*60*8))//must auth within 8 hrs??? Should only be browsers that will be waiting on human 
        let b = {challenge:0}
        let msg = new SendMsg('challenge',b,['auth','pub'],expireReq)
        msg.b.challenge = msg.s //challenge is signing this msgID, that way the know where to respond
        return msg
    }
    recv.challenge = function(msg){//this is what the receiver is going to do on getting it
        let {challenge} = msg.b
        //authcode would be an invite YOU sent to join your base,they are claiming it?, or like IoT (crypto-less) signin.
        let peer = msg.from
        peer.theirChallenge = challenge
        if(root.sign){
            root.mesh.auth(peer)
        }else if(root.opt.authCode){
            let m = msgs.recv.challenge(challenge)
            console.log(m)
            peer.send(m)
            //?? not sure if this will work, but for IoT or non-crypto things we can auth differently?
        }
        //else do nothing, we are not signed in.
        //if !root.isNode, handle 'has'
    }
    msgs.recv.challenge = function(chal,sig){
        let m = {m:'auth',r:chal},b
        if(root.opt.authCode){
            b = {authCode:root.opt.authCode}
        }else{
            //IS send our ~*PUB> node
            b = {auth:sig,pub:root.user.pub}
            if(root.isPeer){
                b.is = root.is
            }
        }
        m.b = b
        return m

    }
    send.ping = function(peer){
        let msg = new SendMsg('ping',false,false,false,true)
        track(msg,new TrackOpts(1,0,0,{onDone,onAck}))
        peer.send(msg)
        function onAck(ts){
            let n = Date.now()
            peer.drift = ts-(n-((n-this.sent)/2))//theySent-(weGot-(1wayLatency))
        }
        function onDone(value){
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


    route.ask = function(reqMap){//gossip only 'get'
        let body = {}
        reqMap.forEach(function(v,k){
            body[k] = v
        })
        let peers = [...root.mesh.peers.values()].filter(x=> (x.connected && x.isPeer)).sort((a,b)=>a.ping-b.ping)
        if(peers.length === 1){
            router.send.ask([peers[0]],body,{hops:2})
        }else if(peers.length >=2){
            router.send.ask([peers.slice(0,2)],body,{hops:2})
        }else{
            //queue messages?
            root.opt.log('You must be offline, no peers to route request to.')
        }
    }
    send.ask = function(peers, body ,opts){
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000))//breadth, short duration,message will keep getting repeated until it expires or makes it 2 hops
        let msg = new SendMsg('ask',body,true,expireReq,false,(opts.hops || 1))//hope body is formatted correctly
        msg.to = peers.map(x=>x.id)
        let ons = {onError: opts.onError,onDone:[onDone,opts.onDone],onReply:[onReply,opts.onReply],onAck:[onAck,opts.onAck]}
        track(msg,new TrackOpts(opts.acks,(opts.replies || peers.length),{},ons))
        peers.forEach(x=> (x.send && x.send(msg)))
        function onReply(msg){
            //{hasRoot:{id:pval:val},fromOwner:MAP{id:pval:val},checkSigs:{from:{id:pval:val},gossip:{id:pval:val}}}
            let val = this.value
            if(msg.from.hasRoot){//just merge the message down on receiving
                let hasRoot = val.hasRoot || (val.hasRoot = {})
                for (const id in msg.b) {
                    const incO = msg.b[id];
                    const curO = hasRoot[id] || (hasRoot[id] = incO)
                    root.resolver.resolveNode(id,curO,incO)
                }
            }else{//loop through souls, if it is gossip or the peer does not own {b} then checkSigs
                let pid = msg.from.id
                let owns = msg.from.owns
                for (const id in msg.b) {
                    let ido = snapID(id)
                    let {b} = ido
                    if(ido.is === 'gossip'){
                        let gossip = val.gossip || (val.gossip = {})
                        const incO = msg.b[id];
                        const curO = gossip[id] || (gossip[id] = incO)
                        root.resolver.resolveNode(id,curO,incO)
                    }else if(owns && owns.has(b)){
                        let fromOwner = val.fromOwner || (val.fromOwner = {})
                        const incO = msg.b[id];
                        const curO = fromOwner[id] || (fromOwner[id] = incO)
                        root.resolver.resolveNode(id,curO,incO)
                    }else{//need to check signatures, so we can't merge them yet, just collect them
                        val.checkSigs = val.checkSigs || {}
                        val.checkSigs[pid] = msg.b
                    }
                }
            }
        }
        function onDone(askReply){
            root.resolver.resolveAsk(askReply)
        }
    }
    recv.ask = function(msg){
        let {b,from} = msg
        //TODO check permissions...
        for (const id in b) {
            const props = b[id];
            if(!props)root.store.get(id,false)
                
        }
        

    }

    send.say = function(body,cb,opts){
        opts = opts || {}
        let msg = msgs.send.say(body,opts)
        let peers = root.mesh.getNonClients()
        msg.to = peers.map(x=>x.id)
        let ons = {onDone}
        track(msg,new TrackOpts(1,1,{confirm:false},ons))
        peers.forEach(x=> (x.send && x.send(msg)))
        function onDone(value){//what to do with their response
            let {confirm} = value
            if(cb && cb instanceof Function)cb(confirm)//take the first response, all responses should match
        }
    }
    msgs.send.say = function(b,opts){
        let expireReq = opts.expire || (Date.now()+(1000*20))//shouldn't take too long
        return new SendMsg('say',b,['confirm'],expireReq,true)
    } 
    recv.say = async function(msg){//new block to append to some cid
        let {b,to,from} = msg || {}
        let [sig,block] = b || []
        let {pub} = block || {}
        // if(!await root.verify(pub,sig,block)){
        //     from.send(msgs.recv.say(msg,false))
        //     return
        // }
        batch.gossip.add(sig,block,to)
        from.send(msgs.recv.say(msg,true))//confirm without checking for tail conflict?? How do we know this peer is storing all data?
        root.store.indexGossip([[sig,block]])
    }
    msgs.recv.say = function(incMsg,pass){
        return new RespMsg(incMsg,{confirm:!!pass})
    }
    send.gossip = function(peer,body){
        //for propagating 'say' messages
        //we will want to send gossip in batches???
        //really is batched by peer, since we may hear things that came from other peers
        //or a message was already heard by the peer so we don't add it to their batch.
        peer.send(msgs.send.gossip(body))
    }
    msgs.send.gossip = function(body){
        return new SendMsg('gossip',body)
    }
    
    route.get = function(reqMap){//only for data requests, can be from getCell or getNode
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
            let [conn,seen] = root.assets.getState(base)
            if(conn.length){
                tasks(body)(peers)//sending to all connected peers that have this data?? Sure
            }else if(seen.length){
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
                router.send.ask(to,msgBody,{expire:(1000*30)})
            }
        }
        

        
    }
    send.get = function(peers, body ,opts){
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
                let hasRoot = val.hasRoot || (val.hasRoot = {})
                for (const id in msg.b) {
                    const incO = msg.b[id];
                    const curO = hasRoot[id] || (hasRoot[id] = incO)
                    root.resolver.resolveNode(id,curO,incO)
                }
            }else{//loop through souls, if it is gossip or the peer does not own {b} then checkSigs
                let pid = msg.from.id
                let owns = msg.from.owns
                for (const id in msg.b) {
                    let ido = snapID(id)
                    let {b} = ido
                    if(ido.is === 'gossip'){
                        let gossip = val.gossip || (val.gossip = {})
                        const incO = msg.b[id];
                        const curO = gossip[id] || (gossip[id] = incO)
                        root.resolver.resolveNode(id,curO,incO)
                    }else if(owns && owns.has(b)){
                        let fromOwner = val.fromOwner || (val.fromOwner = {})
                        const incO = msg.b[id];
                        const curO = fromOwner[id] || (fromOwner[id] = incO)
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
    recv.get= function(msg){
        let {b,from} = msg
        //TODO check permissions...
        for (const id in b) {
            const props = b[id];
            if(!props)root.store.get(id,false)
                
        }
        

    }
    /*
    All data sent/received in snap will be like:
    {soul:{
        //need to store sig on prop. Lots of overhead, but how else to do it? Only need sig for putting data on not-your-peer
        pval1: {v:value,a:timestamp,s:signature,e:expire}// optional p: persist??
    }}  
    */

    // m:msgType, s:originalMsgID, r:respondingToThisOrigID er:expectsResponse, b:body, e:expiration date to:message went/is going to
    function SendMsg(type,body,expectResponse,expire,ack,hops){
        this.m = type
        this.s = root.util.rand(12)
        if(expectResponse)this.er = expectResponse //if we expect a response, which type? (more for humans, we don't do anything with it? Could reject resp if != to)
        if(body)this.b = body
        if(expectResponse)this.e = expire ? expire : (Date.now()+(1000*30))//30 seconds as default?? should have default per msg type
        if(hops)this.h = hops*1
        if(ack)this.ack = !!ack //can ack a msg seperate from the reply, ack = acknowledge receipt
    }
    function RespMsg(incMsg,body){
        this.m = incMsg.m
        this.r = incMsg.s
        this.b = body
    }
    function TrackOpts(acks,replies,initialValue,ons){
        //onError,Done,Reply will be an array of functions that run after snapsgraphs
        let missing = [undefined,false,null]
        let self = this
        this.acks = (!missing.includes(acks)) ? acks : 0
        this.replies = (!missing.includes(replies)) ? replies : 1
        this.initialValue = initialValue
        this.onAck = isArr(ons.onAck) || []
        this.onError = isArr(ons.onError) || [(err)=>{root.opt.log(err)}]
        this.onDone = isArr(ons.onDone) || []
        this.onReply = isArr(ons.onReply) || [function(msg){this.value = msg.b}]//we should always pass one in for internal messages
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
            tracker.ee.emit('expire','MESSAGE EXPIRED: '+tracker.id,tracker)
        },(expire-Date.now()))
        tracker.ee.on('ack',function(){this.acks++},tracker)
        if(opts.onAck)opts.onAck.forEach(x=>tracker.ee.on('ack',x,tracker))
        tracker.ee.on('ack',function(){
            this.test()
        },tracker)
        tracker.ee.on('reply',function(newVal){this.replies++},tracker)
        if(opts.onReply)opts.onReply.forEach(x=>tracker.ee.on('reply',x,tracker))
        tracker.ee.on('reply',function(){
            this.test()
        },tracker)
        if(opts.onError)opts.onError.forEach(x=>tracker.ee.on('error',x,tracker))
        tracker.ee.on('error',function(){router.pending.delete(this.id)},tracker) //bail on error?
        if(opts.onDone)opts.onDone.forEach(x=>tracker.ee.on('done',x,tracker))
        tracker.ee.on('done',function(){
            router.pending.delete(this.id)
        },tracker)
        if(opts.onExpire)opts.onExpire.forEach(x=>tracker.ee.on('expire',x,tracker))
        
        tracker.sent = Date.now()
        router.pending.set(tracker.id,tracker)
        //root.opt.debug('tracking msg',tracker)

        function Tracker(msg,opts){
            opts = opts || {}
            let self = this
            this.ee = new EventEmitter()
            this.id = msg.s || msg.r
            this.acks = 0
            this.replies = 0
            this.value = opts.initialValue
            this.test = function(){
                let acksNeeded = opts.acks
                let repliesNeeded = opts.replies
                //console.log('testing',{acksNeeded,acks:self.acks,repliesNeeded,replies:self.replies})
                if(acksNeeded <= self.acks && repliesNeeded <= self.replies){
                    //console.log('msg complete',{acks:self.acks,replies:self.replies})
                    try {
                        clearTimeout(this.timer)
                    }catch(e){}
                    self.ee.emit('done',self.value)
                }
            }
        }
    }
}

function GetBatch(onFlush){
    let self = this
    this.state = true 
    this.buffer = {}
    this.cbs = {} //{[addr:[[cb,raw]]]}
    this.onFlush = onFlush
    this.done = function(){
        let b = Object.assign({},self.buffer)
        self.buffer = {}
        self.state = true
        if(self.onFlush instanceof Function)self.onFlush(b)
    }
    //only runs the following when needing network request
    this.add = function(id,cbArgs){
        if(self.state){
            self.state = false
            setTimeout(self.done,1)
        }
        if(!self.buffer[id]){
            self.buffer[id] = []
        }
        let cur = self.buffer[id] || (self.buffer[id] = [])
        cur.push(cbArgs)
    }
    
}
function GossipBatch(root){
    let self = this
    this.state = true 
    this.done = function(){
        self.state = true
        let peers = root.mesh.getNonClients()
        peers.forEach(p=>{
            if(p.gossip.size){
                root.router.send.gossip(p,[...p.gossip.entries])
                p.gossip.clear()
            }
        })
    }
    //only runs the following when needing network request
    this.add = function(sig,block,to){
        if(self.state){
            self.state = false
            setTimeout(self.done,5000)
        }
        let peers = root.mesh.getNonClients()
        peers.forEach(p=>{if(!to.includes(p.id))p.gossip.set(sig,block)})
    }
    
}