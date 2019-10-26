import { getBaseLog, encode, decode, toBuffer, buffUtil, BitID, buffToUint, uintToBuff, hammingWt, outputHeaderedStr, parseHeaderedStr } from './util';

export default function Monarch(root){
    //this will be the inbetween of the crypto and outer APIs
    //this is where identity things will happen
    //anything to do with the user chain, authorizing the snap instance
    //such as adding to the curr
    const monarch = this
    const mTypes = monarch.mTypes = {}
    const util = monarch.util = {}
    monarch.nullHash = (async function(){
        return Buffer.from(await root.aegis.hash(encode(null)))
    })()
    monarch.Stmt = function(o){//can call constructor on existing Stmt obj to add to Stmt, in either direction
        //check stmt store and return that object if it already exists
        let s = this
        let parts = [
            ['sig',(s.sig || o.sig),64,Buffer.from],
            ['cid',(s.cid || o.cid),32,BitID],
            ['ts',(s.ts || o.ts),6,buffToUint],
            ['st',(s.st==undefined?setType(o.st):s.st),2,buffToUint],
            ['pub',(s.pub || o.pub),2,buffToUint],
            ['proof',(s.proof || o.proof),16,Buffer.from],
            ['hash',(s.hash || o.hash),32,Buffer.from]]
        let start = 0
        let h = []
        for (const [key,value,len,op] of parts) {
            let hBits = (o.header && o.header.slice(start,start+len)) || value
            h = h.concat(hBits)
            if(key === 'st')setType(s.st || hBits && op(hBits) || o.st)
            else s[key] = value || (hBits && op(hBits))
            start = start+len

        }
        s.id = (s.cid && s.ts && !s.id) ? BitID([...s.cid.buffer,...uintToBuff(s.ts)]) : false 
        s.body = s.body || o.body
        s.header = s.header || o.header
        verifyPayload()
        function setType(val){
            let types = [//these are the wire message types
                ['genesis',     0],
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
            s.type = select[0]
            s.st = select[1]
            s.person = null //add the person object here so we can use it for filtering the stmts
        }
        function verifyPayload(){
            if(s.body == undefined)throw new Error('Body must have a non-undefined value')
            switch (s.st) {
                case 0:{
                    if(!s.body instanceof Buffer || s.body.length !== 65)throw new Error('Must provide 65 Bytes for your first public key')
                    break
                }
                case 2:{
                    if(!s.body instanceof Buffer)throw new Error('Must provide a Buffer of encrypted Bytes')
                    break
                }
                case 4:{
                    if(s.body !== null)throw new Error('Cannot provide the wkn plaintext in the message. Only valid using null')
                    break
                }
                case 8:{
                    if(!Array.isArray(s.body) || s.body.length !== 3)throw new Error('Must provide an array of 3 arguments')
                    if(!s.body[0] instanceof Buffer || s.body[0].length !== 65)throw new Error('Must provide 65 Bytes public key as element[0] in array')
                    if(!['>','<'].includes(s.body[1]))throw new Error('Must state the relative key rank as ">" or "<" as element[1] in the array')
                    if(isNaN(s.body[2]) || (s.body[2] > (2**16)-1 || s.body[2] < 0))
                    break
                }
                case 9:{
                    if(isNaN(s.body) || (s.body > (2**16)-1 || s.body < 0))throw new Error('Must be a valid 2 byte number')
                    break
                }
                case 12:
                case 13:{
                    if(!s.body instanceof BitID || s.body.buffer.length !== 32)throw new Error('Must provide 32 Bytes to specify which Peer ID')
                    break
                }
            }
        }
        s.transform = function(){
            return [s.header || Buffer.from([...s.sig,...s.cid.buffer,...uintToBuff(s.ts,6),...uintToBuff(s.st,2),...uintToBuff(s.pub,2),...s.proof,...s.hash]),s.body]
        }
        s.sign = async function(prevSig){
            if(s.sig)return
            if(s.cid !== root.user.id)throw new Error('This Stmt has a different Identity from whomever is logged in')
            if(!root.user.sign)throw new Error('Must have a signing key at "root.user.sign".')
            if(s.st === 0)prevSig = monarch.nullHash
            if(!prevSig || (prevSig && s.st !== 0 && !(prevSig instanceof Buffer && prevSig.length === 64)))throw new Error('Must provide the previous statements signature to sign')
            if(!(s.cid && s.st && s.pub && s.proof && s.hash))throw new Error('Must have the following on the Stmt to sign: cid, st, pub, proof, & hash before signing')
            s.sig = await root.user.sign(Buffer.from([...prevSig,...s.cid.buffer,...uintToBuff(s.ts,6),...uintToBuff(s.st,2),...uintToBuff(s.pub,2),...s.proof,...s.hash]))
            return s.sig

        }
        s.addPow = async function(work,hash){
            work = work || 14
            if(!s.hash){
                if(![2,4].includes(s.st))s.hash = Buffer.from(await root.aegis.hash(encode(s.body,false,true)))//for all standard msgs
                else if (!s.hash && hash && hash instanceof Buffer)s.hash = hash
                else if(!s.hash)throw new Error('Must provide a Buffer of the hash for Stmt types 2 & 4')
            }
            if(!s.ts)s.ts = Date.now()
            let pt = Buffer.from([...s.cid.buffer,...uintToBuff(s.ts,6),...s.hash])//must do more than the hash, to ensure work can't be reused for st 2&4
            return (s.proof = await monarch.pow(pt,{isHash:true,target:work}))
        }
        s.verify = async function(prevSig){
            if(s.verified)return
            if(s.st === 0)prevSig = monarch.nullHash
            if(!prevSig || (prevSig && s.st !== 0 && !(prevSig instanceof Buffer && prevSig.length === 64)))throw new Error('Must provide the previous statements signature to sign')
            if(![2,4].includes(s.st)){
                let h = await root.aegis.hash(encode(s.body,false,true))
                if(Buffer.compare(h,s.hash) !== 0)throw new Error('Hash does not match payload')
            }
            if(await root.verify(s.pub,s.sig,Buffer.from([...prevSig,...s.cid.buffer,...uintToBuff(s.ts,6),...uintToBuff(s.st,2),...uintToBuff(s.pub,2),...s.proof,...s.hash]))){
                if(!s.diffHit){
                    await s.checkPow()
                }
                s.verified = true
                return true
            }
            if(!s.diffHit){
                await s.checkPow()
            }
            return false
        }
        s.checkPow = async function(){
            if(!(s.cid && s.ts && s.proof && s.hash))throw new Error('Stmt must have a cid, ts, proof, and hash to check PoW')
            let pt = Buffer.from([...s.cid.buffer,...uintToBuff(s.ts,6),...s.hash])
            let {diffHit,chance} = await monarch.checkPow(pt,{all:true,isHash:true})
            s.diffHit = diffHit
            s.work = 1/chance
            return diffHit
        }
    }
    monarch.create = async function(credPass,cb,opt){
        opt = opt || {}
        cb = (cb instanceof Function && cb) || function(){}
        let proofTarget = opt.proof || 16 //15 or 16 is network default threshold to create new identity?
        const pair = await root.aegis.pair()
        root.user.sign = await sign(pair.priv)
        let body = pair.pub
        let hash = await root.aegis.hash(body)
        let {ct,iv:proof} = await monarch.pow(hash,{target:proofTarget,all:true,isHash:true})
        let cid = BitID(ct.slice(0,32))
        let stmt = new monarch.Stmt({hash,proof,cid,st:0,pub:0,body})
        await stmt.addPow(16)
        await stmt.sign()
        let authCreds = [cid.buffer,pair.priv,0]
        if(credPass){
            authCreds = await root.aegis.extendEncrypt(authCreds,credPass)
        }
        authCreds = outputHeaderedStr(authCreds,(credPass)?'ENCRYPTED AUTH':'AUTH')
        console.log(stmt)
        if(!await monarch.auth({passphrase:credPass,creds:authCreds,tail:sig}))throw new Error('Auth Failed')
        root.router.send.say(stmt.transform())//TODO
        return authCreds
    }
    monarch.verifyCID = async function(cid,proof,hash){
        let {ct,chance,diffHit} = await root.monarch.checkPow(hash,proof,{all:true})
        let cidcheck = ct.slice(0,32)
        cid = cid instanceof BitID ? cid.buffer : cid
        return !Buffer.compare(cid,cidcheck)?{diffHit,chance}:0//should be 0 if a match (!0 = true), else -1/1 (!1 = false)
    }
    monarch.auth = async function(auth,cb){
        const {passphrase,creds,authNameString} = auth || {}
        let authd
        if(creds){
            let buffContent
            if(typeof creds === 'string'){
                let {content} = parseHeaderedStr(creds)
                buffContent = decode(Buffer.from(content,'base64'))
            }else if(creds instanceof Buffer)buffContent = decode(creds)
            attemptAuth(buffContent)
        }else{
            let key = Buffer.from(await root.aegis.hash(encode(authNameString)))
            root.router.send.getAliasHash(key,async function(resp){
                //should be an array of statements that are unique, but match this hash
                //since we don't know our CID, we need to try and auth each one that is the correct statement type
                for (const [header,body] of resp) {
                    let stmt = new monarch.Stmt({header,body})
                    if(stmt.st !== 2)continue
                    if(await authCreds(body)){
                        if(cb && cb instanceof Function)cb(false,true)
                        return
                    }
                }
                if(cb && cb instanceof Function)cb(new Error('Could not auth with any of the statements received'))
            })
        }
        async function attemptAuth(authCreds){
            try {
                let content
                if(passphrase)content = await dec(authCreds)
                else content = authCreds
                return await authSnap(content)
            } catch (error) {
                return false
            }
        }
        async function dec(content){
            if(!passphrase)throw new Error('Must provide a passphrase to decrypt the login')
            return await root.aegis.extendDecrypt(content,passphrase)
        }
        async function authSnap(content){
            let [cid,priv,pub] = content
            root.user = new root.gossip.Us(cid,pub)
            root.user.sign = await sign(priv)
            root.opt.log('Successfully Authd')
            root.event.emit('auth',true)
            return true
        }
    }

    monarch.curTail = function(cb){
        //get our current tail so we can make sure the block will go through
        //has to run this before each send (unless we are queued from being offline)
        //or the peer we are connected to will send this to us on new blocks??
        let body = {}
        root.router.send.ask(body,function(resp){
            //get last block
            //call cb with the header
        })
    }

    monarch.say = function(prevSig,block){
        //sign block
        //give to router (send buffer?)
    }
    function Block(chainID,type,payload,pub,proof){
        this.cid = chainID
        this.mt = type
        this.data = payload
        //this.p = prev has to be added RIGHT before sending
        this.pub = pub
        this.pow = proof
        this.ts = Date.now()

    }
    mTypes.AU = function(keyArr){//AuthUpdate
        let out = []
        for (const keyO of keyArr) {
            let {rank,pub,deauth} = keyO
            out.push(new KeyObj(rank,pub,deauth))
        }
        return out
        function KeyObj(rank,pub,deauth){
            if(rank)this.rank = rank
            this.pub = pub
            if(deauth)this.deauth = deauth
            //validate pub and deauth!
        }
    }
    

    const powKey = Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])//whole network knows this key, all work is generated/checked with it
    monarch.pow = async function(jsTarget,opt){
        let s = Date.now()
        if(jsTarget === undefined)throw new Error("Must specify something to prove work was performed on")
        opt = opt || {}
        let {updateCB,contUpdateCB,target,all,updateEvery,isHash} = opt
        updateEvery = updateEvery || 5000
        if(!(jsTarget instanceof Buffer || jsTarget instanceof Uint8Array))jsTarget=encode(jsTarget,false,true)
        let hash = isHash ? jsTarget : await root.aegis.hash(jsTarget)
        let cKey = await root.aegis.subtle.importKey('raw', powKey, 'AES-CBC', false, ['encrypt'])
        let ct,iv,rounds = 0
        let trgt = target || 16
        ,first = Math.floor(trgt/8)
        ,last = calcLast(trgt%8)
        ,chance = calcChance(trgt)
        ,avgGuesses = 1/chance
        ,r50 = guessesForP(.5,chance),r80 = guessesForP(.8,chance),r95 = guessesForP(.95,chance),r99 = guessesForP(.99,chance)
        ,rate,cur = {chance:.5,time:null}
        while (true) {
            rounds++
            iv = root.aegis.random(16)//TODO try with an incrementing iv instead of random
            ct = Buffer.from(await root.aegis.subtle.encrypt({ name: 'AES-CBC', iv}, cKey, hash))
            if(compare(ct,trgt)){
                break
            }
            if(rounds === 5000){rate = (Date.now()-s)/rounds;update(.5)}
            if(!rounds%20000){rate = (Date.now()-s)/rounds}
            if(contUpdateCB && contUpdateCB instanceof Function && !(rounds%updateEvery)){
                cur.time = Math.round(howLong(cur.chance)/1000)
                contUpdateCB.call(contUpdateCB,cur)
            }
            if(rate && rounds === r50)update(.8)
            if(rate && rounds === r80)update(.95)
            if(rate && rounds === r95)update(.99)
            if(rate && rounds === r99)update(.999)
        }
        let fin = Date.now()-s
        let proof = {
            ct,
            iv,
        }
        root.opt.debug({proof},{fin,rounds,per:fin/rounds})
        if(all)return proof
        return iv
        function update(curP){
            cur.chance = curP
            cur.time = Math.round(howLong(cur.chance)/1000)
            if(updateCB && updateCB instanceof Function)updateCB.call(updateCB,cur)
            root.opt.debug(`${cur.chance*100}% chance to be done in another: ${cur.time} seconds`)
        }
        function howLong(p){
            let tot = guessesForP(p,chance)
            let toGo = tot-rounds
            return Math.round(toGo*rate)
        }
        function compare (ct) {//checks the last cbc block (last 16 bytes)
            let i = ct.length-16
            for (let b=first+i; i < b; i++) {
              if(ct[i] !== 0){return false}
            }
            return last.includes(ct[i])
        }
    }
    monarch.checkPow = async function(pt,iv,opt){
        opt = opt || {}
        if(!(pt instanceof Buffer || pt instanceof Uint8Array))pt=encode(pt,false,true)
        let hash = opt.isHash?pt:await root.aegis.hash(pt)
        let cKey = await root.aegis.subtle.importKey('raw', powKey, 'AES-CBC', false, ['encrypt'])
        let ct = Buffer.from(await root.aegis.subtle.encrypt({ name: 'AES-CBC', iv}, cKey, hash))

        let diffHit = 0,i = ct.length-16
        for (; i < ct.length; i++) {
            const element = ct[i];
            diffHit+=getZeros(element)
            if(element !=0)break
        }
        let chance = calcChance(diffHit)
        root.opt.debug({diffHit,avgGuesses:1/chance})
        if(opt.all)return {diffHit,ct,chance,hash}
        return diffHit
        function getZeros(regValue){
            if(regValue>127)return 0
            if(regValue>63)return 1
            if(regValue>31)return 2
            if(regValue>15)return 3
            if(regValue>7)return 4
            if(regValue>3)return 5
            if(regValue>1)return 6
            if(regValue==1)return 7
            if(regValue==0)return 8
        }
    }
    function guessesForP(p,chance){
        //https://math.stackexchange.com/a/1119890
        let d = getBaseLog(1/(1-p),1-chance)
        return Math.round((-1/d)+1)
    }
    function calcChance(diff){
        let a = Math.floor(diff/8)
        return (a-1+(calcLast(diff%8,1)))/Math.pow(256,a+1)
    }
    function calcLast(diffModulo,num){
        let l
        switch (diffModulo) {
            case 0: l=256;break;
            case 1: l=128;break;
            case 2: l=64;break;
            case 3: l=32;break;
            case 4: l=16;break;
            case 5: l=8;break;
            case 6: l=4;break;
            case 7: l=2;break;
        }
        return (num) ? l : Array.from({length:l},(a,i)=>i)
    }
    monarch.newPID = async function(work){
        if(!root.peer.isPeer)return [root.aegis.random(8)]
        const {priv,pub} = await root.aegis.pair()
        let s = await sign(priv)
        let pt = await s(pub)
        let {ct,iv} = await monarch.pow(pt,{target:work||24,all:true,contUpdateCB:root.opt.debug,updateEvery:1000000})
        return await monarch.authPeer(0,priv,pub,pt,iv,null,Date.now(),root.opt.address||null,root.opt.owner||null)
    }
    monarch.verifyPID = async function(pid,pub,pubsig,iv,stateSig,date,addr,owner){
        if(!await root.verify(pub,pubsig,pub)){root.opt.warn('PubSig is invalid');return false}
        if(!await root.verify(pub,stateSig,[date,addr,owner])){root.opt.warn('StateSig is invalid');return false}
        let {ct,chance,diffHit} = await root.monarch.checkPow(pubsig,iv,{all:true})
        let pidcheck = ct.slice(0,32)
        return !Buffer.compare(pid,pidcheck)?{diffHit,chance}:0//should be 0 if a match (!0 = true), else -1/1 (!1 = false)
    }
    monarch.authPeer = async function(version,priv,pub,pubsig,iv,stateSig,date,addr,owner){
        root.peer.sign = await sign(priv)
        root.peer.pub = pub
        let {ct} = await root.monarch.checkPow(pubsig,iv,{all:true})
        root.peer.id = ct.slice(0,32)
        root.peer.address = addr
        let stateSig = (version<date || !stateSig)?await root.peer.sign([date,addr,owner]):stateSig
        root.peer.proof = [root.peer.id,pub,pubsig,iv,stateSig,date,addr,owner]
        root.peer.owner = buffUtil(owner)
        root.opt.debug('authPeer Proof:',root.peer.proof)
        return root.peer.proof
    }
    monarch.distance = function (a,b){
        if(!(a instanceof BitID && b instanceof BitID))throw new Error('Both coords must be a BitID')
        if(a.buffer.length !== b.buffer.length)throw new Error('Must compare equal length coords')
        let dist = 0
        let distScore = {
            0:256,
            8:256,
            1:16,
            7:16,
            2:1/(28/256),
            6:1/(28/256),
            3:1/(56/256),
            5:1/(56/256),
            4:1/(70/256)
        }
        for (let i = 0; i < a.length; i++) {
            const oByte = a.buffer[i];
            const tByte = b.buffer[i];
            //let hd = hammingDist(oByte,tByte)
            //dist += hd //-= distScore[hd]
            dist += hammingWt(oByte^tByte) //same as hammingDist result, but faster (no loop or comparisons)?
        }
        return dist
    }

    
    // snap.leave = function(){
    //     let snap = this
    //     let root = snap._
    //     root.on.signout()
    // }
    // snap.auth = async function(encStr,cb){
    //     let {a,e} = strToJs(encStr)
    //     let signPair = aegis.pairToJwk(a)
    //     let signKey = await aegis.subtle.importKey('jwk',signPair,s.ecdsa.pair,true,["sign"])
    //     let user = root.user = {pub:a.pub}
    //     user.sign = sign(s.ecdsa.sign,signKey)
    //     if(cb && cb instanceof Function) cb(user)
    //     return user
    // }


    //sign should be here, since this is where auth will always happen
    async function sign(keyBits){
        let cKey = await root.aegis.importSignKey(keyBits)
        let algo = root.aegis.settings.ecdsa.sign
        return async function(data,cb,opt){
            opt = opt || {}
            let buff = (data instanceof Buffer || data instanceof Uint8Array || data instanceof ArrayBuffer)?data:encode(data,false,true);
            const sig = await root.aegis.subtle.sign(algo,cKey,buff)
            let output = opt.string?Buffer.from(sig).toString('base64'):Buffer.from(sig)
            if(cb && cb instanceof Function) cb(output)
            return output
        }
    }
    
    
}