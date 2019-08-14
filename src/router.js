import { on, setValue, getValue } from "./util";
import { parentPort } from "worker_threads";
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

    router.getBufferState = false
    router.getBuffer = {}
    router.doneCBs = {} //{[addr:[[cb,raw]]]}
    router.batchedReq = function(){//direct to super peer(s??)
        let b = Object.assign({},router.getBuffer)
        router.getBuffer = {}
        router.getBufferState = true
        let dataRequests
        let gossipRequests
        for (const nodeID in b) {//sort requests
            let node = snapID(nodeID)
            const pArgs = b[nodeID];
            let to = (node.is === 'gossip') ? gossipRequests : dataRequests
            requests[nodeID] = []
            for (const p in pArgs) {
                const argArray = pArgs[p];
                router.doneCBs[node.toAddress(p)] = argArray
                to[nodeID].push(p)
            }
        }
        //see if we have resources, if not add the messages to pending and setup connection cycle
        //if so, just send the messages
    }
    router.addResouce = function(ido,node){
        //id should be ~!baseID node
        //node should be {ipAddress: validation}
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
                router.recv.ask({b:has, from:peer})//inernally chained? I guess it should work
                
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



    route.ask = function(things,body,opts){//generic ask, all requests are asks...
        //analyze each soul and figure out if we can route to it
        //if not, we need to ask where to find it, and once we have that, we connect to it and then send the request
        //will want to make sure we have authed with that peer before we send the message?
        //may need to put a listener on the peer and queue messages?
        //not everything needs an auth, but if it does, then we have to handle a long pending msg or error...
        
    }
    send.ask = function(something, somehit,opts){
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000))//breadth, short duration,message will keep getting repeated until it expires or makes it 2 hops
        let msg = new SendMsg('ask',body,false,expireReq,false,2)//hope body is formatted correctly
        msg.to = arrOfPeerObj.map(x=>x.id)
        let ons = {onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}
        track(msg,new TrackOpts(opts.acks,(opts.replies || arrOfPeerObj.length),{},ons))
        arrOfPeerObj.map(x=> (x.send && x.send(msg)))
        function onDone(b,next){//what to do with their response
            
            
            for (const id in b) {
                const obj = b[id];
                let ido = snapID(id)
                if(ido.is === 'gossip'){
                    router.recv.gossip(ido,obj,from)
                }
            }
            next()
        }
    }
    recv.ask = function(msg){
        let {b,from} = msg
        

    }
    recv.gossip = function(idObj,node,fromPeer){
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

