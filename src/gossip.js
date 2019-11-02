import { encode, decode, BitID, buffToUint, uintToBuff, MemoStore } from './util';
import EventEmitter from 'eventemitter3';

export default function Gossip(root){
    //this will be the inbetween of the crypto and outer APIs
    //this is where identity things will happen
    //anything to do with the user chain, authorizing the snap instance
    //such as adding to the curr
    const gossip = this
    gossip.peers = new Map()
    gossip.stmtStore = new Map() //key is Stmt.id, value is stmt object
    gossip.people = new Map() //key is person.id, value is person
    gossip.hashStore = new Map() //key is BitID(stmt.hash), value is Set(stmt's)
    ;(async function(){
        gossip.nullHash = Buffer.from(await root.aegis.hash(Buffer.alloc(0)))
        gossip.nullStmt = {rootHash:Buffer.from(await root.aegis.hash(Buffer.concat([nullHash,nullHash])))}
    })()
    gossip.Peer = function(ip,restore){
        //can be created 5 ways:
        //1- we give a string IP address (this is only for the initially specified peers from the FIRST instantiation)
        //2- we hear about a peer proof (both ip and restore are undefined, this is a routing table message)
        //3- we get a peer proof from connecting (same as #2, but direct from source instead of gossip)
        //4- we hear a statement that lists this peer ID as owned by that identity
        //5- we restore the peer from disk, (skip verifying, just recreate last known state)
        restore = restore || []
        let peer = this
        const add = new EventEmitter()
        peer.set = add.emit
        add.on('set',async function(keys){
            keys = Array.isArray(keys)?keys:[keys]
            for (const key of keys) {
                if(['cid','ts'].includes(key) && s.cid && s.ts && !s.id){
                    s.set('id',true)
                }
                if(['body','st'].includes(key) && s.body && s.st){
                    gossip.verifyStmtBody(s.st,s.body)
                    if(![2,4].includes(s.st))s.set('hash',false)
                }
                if(['cid','ts','hash'].includes(key) && s.cid && s.ts && s.pHash){
                    s.set('proof',workTarget)
                }
                if(key === 'proof'){
                    s.set('pub',root.user.pub)
                }
                if(key === 'verified'){
                    //not sure. Maybe this would be where we update the person's tail
                    //add this to some merkle proof for syncronization?
                    s.person.tail = s
                }
                if(key === 'sig'){
                    s.set('header',true)
                }
            }
            if(!s.sig && s.cid && s.ts && (s.st !== undefined) && (s.pub !== undefined) && s.proof && s.pHash){
                s.set('sig',true)
            }
            if(s.sig && !Object.isSealed(s))Object.seal(s)//seal object once we add the sig (for stmt creation)
            
        })
        add.on('proof',function(){
            //proof changed
            Object.defineProperty(s,'verified',{value:true})
            add.emit('set',['verified'])
        })
        





        peer.wire = null
        peer.proof = null
        peer.address = ip || null
        peer.id = null
        peer.peerDist = restore[0] || Infinity
        peer.ping = 1000
        peer.drift = 0
        peer.diffHit = restore[1] || 0
        peer.work = restore[2] || 0
        peer.connectedTo = new Map()//pid,dist for non-mutually connected peers
        peer.verified = false //peer is if their proof passes AND they signed our challenge
        peer.connected = false //all peers are in the same list now...
        peer.isPeer = false //server or browser
        Object.defineProperty(peer,'hasRoot',{get(){
            if(!peer.owner)return false
            if(!root.peer.owner)return false
            return root.peer.owner.online.has(peer) && peer.owner.id === root.peer.owner.id
        }}) //we are exchanging information with 100% trust, we own both connections (according to sigs + gossip)
        peer.owns = new Set()//set of baseID's that peer IP Owner === BaseIDOwners.includes(IP Owner) //PROBABLY DONT NEED
        peer.pendingMsgs = []//for handling things that are waiting for a state change? //PROBABLY DONT NEED
        peer.weConnected = 0 //? Need to know if we can disconnect to prune (people that make connections to us must stay) this is updated every time we connected to them
        peer.owner = false //this should be a 'Person' object, if isPeer: comes from proof, else onAuth ('brower' peer) cid for whoever signing keys
        Object.defineProperty(peer,'ownerVerified',{get(){
            if(!peer.owner)return false
            return peer.owner.peers.has(peer)
        }})
        peer.queue = new Map()
        peer.qPend = false
        peer.ourBytes = restore[3] || 0 //total req/res bytes caused by our requests
        peer.theirBytes = restore[4] || 0 //total req/res bytes caused by their requests
        peer.responseTime = restore[5] || 0 //how long did it take for ALL response for OUR requests from them 
        peer.speed = (peer.ourBytes && peer.responseTime) ? peer.ourBytes/peer.responseTime : 0 //(ourBytes/resonseTime = bytes/ms) THIS WILL PROBABLY BE ONE OF THE MAIN PRUNE FACTORS
        peer.connects = 0 //times WE connected to them. Not really used?
        peer.disconnects = restore[6] || 0 //should be number of times THEY disconnected on us. How reliable is this peer THIS WILL PROBABLY BE ONE OF THE MAIN PRUNE FACTORS
        peer.saw = restore[7] || null //only set when WE first see the proof, this tells us the age of the peer in our cache
        peer.bucket = restore[8] || null
        peer.lastConnected = restore[9] || false //if they are one of our closest few and we have not seen them in 3? months, then we can prune them?
        peer.connect = function(){
            let wait = 2 * 1000;
            let doc = 'undefined' !== typeof document && document;
            let ipAddr = peer.address
            if(!ipAddr)return
            let url = ipAddr.replace('http', 'ws');
            let wire
            try {
                wire = new root.WebSocket(url);
                peer.wire = wire
                peer.weConnected = Date.now()
                peer.connects++
                if(!root.peer.isPeer)peer.wire.binaryType = 'arraybuffer'
            } catch (error) {
                root.opt.debug('Connect Error',error)
                return
            }
            
            wire.onclose = function(){//if whoever we are connecting to closes
                root.opt.debug('connection lost to peer: ',peer.id)
                peer.onclose()
                root.event.emit('peerDisconnect',peer)
                reconnect(peer);
            };
            wire.onerror = function(error){
                root.opt.debug('wire.onerror',error)
                reconnect(peer);
            };
            wire.onopen = function(){
                peer.connected = true
                root.router.send.ping(peer)
                root.router.send.peerChallenge(peer)
            }
            wire.onmessage = function(raw){
                peer.recv((raw.data || raw),peer)
            };
            return wire
            function reconnect(peer){//move reconnect in to Peer object?
                if(root.peer.isPeer)return
                root.opt.debug('attempting reconnect')
                clearTimeout(peer.defer);
                if(doc && peer.retry <= 0){ return } 
                peer.retry = (peer.retry || opt.retry || 60) - 1;
                peer.defer = setTimeout(function to(){
                    if(doc && doc.hidden){ return setTimeout(to,wait) }
                    mesh.connect(peer.id);
                }, wait);
            }
        }
        peer.send = function(msg,level){
            if(peer.connected && peer.wire.send instanceof Function){
                if(!(msg instanceof Msg))throw new Error('Must provide a "wire Msg" to send.')
                let enc = encode(msg.transform())
                let beforePack = enc.length
                let payload = enc
                let bytes = payload.length
                if(level){//need to add encryption option as well? No, that is within specific msg types themselves
                    let packed = pako.deflate(enc,{level})
                    if(packed.length < beforePack) payload = packed //see if compression helped
                }
                let raw = Buffer.concat([Buffer.from([beforePack==payload.length?0:1]),payload],payload.length+1)
                if(msg.type !== 'ping')root.opt.debug('sent',msg,raw[0]?`beforePack bytes:${beforePack} AfterPack bytes:${payload.length}`:`Bytes: ${payload.length}`)
                peer.wire.send(raw);
                if(!msg.replying){
                    let out = Date.now()
                    peer.ourBytes += bytes
                    root.event.once(msg.idStr,(msg)=>{peer.responseTime += (out-msg.in)});
                }else{
                    peer.theirBytes += bytes
                }
                return true
            }
        }
        peer.recv = function(raw){
            if(!raw){ return }
            let msg
            
            try {
                raw = Buffer.from(raw,raw.byteOffset,raw.length)
                let payload = raw.slice(1)
                payload = raw[0]?pako.inflate(payload):payload
                let bytes = payload.length
                msg = new Msg(...decode(payload))
                let now = Date.now()
                if(!msg.expire)msg.expire = now + 20000 //enforce a limit on messages even if it wasn't specified
                else msg.expire = peer.drift+msg.expire//correct the time to match our clock
                if(msg.expire +100 <= now){
                    root.opt.debug('Message expired, ignoring:',msg)
                    return
                }else if(msg.expire - now > 30000)
                msg.from = peer
                msg.in = now
                //msg = [req/res,msgType,msgID,payload,expire]
                if(msg.type !== 'ping')root.opt.debug('on.in',msg)
                if(msg.replying){
                    peer.ourBytes += bytes
                    root.event.emit(msg.id.string,msg);
                }else{
                    if(root.state.seen.has(msg.id.string)){
                        root.opt.debug('Ignoring Request, msgID seen before!')
                        return
                    }
                    root.state.seen.add(msg.id.string)
                    setTimeout(()=>{root.state.seen.delete(msg.id.string)},msg.expire-now)
                    peer.theirBytes += bytes
                    switch (msg.tid) {//on type
                        case 0: root.router.recv.peerChallenge(msg);break
                        case 1: root.router.recv.authChallenge(msg);break
                        case 2: root.router.recv.redirect(msg);break
                        case 4: root.router.recv.ping(msg);break
                        case 8: root.router.recv.routingInfo(msg);break //could be updates on what would be our 2nd hop peers
                        case 12: root.router.recv.getPeer(msg);break
                        case 13: root.router.recv.putPeer(msg);break
                        case 16: root.router.recv.getWKN(msg);break
                        case 18: root.router.recv.getRL(msg);break
                        case 20: root.router.recv.ask(msg);break
                        case 21: root.router.recv.say(msg);break
                        
            
                        case 32://create
                        case 34://update
                        case 36://read
                        case 38://delete
                        case 40: root.sg.crudq(msg);break //query
            
                        case 42: root.event.emit('change',msg);break//updated(state change, like a put to propagate changed values, *peer is a subscription update or 'created'*)
                    }
                }
            } catch (error) {
                root.opt.debug('wire.onMsg Error: ',error)
            }
        }
        peer.init = async function(proof,work){
            peer.id = proof.pid
            let check = gossip.peers.get(peer.id)
            if(check && check.sameProof(proof))return check
            else if (check && await check.updateProof(proof))return check
            peer.isPeer = !!proof.pubSig
            if(!peer.isPeer)return true
            peer.isRoutable = !!proof.address
            work = work || await root.monarch.verifyPID(proof)
            if(work){
                peer.diffHit = work.diffHit
                peer.work = 1/work.chance
            }else return false
            peer.address = proof.address
            if(root.peer.isPeer && root.peer.id){
                peer.peerDist = root.monarch.distance(root.peer.id,peer.id)
            }
            if(root.user.id){
                peer.chainDist = root.monarch.distance(root.user.id,peer.id)
            }
            peer.owner = (proof.owner)?new gossip.Person(proof.owner):null
            if(peer.connected && peer.owner && !peer.ownerVerified)root.gossip.verifyPeerOwner(peer)
            peer.proof = proof
            return true
        }
        peer.updateProof = async function(proof,work){
            if(peer.sameProof(proof))return false
            peer.id = proof.pid
            peer.isPeer = !!proof.pubSig
            if(!peer.isPeer)return true
            peer.isRoutable = !!proof.address
            work = work || await root.monarch.verifyPID(proof)
            if(work){
                peer.diffHit = work.diffHit
                peer.work = 1/work.chance
            }else return false
            peer.address = proof.address
            if(root.peer.isPeer && root.peer.id){
                peer.peerDist = root.monarch.distance(root.peer.id,peer.id)
            }
            if(root.user.id){
                peer.chainDist = root.monarch.distance(root.user.id,peer.id)
            }
            peer.owner = (proof.owner)?new gossip.Person(proof.owner):null
            if(peer.connected && peer.owner && !peer.ownerVerified)root.gossip.verifyPeerOwner(peer)
            peer.proof = proof
            return true
        }
        peer.transform = function(){//pack it for disk
            return [
                peer.proof,
                peer.peerDist || null,
                peer.diffHit || null,
                peer.work || null,
                peer.ourBytes || null,
                peer.theirBytes || null,
                peer.responseTime || null,
                peer.disconnects || null,
                peer.saw || null,
                peer.bucket || null
            ]
        }
        peer.score = function(){
    
        }
    
    
        peer.queueState = function(proof,connState){
            let pid = Buffer.from(pid).toString('binary')
            let inq = peer.queue.get(pid)
            if(!inq || inq[0][7] < proof[7] || inq[1] !== connState){//new/updated
                peer.queue.set(pid,[proof,connState])
                if(!peer.qPend){
                    peer.qPend = true
                    setTimeout(root.router.send.peerState,30000,peer,peer.queue)//30 seconds? maybe longer?
                }
            }
        }
        peer.sameProof = function(incoming){
            //must match byte for byte
            if(!peer.proof)return false
            return Buffer.compare(encode(peer.proof),encode(incoming)) === 0
        }
        peer.disconnect = function(){//if we disconnect, we want to cancel their disconnects counter increment
            peer.disconnects--
            close()
        }
        peer.onclose = function(){//this is when they break connection
            peer.disconnects++
            close()
        }
        function close(){
            if(peer.wire && peer.wire.close)peer.wire.close()
            peer.connected = false
            peer.weConnected = false
            peer.verified = false
        }
        
    }
    gossip.ThisPeer = function(){

    }
    gossip.Msg = function(replying,type,msgID,body,expire){
        let msg = this
        this.replying = !!replying
        if(replying && !msgID)throw new Error('Must provide a msgID to reply to')
        setType()
        this.id = BitID((msgID || root.aegis.random(16)))
        this.body = body || null
        this.expire = expire !== undefined ? expire : Date.now()+30000 //30 second default?
        this.transform = function(){return [this.replying,this.tid,id.buffer,body,expire]}
        //need to add something for an onion like routed encrypted message
        //? Maybe that is the next layer down with the encoding/compressing?
        function setType(){
            let types = [//these are the wire message types
                ['peerChallenge',0],
                ['signChallenge',1]
                ['redirect',   2],
                ['ping',       4],
                ['routingInfo', 8],
                ['getPeer',    12],
                ['putPeer',    13],
                ['getWKN',     16],
                ['getRL',     18],
                ['getStmt',    20],
                ['say',    21],
    
                
    
    
                ['create',     32],
                ['update',     34],
                ['read',       36],
                ['delete',     38],
                ['query',      40],
                ['updated',    42],
                ['created',    44],
                ['file',       64],
                ['chunk',      72],
                ['rpc',        96],
                
            ]
            let select = types.filter((value)=>{return value.includes(type)})[0]
            if(!select)throw new Error('Invalid message type given')
            msg.type = select[0]
            msg.tid = select[1]
        }
    }
    gossip.getStmtType = function(val){
        let types = [//these are the statement types and alias
            ['retract',     0],
            ['genesis',     1],
            ['remoteLogin', 2],
            ['wkn',         4],
            ['addKey',      8],
            ['removeKey',   9],
            ['addPeer',    12],
            ['removePeer', 13],

            ['post',       18], //attest some sort of text string
            ['comment',    20], //same as reply? comment is more of an indirect statement? Both comment and reply feel like a post that has an @ or #
            ['reply',      21], //same as comment? directly replying to another message?
            ['upvote',     32], //signal a +1 for whatever msg header is listed
            ['downvote',   34], //signal a -1 for whatever msg header is listed
            
            // ['read',       36],
            // ['delete',     38],
            // ['query',      40],
            // ['updated',    42],
            // ['created',    44],
            // ['file',       64],
            // ['chunk',      72],
            // ['rpc',        96],
            
        ]
        let select = types.filter((value)=>{value.includes(val)}).shift()
        if(!select)throw new Error('Invalid message type given')
        return select
    }
    gossip.verifyStmtBody = function(st,body){//TODO, FIGURE OUT BODY REQUIREMENTS
        if(body === undefined || !(body instanceof Uint8Array))throw new Error('Body must be `null` or a Buffer')
        if(body === null)return true
        switch (st) {
            case 0:{
                if(body.length !== 32)throw new Error('Must provide the root hash for the statement you are retracting')
                break
            }
            case 1:{
                if(body.length !== 65)throw new Error('Must provide 65 Bytes for your first public key')
                break
            }
            case 2:{
                if(!body instanceof Uint8Array)throw new Error('Must provide a Buffer of encrypted Bytes')
                break
            }
            case 4:{
                if(body !== null)throw new Error('Cannot provide the wkn plaintext in the message. Only valid using null')
                break
            }
            case 8:{
                if(!Array.isArray(body) || body.length !== 3)throw new Error('Must provide an array of 3 arguments')
                if(!body[0] instanceof Uint8Array || body[0].length !== 65)throw new Error('Must provide 65 Bytes public key as element[0] in array')
                if(!['>','<'].includes(body[1]))throw new Error('Must state the relative key rank as ">" or "<" as element[1] in the array.')
                if(isNaN(s.body[2]) || (body[2] > (2**16)-1 || body[2] < 0))
                break
            }
            case 9:{
                if(isNaN(body) || (body > (2**16)-1 || body < 0))throw new Error('Must be a valid 2 byte number')
                break
            }
            case 12:
            case 13:{
                if((body instanceof Uint8Array && body.length !== 32))throw new Error('Must provide 32 Bytes to specify which Peer ID')
                break
            }
        }
        return true
    }
    gossip.Stmt = function(tree,opt){//merkle sub tree
        //there are 3 places a stmt can come from:
        //1- We hear it on the wire, this will be the most common, just need to verify and decide what to do with it
        //2- We are restoring it from disc, we should be restoring a whole chain at a time, so this should be same logic as #1
        //3- This instance is crafting a new stmt. This is the most complex (all the events). Must broadcast to all connected peers when complete

        //if given header this is an 'incoming' stmt, must attempt to put it with a person, and verify it (if we are not restoring it)
        //else we are creating a new statement, and need to use the stmt.set(key,value) method
        //stmt 2 we need to set cid,st,hash,body
        //stmt 4 we need to set cid,st,hash
        //everything else set cid,st,body
        const {workTarget,restoring} = opt || {}
        const noop = (val)=>{return val}
        const HEADER_ORDER = new Map([
            ['sig',64,noop,noop],
            ['rootHash',32,noop,noop],
            ['hHash',32,noop,noop],
            ['pHash',32,noop,noop],
            ['cid',32,BitID,(cid)=>{cid.buffer},true]
            ['ts',6,buffToUint,(ts)=>{uintToBuff(ts,6)},true],
            ['st',2,buffToUint,(st)=>{uintToBuff(st,2)},true],
            ['pub',2,buffToUint,(pub)=>{uintToBuff(pub,2)},true],
            ['proof',16,noop,noop,true],
            ['body',Infinity,noop,noop]
        ])
        const stateMasks = {

        }
        let s = this
        const add = new EventEmitter()
        s.set = add.emit
        add.on('set',async function(keys){
            keys = Array.isArray(keys)?keys:[keys]
            for (const key of keys) {
                if(['cid','ts'].includes(key) && s.cid && s.ts && !s.id){
                    s.set('id')
                }
                if(['body','st'].includes(key) && s.body && s.st){
                    gossip.verifyStmtBody(s.st,s.body)
                    s.set('pHash')
                }
                if(['cid','ts','pHash'].includes(key) && s.cid && s.ts && s.pHash){
                    s.set('proof',workTarget)
                }
                if(key === 'proof'){
                    s.set('pub',root.user.pub)
                }
                if(['cid','ts','st','pub','proof'].includes(key) && s.cid && s.ts && s.st && s.pub && s.proof){
                    s.set('header')
                }
                if(key === 'header'){
                    s.set('hHash')
                }
                if(['pHash','hHash'].includes(key) && s.pHash && s.hHash){
                    s.set('sig')
                }
                if(key === 'verified'){
                    //not sure. Maybe this would be where we update the person's tail
                    //add this to some merkle proof for syncronization?
                    s.person.tail = s
                }
                if(key === 'sig'){
                    s.set('header')
                }
                
            }
            if(!s.sig && s.cid && s.ts && (s.st !== undefined) && (s.pub !== undefined) && s.proof && s.pHash){
                s.set('sig',true)
            }
            if(s.sig && !Object.isSealed(s))Object.seal(s)//seal object once we add the sig (for stmt creation)
            
        })
        add.once('verified',function(){
            Object.defineProperty(s,'verified',{value:true})
            add.emit('set',['verified'])
        })
        add.once('prev',function(prevStmt){
            Object.defineProperty(s,'prev',{value:prevStmt})
            add.emit('set',['prev'])
        })
        add.once('next',function(nextStmt){
            Object.defineProperty(s,'next',{value:nextStmt})
            add.emit('set',['next'])
        })
        Object.defineProperties(s,{
            'diffHit':{writable:true},
            'work':{writable:true},
            'prev':{writable:true},
            'next':{writable:true},
            'verified':{writable:true}
        })
        s.verify = async function(merkleRoot){
            try {
                let curMR = s.person.merkleRoot
                let pubKey = s.person.pubs.get(s.pub) || (s.st === 1) ? s.body : false
                merkleRoot = merkleRoot || curMR ||  (s.st === 1) ? gossip.nullHash : false
                if(s.verified)return
                if(!pubKey){throw new Error('Cannot verify stmt w/o the pubKey referenced')}
                if(!s.rootHash){throw new Error('Must the root hash already calculated')}
                if(!merkleRoot || (merkleRoot && !(merkleRoot instanceof Uint8Array && merkleRoot.length === 32)))throw new Error('Must provide the current merkle root to sign')
                if(await root.verify(pubKey,s.sig,Buffer.from([...merkleRoot,...s.rootHash]))){
                    s.set('verified',true)
                    return true
                }else{
                    throw new Error('Signature invalid')
                }
            } catch (error) {
                root.opt.debug('Stmt not verified: ',error)
                return false
            }
            
        }
        s.integrityCheck = async function(){
            try {
                let diffHit,chance
                if(!(s.cid && s.ts && s.proof && s.pHash))throw new Error('Stmt must have a cid, ts, proof, and payload hash to check integrity')
                if(s.st == 1){//verify cid if it is a genesis block
                    let match = await root.monarch.verifyCID(s.cid,s.proof,s.pHash)
                    if(match && match.diffHit >= 16){
                        s.person.proof = s
                        diffHit = match.diffHit
                        chance = match.chance
                    }
                    else {
                        s.person.proof = false
                        throw new Error('CID failed to verify in the genesis block')
                    }
                }
                if(![2,4].includes(s.st) && s.body){//verify body if it exists
                    let h = await root.aegis.hash(s.body)
                    if(Buffer.compare(h,s.pHash) !== 0){
                        s.verified = false
                        throw new Error('Payload hash mismatch')
                    }
                }
                let h = await root.aegis.hash(s.header)
                if(Buffer.compare(h,s.hHash) !== 0){
                    s.verified = false
                    throw new Error('Header hash mismatch')
                }
                if(diffHit === undefined){
                    let pt = Buffer.from([...s.cid.buffer,...uintToBuff(s.ts,6),...s.pHash])
                    let work = await root.monarch.checkPow(pt,{all:true,isHash:true})
                    diffHit = work.diffHit
                    chance = work.chance
                }
                
                Object.defineProperties(s,{
                    'diffHit':{value:diffHit},
                    'work':{value:1/chance}
                })
                Object.seal(s)
                s.person.addStmt(s)
                return true
            } catch (error) {
                root.opt.debug('Stmt integrity check failed:',error)
                return false
            }
            
        }
        if(tree){//set manually
            //check stmt store to see if we have seen this. If we have don't rebroadcast
            try {
                let start = 0
                s.header = []
                for (const [key,len,bytesToVal,valToBytes,partOfHeader] of HEADER_ORDER) {
                    let hBits = (header.slice(start,start+len))
                    if(partOfHeader)s.header = s.header.concat(hBits)
                    if(key === 'st')setType(bytesToVal(hBits))
                    else Object.defineProperty(s,key,{value:bytesToVal(hBits)})
                    start = start+len
                }
                s.header = Buffer.from(s.header)
                let stmt = gossip.stmtStore.get(makeID(s.cid,s.ts))
                if(stmt)throw new Error('Already seen this statement')
                attachToPerson(s.cid)
                if(!restoring && s.body && s.body.length){
                    gossip.verifyStmtBody(s.st,s.body)// what will the payloads look like for all msg types? Only check core protocol msgs
                }
                gossip.stmtStore.set(s.id,s)
                return s //what this returns to, will decide what needs to happen with it? (rebroadcast? )
            } catch (error) {
                root.opt.log('Dropping Statement:',error)
                return {drop:true}
            }
        }
        //these only run if there is no header
        add.once('body',function(body){
            Object.defineProperty(s,'body',{value:body})
            add.emit('set',['body'])
        })
        add.once('cid',function(cid){
            attachToPerson(cid)
            add.emit('set',['cid','person'])
        })
        add.once('ts',function(ts){
            if(isNaN(ts))throw new Error('ts must be a unix ms timestamp')
            Object.defineProperty(s,'ts',{value:ts})
            add.emit('set',['ts'])
        })
        add.once('id',function(){
            makeID(s.cid,s.ts)
            add.emit('set',['id'])
        })
        add.once('st',function(){
            setType(val)
            add.emit('set',['st'])
        })
        add.once('pHash',async function(hash){
            const hash = hash || await root.aegis.hash(s.body)//for all standard msgs 
            Object.defineProperty(s,'pHash',{value:hash})
            add.emit('set',['pHash'])
        })
        add.once('proof',async function(work){
            work = work || 14
            if(s.proof)return
            if(!s.pHash)throw new Error('Must provide a Buffer of the hash for Stmt types 2 & 4')
            if(!s.ts)s.set('ts',Date.now())//would normally trigger this fn again, but we are using once
            let pt = Buffer.from([...s.cid.buffer,...uintToBuff(s.ts,6),...s.pHash])//must do more than the hash, to ensure work can't be reused
            let proof = await gossip.pow(pt,{isHash:true,target:work})
            Object.defineProperty(s,'proof',{value:proof})
            add.emit('set',['proof'])
        })
        add.once('pub',function(pubNum){
            if(!root.user.pubs.get(pubNum))throw new Error('Current logged in user does not have a valid signing key')
            Object.defineProperty(s,'pub',{value:pub})
            add.emit('set',['pub'])
        })
        add.once('header',function(){
            Object.defineProperty(s,'header',{value:makeBuffer(true)})
            add.emit('set',['header'])
        })
        add.once('hHash',async function(){
            Object.defineProperty(s,'hHash',{value:await root.aegis.hash(s.header)})
            add.emit('set',['hHash'])
        })
        add.once('sig',async function(mr){
            let prevState = mr || s.person.merkleRoot
            if(s.sig)return
            if(s.cid !== root.user.id)throw new Error('This Stmt has a different Identity from whomever is logged in')
            if(!root.user.sign)throw new Error('Must have a signing key at "root.user.sign".')
            if(s.st === 1)prevState = gossip.nullHash
            if(!prevState || (prevState && !(prevState instanceof Uint8Array && prevState.length === 32)))throw new Error('Must provide the previous statements signature to sign')
            if(!s.header)throw new Error('Must have the following on the Stmt to sign: header hash & payload hash')
            let sig = await root.user.sign(Buffer.from([...prevState,...s.cid.buffer,...uintToBuff(s.ts,6),...uintToBuff(s.st,2),...uintToBuff(s.pub,2),...s.proof,...s.pHash]))
            Object.defineProperty(s,'sig',{value:sig})
            add.emit('set',['sig'])
        })

        function makeID(cid,ts){
            Object.defineProperty(s,'id',{value:BitID([...cid.buffer,...uintToBuff(ts)])})
            return s.id
        }

        function attachToPerson(cid){
            cid = BitID(cid)
            let person
            if(!(person = gossip.people.get(cid))){//first stmt we heard from this person
                person = new gossip.Person(cid)
                gossip.event.emit('newPerson',person)//increment some counter to eventually trigger a prune/mem analysis
            }
            Object.defineProperties(s,{
                'cid':{value:cid},
                'person':{value:person}
            })
        }
        function setType(val){
            let select = gossip.getStmtType(val)
            if(!select)throw new Error('Invalid message type given')
            Object.defineProperties(s,{
                'type':{value:select[0]},
                'st':{value:select[1]}
            })
        }
        function makeBuffer(onlyHeader){
            let h = []
            for (const [key,,,valToBytes,partOfHeader] of HEADER_ORDER) {
                if(onlyHeader && !partOfHeader)continue
                h = h.concat(valToBytes(s[key]))
            }
            return Buffer.from(h)
        }
        s.transform = function(){
            return makeBuffer()
        }
    }
    gossip.FLATStmt = function(header,body,opt){
        //there are 3 places a stmt can come from:
        //1- We hear it on the wire, this will be the most common, just need to verify and decide what to do with it
        //2- We are restoring it from disc, we should be restoring a whole chain at a time, so this should be same logic as #1
        //3- This instance is crafting a new stmt. This is the most complex (all the events). Must broadcast to all connected peers when complete

        //if given header this is an 'incoming' stmt, must attempt to put it with a person, and verify it (if we are not restoring it)
        //else we are creating a new statement, and need to use the stmt.set(key,value) method
        //stmt 2 we need to set cid,st,hash,body
        //stmt 4 we need to set cid,st,hash
        //everything else set cid,st,body
        const {workTarget,restoring} = opt || {}
        const HEADER_ORDER = [
            ['sig',64,Buffer.from,(sig)=>{sig}],
            ['cid',32,BitID,(cid)=>{cid.buffer}]
            ['ts',6,buffToUint,(ts)=>{uintToBuff(ts,6)}],
            ['st',2,buffToUint,(st)=>{uintToBuff(st,2)}],
            ['pub',2,buffToUint,(pub)=>{uintToBuff(pub,2)}],
            ['proof',16,Buffer.from,(sig)=>{sig}],
            ['hash',32,Buffer.from,(sig)=>{sig}],
        ]
        let s = this
        const add = new EventEmitter()
        s.set = add.emit
        add.on('set',async function(keys){
            keys = Array.isArray(keys)?keys:[keys]
            for (const key of keys) {
                if(['cid','ts'].includes(key) && s.cid && s.ts && !s.id){
                    s.set('id',true)
                }
                if(['body','st'].includes(key) && s.body && s.st){
                    gossip.verifyStmtBody(s.st,s.body)
                    if(![2,4].includes(s.st))s.set('hash',false)
                }
                if(['cid','ts','hash'].includes(key) && s.cid && s.ts && s.hash){
                    s.set('proof',workTarget)
                }
                if(key === 'proof'){
                    s.set('pub',root.user.pub)
                }
                if(key === 'verified'){
                    //not sure. Maybe this would be where we update the person's tail
                    //add this to some merkle proof for syncronization?
                    s.person.tail = s
                }
                if(key === 'sig'){
                    s.set('header',true)
                }
            }
            if(!s.sig && s.cid && s.ts && (s.st !== undefined) && (s.pub !== undefined) && s.proof && s.hash){
                s.set('sig',true)
            }
            if(s.sig && !Object.isSealed(s))Object.seal(s)//seal object once we add the sig (for stmt creation)
            
        })
        add.once('verified',function(){
            Object.defineProperty(s,'verified',{value:true})
            add.emit('set',['verified'])
        })
        add.once('prev',function(prevStmt){
            Object.defineProperty(s,'prev',{value:prevStmt})
            add.emit('set',['prev'])
        })
        add.once('next',function(nextStmt){
            Object.defineProperty(s,'next',{value:nextStmt})
            add.emit('set',['next'])
        })
        Object.defineProperties(s,{
            'diffHit':{writable:true},
            'work':{writable:true},
            'prev':{writable:true},
            'next':{writable:true},
            'verified':{writable:true}
        })
        s.verify = async function(prevSig){
            let psig = s.prev && s.prev.sig
            let pubKey = s.person.pubs.get(s.pub) || (s.st === 0) ? s.body : false
            prevSig = prevSig || psig ||  (s.st === 0) ? gossip.nullHash : false
            if(s.verified)return
            if(!pubKey){throw new Error('Cannot verify stmt w/o the pubKey referenced')}
            if(!prevSig || (prevSig && s.st !== 0 && !(prevSig instanceof Uint8Array && prevSig.length === 64)))throw new Error('Must provide the previous statements signature to sign')
            
            if(await root.verify(pubKey,s.sig,makeHeader(prevSig))){
                s.set('verified',true)
                return true
            }
            return false
        }
        s.integrityCheck = async function(){
            if(!(s.cid && s.ts && s.proof && s.hash))throw new Error('Stmt must have a cid, ts, proof, and hash to check integrity')
            if(s.st == 0){
                let match = root.monarch.verifyCID(s.cid,s.proof,s.hash)
                if(match && match.diffHit >= 16)s.person.proof = s
                else s.person.proof = false
            }
            if(![2,4].includes(s.st)){
                let h = await root.aegis.hash(encode(s.body,false,true))
                if(Buffer.compare(h,s.hash) !== 0){
                    s.verified = false
                    root.opt.log('Hash does not match payload')
                    return false
                }
            }
            let pt = Buffer.from([...s.cid.buffer,...uintToBuff(s.ts,6),...s.hash])
            let {diffHit,chance} = await root.monarch.checkPow(pt,{all:true,isHash:true})
            Object.defineProperties(s,{
                'diffHit':{value:diffHit},
                'work':{value:1/chance}
            })
            Object.seal(s)
            s.person.addStmt(s)
            return true
        }
        if(header){//set manually
            //check stmt store to see if we have seen this. If we have don't rebroadcast
            try {
                Object.defineProperties(s,{
                    'header':{value:header},
                    'body':{value:body}
                })
                
                let start = 0
                for (const [key,len,bytesToVal] of HEADER_ORDER) {
                    let hBits = (header.slice(start,start+len))
                    if(key === 'st')setType(bytesToVal(hBits))
                    else Object.defineProperty(s,key,{value:bytesToVal(hBits)})
                    start = start+len
                }
                let stmt = gossip.stmtStore.get(makeID(s.cid,s.ts))
                if(stmt)throw new Error('Already seen this statement')
                attachToPerson(s.cid)
                if(!restoring){
                    gossip.verifyStmtBody(s.st,s.body)
                }
                gossip.stmtStore.set(s.id,s)
                return s //what this returns to, will decide what needs to happen with it? (rebroadcast? )
            } catch (error) {
                root.opt.log('Dropping Statement:',error)
                return {drop:true}
            }
        }
        //these only run if there is no header
        add.once('body',function(body){
            Object.defineProperty(s,'body',{value:body})
            add.emit('set',['body'])
        })
        add.once('cid',function(cid){
            attachToPerson(cid)
            add.emit('set',['cid','person'])
        })
        add.once('ts',function(ts){
            if(isNaN(ts))throw new Error('ts must be a unix ms timestamp')
            Object.defineProperty(s,'ts',{value:ts})
            add.emit('set',['ts'])
        })
        add.once('id',function(){
            makeID(s.cid,s.ts)
            add.emit('set',['id'])
        })
        add.once('st',function(){
            setType(val)
            add.emit('set',['st'])
        })
        add.once('hash',function(hash){
            if(![2,4].includes(s.st)){
                hash = Buffer.from(await root.aegis.hash(encode(s.body,false,true)))//for all standard msgs
            }
            else if(!hash || !(hash instanceof Buffer))throw new Error('Must provide a Buffer of the hash for Stmt types 2 & 4')
            Object.defineProperty(s,'hash',{value:hash})
            add.emit('set',['hash'])
        })
        add.once('proof',function(work){
            work = work || 14
            if(!s.hash)throw new Error('Must provide a Buffer of the hash for Stmt types 2 & 4')
            if(!s.ts)s.set('ts',Date.now())//would normally trigger this fn again, but we are using once
            let pt = Buffer.from([...s.cid.buffer,...uintToBuff(s.ts,6),...s.hash])//must do more than the hash, to ensure work can't be reused for st 2&4
            let proof = await gossip.pow(pt,{isHash:true,target:work})
            Object.defineProperty(s,'proof',{value:proof})
            add.emit('set',['proof'])
        })
        add.once('pub',function(pubNum){
            if(!root.user.pubs.get(pubNum))throw new Error('Current logged in user does not have a valid signing key')
            Object.defineProperty(s,'pub',{value:pub})
            add.emit('set',['pub'])
        })
        add.once('sig',async function(){
            let prevSig = s.person.tail.sig
            if(s.sig)return
            if(s.cid !== root.user.id)throw new Error('This Stmt has a different Identity from whomever is logged in')
            if(!root.user.sign)throw new Error('Must have a signing key at "root.user.sign".')
            if(s.st === 0)prevSig = gossip.nullHash
            if(!prevSig || (prevSig && s.st !== 0 && !(prevSig instanceof Uint8Array && prevSig.length === 64)))throw new Error('Must provide the previous statements signature to sign')
            if(!(s.cid && s.ts && (s.st !== undefined) && (s.pub !== undefined) && s.proof && s.hash))throw new Error('Must have the following on the Stmt to sign: cid, st, pub, proof, & hash before signing')
            let sig = await root.user.sign(Buffer.from([...prevSig,...s.cid.buffer,...uintToBuff(s.ts,6),...uintToBuff(s.st,2),...uintToBuff(s.pub,2),...s.proof,...s.hash]))
            Object.defineProperty(s,'sig',{value:sig})
            add.emit('set',['sig'])
        })
        add.once('header',function(){
            Object.defineProperty(s,'header',{value:makeHeader(s.sig)})
            add.emit('set',['header'])
        })
        s.set('body',body)

        function makeID(cid,ts){
            Object.defineProperty(s,'id',{value:BitID([...cid.buffer,...uintToBuff(ts)])})
            return s.id
        }

        function attachToPerson(cid){
            cid = BitID(cid)
            let person
            if(!(person = gossip.people.get(cid))){//first stmt we heard from this person
                person = new gossip.Person(cid)
                gossip.event.emit('newPerson',person)//increment some counter to eventually trigger a prune/mem analysis
            }
            Object.defineProperties(s,{
                'cid':{value:cid},
                'person':{value:person}
            })
        }
        function setType(val){
            let select = gossip.getStmtType(val)
            if(!select)throw new Error('Invalid message type given')
            Object.defineProperties(s,{
                'type':{value:select[0]},
                'st':{value:select[1]}
            })
        }
        function makeHeader(sig){
            let h = []
            for (const [key,,,valToBytes] of HEADER_ORDER) {
                h = h.concat(valToBytes(key == 'sig'?sig:s[key]))
            }
            return Buffer.from(h)
        }
        s.transform = function(){
            return [s.header,s.body,s.prev?s.prev.ts:null]
        }
    }
    gossip.Person = function (cid,restore){//can only run constructor one time
        //can only be created 3 ways:
        //1- We hear a stmt with this cid, but we don't already know of them
        //2- We get a peer proof, stating that it is owned by this person
        //3- we are restoring state from disk
        //the logic is the same either way, except that restore has more state to add
        //we create the person, and basically just wait for stmts to come in
        let they = this
    
        they.id = BitID(cid)
        let check = gossip.people.get(they.id)
        if(check)return check
        they.proof = null //genesis block, to prove their cid is random
        they.say = [] //only added to from saidStmt, set of stmt objects
        they.pend = []
        they.leaves = []
        they.merkleRoot = null
        they.tail = null //altered from adding by saidStmt, should be the prevSig of the last valid block on the chain
        they.peers = new Set() //altered from adding by saidStm
        they.pubs = new Map() //altered from adding by saidStm, key of BitID(uintToBuff(stmt.pub)), value of Pub bytes
        they.online = new Set() //set of online peers that have verified they have signing keys for this identity
        they.maxWork = 0
        they.cummWork = 0
        they.verified = false //on them answering our identity challenge
        they.pin = restore[0] || false //set from a 'follow' api call, will not prune regardless of dist
        let where = (root.peer.isPeer && root.peer.id) || root.state.anchor
        they.dist = restore[1] || (they.id && where) ? root.monarch.distance(where,they.id) : Infinity
        they.add = new EventEmitter()
        they.add.on('verifiedStmt',function(stmt){

        })
        they.add.once('genesis',function(){

        })
        they.add.on('addKey',function(stmt){
            let num = Math.max(...they.pubs.keys()) + 1
            they.pubs.set(num,[stmt.ts,stmt.body])
        })
        they.addStmt = async function(stmt){
            if(they.say.includes(stmt) || they.pend.includes(stmt))return
            they.pend.push(stmt)
            they.pend.sort((a,b) =>a.ts-b.ts)
            if(!they.inloop)they.checkStmts()
        }
        they.checkStmts = async function(){
            let added = []
            try {
                they.inloop = true
                while (true) {
                    if(!they.pend.length)break
                    let mr = they.merkleRoot || nullHash
                    let nextStmt = they.pend[0]
                    if(!await nextStmt.verify(mr))break
                    if(nextStmt.st === 0){// this is a retraction, should pair it next to the reference
                        let match = they.leaves.findIndex((el)=>Buffer.compare(el.rootHash,nextStmt.body)===0)
                        if(match === -1){//either tree is invalid, or the stmt is invalid
                            throw new Error('Invalid Stmt, retraction does not match any statements')
                        }
                        they.leaves[match+1]=nextStmt
                    }else{
                        they.leaves = they.leaves.concat([nextStmt,gossip.nullStmt])
                    }
                    added.push(nextStmt)
                    they.tail = they.pend.shift()
                    //when it is added we need to emit some sort of event
                    //so that either when we received and confirmed or made and confirmed, we can decide whether to rebroadcast/towho, etc
                }
            } catch (error) {
                root.opt.debug('Could not add Stmt to merkle tree:',error)
            }
            if(added.length)they.buildTree()
            they.inloop = false
            return added
        }
        they.memoHash = MemoStore(
            async function(h1,h2){
                return await root.aegis.hash(Buffer.concat([h1,h2]))
            },
            function(h1,h2){
                return h1.toString('binary')+h2.toString('binary')
            },
            function(h1,h2){
                if(!(h1 instanceof Buffer && h2 instanceof Buffer))throw new Error('must pass two buffers')
            },true)
        they.buildTree = async function(){
            const nodes = they.leaves.map((x)=>x.rootHash)
            they.tree = [nodes]
            while (nodes.length > 1) {
                var layerIndex = they.tree.length;
                they.tree.push([]);
                for (var i = 0; i < nodes.length; i += 2) {
                    var left = nodes[i];
                    var right = i + 1 == nodes.length ? left : nodes[i + 1];
                    var hash = they.memoHash(left,right)
                    they.tree[layerIndex].push(hash);
                }
                nodes = they.tree[layerIndex];
            }
        }
    }
    gossip.Us = function(cid,signingKeyNum){
        let us = this
        gossip.Person.call(us,cid)
        us.dist = 0
        us.pin = true
        us.pub = signingKeyNum
        us.addWkn = async function(name,work){
            const s = new gossip.Stmt(false,body,work)
            if([2,4].includes(st)){
                s.set('hash',hash)
            }
            s.set('cid',us.id)
            s.set('st',st)
        }
        us.addRL = async function(){

        }
        us.say = async function(st,body,work,hash){
            const s = new gossip.Stmt(false,body,work)
            if([2,4].includes(st)){
                s.set('hash',hash)
            }
            s.set('cid',us.id)
            s.set('st',st)
        }
        
    }
    gossip.verifyPeerOwner = function(peer,cid){
        if(!cid[Symbol.iterator])throw new Error('Must provide an iterable object for a Chain ID')
        cid = BitID(cid)
        let person = gossip.people.get(cid)
        if(!person)root.router.queryChain([cid,['addPeer','removePeer']])
    }
    gossip.saveToDisk = function(){
        //onChange, setTimeout (15-30 seconds?) then dump current state to disk
        //key[0,4] = [[person.id.buffer,[meta]],...] //all chains
        //key[64,...cid] [stmt.ts]
        //key[24,...cid,...ts] [header,body]

    }
    gossip.restoreFromDisk = function(){
        //opposite of saveToDisk
        //need to re-index everything
        //when done, using the new opts, prune if opts were reduced
    }
    gossip.prune = function(){
        //after so many additions, run this function to make sure we aren't over the limit
        //need to define deterministic rules to prune
    }
    
}