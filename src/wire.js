import {encode,decode, buffUtil} from './util'
import pako from 'pako'
export function Msg(replying,type,msgID,body,expire){
    let msg = this
    this.replying = !!replying
    if(replying && !msgID)throw new Error('Must provide a msgID to reply to')
    setType()
    this.id = buffUtil((msgID || root.aegis.random(16)))
    this.idStr = this.id.utilString()
    this.body = body || null
    this.expire = expire !== undefined ? expire : Date.now()+30000 //30 second default?
    this.transform = function(){return [this.replying?true:false,this.tid,id,body,expire]}
    function setType(){
        let types = {//these are the wire message types
            peerChallenge:  0,
            redirect:   2,
            ping:       4,
            routingInfo: 8,
            getPeer:    12,
            putPeer:    13,
            getWKN:     16,
            putWKN:     17,
            getStmt:    20,
            putStmt:    21,

            create:     32,
            update:     34,
            read:       36,
            delete:     38,
            query:      40,
            updated:    42,
            created:    44,
            file:       64,
            chunk:      72,
            rpc:        96,
            
        }
        let select = Object.entries(types).filter((value)=>{value.includes(type)}).shift()
        if(!select)throw new Error('Invalid message type given')
        msg.type = select[0]
        msg.tid = select[1]
    }
}
export const onMsg = (root) => (raw,peer)=>{
    if(!raw){ return }
    let msg
    try {
        raw = Buffer.from(raw,raw.byteOffset,raw.length)
        let payload = raw.slice(1)
        msg = decode(raw[0]?pako.inflate(payload):payload)
        let expire = msg.pop()
        if(expire && (peer.drift+expire+100) <= Date.now()){
            root.opt.debug('Message expired, ignoring:',msg)
            return
        }
        msg.from = peer
        root.event.emit('in',msg); //start of the in chain
    } catch (error) {
        root.opt.debug('wire.onMsg Error: ',error)
    }
}
const send = (msg,level)=>{
    let peer = this
    if(peer.connected && peer.wire.send instanceof Function){
        if(!(msg instanceof Msg))throw new Error('Must provide a "wire Msg" to send.')
        let out = Date.now()
        let enc = encode(msg.transform())
        let beforePack = enc.length
        let payload = enc
        let bytes = payload.length
        if(level){
            let packed = pako.deflate(enc,{level})
            if(packed.length < beforePack) payload = packed //see if compression helped
        }
        let raw = Buffer.concat([Buffer.from([beforePack==payload.length?0:1]),payload],payload.length+1)
        if(msg.type !== 'ping')root.opt.debug('sent',msg,raw[0]?`beforePack bytes:${beforePack} AfterPack bytes:${payload.length}`:`Bytes: ${payload.length}`)
        peer.wire.send(raw);
        if(!msg.replying){
            this.ourBytes += bytes
            root.event.once(msg.idStr,(msg)=>{peer.responseTime += (out-msg.in)});
        }else{
            this.theirBytes += bytes
        }
        return true
    }
}
const recv = (raw)=>{
    if(!raw){ return }
    let msg,peer = this
    try {
        raw = Buffer.from(raw,raw.byteOffset,raw.length)
        let payload = raw.slice(1)
        payload = raw[0]?pako.inflate(payload):payload
        let bytes = payload.length
        msg = new Msg(...decode(payload))
        let now = Date.now()
        if(msg.expire && (this.drift+msg.expire+100) <= now){
            root.opt.debug('Message expired, ignoring:',msg)
            return
        }
        msg.from = peer
        msg.in = now
        //msg = [req/res,msgType,msgID,payload,expire]
        if(msg.type !== 'ping')root.opt.debug('on.in',msg)
        if(msg.replying){
            this.ourBytes += bytes
            root.event.emit(msg.idStr,msg);
        }else{
            if(root.state.seen.has(msg.idStr)){
                root.opt.debug('Ignoring Request, msgID seen before!')
                return
            }
            this.theirBytes += bytes
            switch (msg.tid) {//on type
                case 0: root.router.recv.challenge(msg);break
                case 4: root.router.recv.ping(msg);break
                case 8: root.router.recv.routingInfo(msg);break //could be updates on what would be our 2nd hop peers
                case 12: root.router.recv.getPeer(msg);break
                case 13: root.router.recv.putPeer(msg);break
                case 16: root.router.recv.getWKN(msg);break
                case 17: root.router.recv.putWKN(msg);break
                case 20: root.router.recv.getStmt(msg);break
                case 21: root.router.recv.putStmt(msg);break
                
    
                case 32://create
                case 34://update
                case 36://read
                case 38://delete
                case 40: root.sg.crudq(msg);break //query
    
                case 42: root.event.emit('change',msg);break//updated(state change, like a put to propagate changed values, *this is a subscription update or 'created'*)
            }
        }
    } catch (error) {
        root.opt.debug('wire.onMsg Error: ',error)
    }
}
export function Peer(root,proof,ip,restore){
    opt = opt || {}
    restore = restore || []
    let self = this
    this.wire = socket
    this.proof = proof || null
    this.address = ip || (proof && proof[6]) || null
    this.id = (proof && buffUtil(proof[0])) || null
    let where = (root.peer.isPeer && root.peer.id) || root.state.anchor
    this.dist = restore[0] || (this.id && where) ? root.aeon.distance(where,this.id) : Infinity
    this.ping = 1000
    this.drift = 0
    this.diffHit = restore[1] || 0
    this.work = restore[2] || 0
    this.connectedTo = new Map()//pid,dist for non-mutually connected peers
    this.challenge = false //our challenge to them for proof, proving their CID
    this.theirChallenge = false //they are challenging us, if we are not signed in yet, it waits here for our response
    this.verified = false //this is if their proof passes AND they signed our challenge
    this.connected = false //all peers are in the same list now...
    this.isPeer = !!(proof && proof[2]) //server or browser
    this.hasRoot = false //we are exchanging information with 100% trust, we own both connections (according to sigs + gossip)
    this.owns = new Set()//set of baseID's that this IP Owner === BaseIDOwners.includes(IP Owner) //PROBABLY DONT NEED
    this.pendingMsgs = []//for handling things that are waiting for a state change? //PROBABLY DONT NEED
    this.weConnected = 0 //? Need to know if we can disconnect to prune (people that make connections to us must stay) this is updated every time we connected to them
    this.owner = (proof && proof[7])
    this.ownerVerified = false
    this.queue = new Map()
    this.qPend = false
    this.ourBytes = restore[3] || 0 //total req/res bytes caused by our requests
    this.theirBytes = restore[4] || 0 //total req/res bytes caused by their requests
    this.responseTime = restore[5] || 0 //how long did it take for ALL response for OUR requests from them 
    this.speed = (this.ourBytes && this.responseTime) ? this.ourBytes/this.responseTime : 0 //(ourBytes/resonseTime = bytes/ms) THIS WILL PROBABLY BE ONE OF THE MAIN PRUNE FACTORS
    this.connects = 0 //times WE connected to them. Not really used?
    this.disconnects = restore[6] || 0 //should be number of times THEY disconnected on us. How reliable is this peer THIS WILL PROBABLY BE ONE OF THE MAIN PRUNE FACTORS
    this.send = send
    this.recv = recv
    this.saw = restore[7] || null //only set when WE first see the proof, this tells us the age of the peer in our cache
    this.bucket = restore[8] || null
    this.addProof = async function(proof,work){
        work = work || await root.aeon.verifyPID(...proof)
        if(work){
            self.diffHit = work.diffHit
            self.work = 1/work.chance
        }else return false
        self.id = proof[0]
        self.address = proof[6]
        let where = (root.peer.isPeer && root.peer.id) || root.state.anchor
        self.dist = (self.id && where) ? root.aeon.distance(where,this.id) : Infinity
        self.isPeer = !!proof[2]
        self.owner= proof[7]
        self.proof = proof
        return true
    }
    this.transform = function(){//pack it for disk
        return [
            this.proof,
            this.dist || null,
            this.diffHit || null,
            this.work || null,
            this.ourBytes || null,
            this.theirBytes || null,
            this.responseTime || null,
            this.disconnects || null,
            this.saw || null,
            this.bucket || null
        ]
    }
    this.score = function(lastBucket){

    }


    this.queueState = function(proof,connState){
        let pid = Buffer.from(pid).toString('binary')
        let inq = self.queue.get(pid)
        if(!inq || inq[0][7] < proof[7] || inq[1] !== connState){//new/updated
            self.queue.set(pid,[proof,connState])
            if(!self.qPend){
                self.qPend = true
                setTimeout(root.router.send.peerState,30000,self,self.queue)//30 seconds? maybe longer?
            }
        }
    }
    this.sameProof = function(incoming){
        //check the date? or check all of it? or just the sigs?
        //just the state sig, that should tell us if the other fields have changed
        return !Buffer.compare(buffUtil(this.proof && this.proof[4]),buffUtil(incoming[4]))
    }
    this.disconnect = function(){//if we disconnect, we want to cancel their disconnects counter increment
        self.disconnects--
        close()
    }
    this.onclose = function(){//this is when they break connection
        self.disconnects++
        close()
    }
    function close(){
        if(self.peer.wire && self.peer.wire.close)self.peer.wire.close()
        self.connected = false
        self.weConnected = false
        self.verified = false
    }
}