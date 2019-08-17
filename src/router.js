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
    const batch = router.batch = {}
    batch.getCell = new GetBatch(sendCellReq)
    batch.getNode = new GetBatch(sendNodeReq)
    function sendCellReq(b){//direct to super peer(s??)
        let dataRequests = new Map()
        let gossipRequests = new Map()
        for (const addr in b) {//sort requests
            let node = snapID(addr),nodeID = node.toNodeID(), p = node.p,temp
            const argArray = b[addr];
            let to = (node.is === 'node') ? dataRequests : gossipRequests
            if(!(temp = to.get(nodeID)))temp=to.set(nodeID,[]).get(nodeID)
            root.memStore.addAskCB(nodeID,p,argArray)
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
            root.memStore.addAskCB(nodeID,false,cbArr)
        }
        if(gossipRequests.size)router.route.askGossip(gossipRequests)
        if(dataRequests.size)router.route.ask(dataRequests)
        //see if we have resources, if not add the messages to pending and setup connection cycle
        //if so, just send the messages
    }
    
    send.intro = function(peer,opts){//sender generates
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000*20))//shouldn't take too long
        let b = {isPeer:root.isPeer}
        let msg = new SendMsg('intro',b,['isPeer','has'],expireReq)
        let ons = {onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}
        track(msg,new TrackOpts(opts.acks,opts.replies,{},ons))
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
                let things = Object.keys(has)
                //emulating an ask response
                for (const id of things) {
                    root.memStore.addAskCB(id,false,[(node)=>{root.assets.processResourceNode(id,node)}])
                    root.assets.subResource(id)
                }
                root.resolver.resolveAsk({checkSigs:has})//emulate an ask response
            }
            next()
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
            //but this is good, as it gives the peer backups in case we go offline
            //the peerer will validate all these records so this peer can't tamper with it.

        }
        peer.send(m)
        root.mesh.shuffle()
    }
    send.challenge = function(peer,opts){//sender generates
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000*60*60*8))//must auth within 8 hrs??? Should only be browsers that will be waiting on human 
        let b = {challenge:0}
        let msg = new SendMsg('challenge',b,['auth','pub'],expireReq)
        msg.b.challenge = msg.s //challenge is signing this msgID, that way the know where to respond
        let ons = {onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}
        track(msg,new TrackOpts(opts.acks,opts.replies,{},ons))
        peer.challenge = msg.s
        if(!peer.met)peer.met = Date.now()
        root.opt.debug('sending challenge',msg)
        peer.send(msg)
        function onDone(value,next){//what to do with their response
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
                            root.memStore.addAskCB(id,false,[(node)=>{root.assets.processPeerOwnershipNode(id,node)}])
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
        reqMap.forEach(function(v,k){
            body[k] = v
        })
        let peers = [...root.mesh.peers.values()].filter(x=> (x.connected && x.isPeer)).sort((a,b)=>a.ping-b.ping)
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
    recv.ask = function(msg){
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

function GetBatch(onFlush){
    let self = this
    this.state = true //only for getCell calls
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