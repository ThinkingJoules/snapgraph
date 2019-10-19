import { getBaseLog,encode, decode, toBuffer, buffUtil } from './util';

export default function Aeon(root){
    //this will be the inbetween of the crypto and outer APIs
    //this is where identity things will happen
    //anything to do with the user chain, authorizing the snap instance
    //such as adding to the curr
    const aeon = this
    const mTypes = aeon.mTypes = {}
    const util = aeon.util = {}
    aeon.hashCID = async function(){
        let [k,a] = await aeon.makeCID()
        let h = await root.aegis.hash(a)
        return [a,h]
    }
    aeon.makeCID = async function(cb,opt){
        opt = opt || {}
        let {updateCB,contUpdateCB,match} = opt
        cb = (cb instanceof Function && cb) || function(){}
        let pair,cid
        match = (match && Array.isArray(match)) ? [0,0,...match] : [0,0]
        let trgt = match.length * 8
        ,chance = calcChance(trgt)
        ,r50 = guessesForP(.5,chance),r80 = guessesForP(.8,chance),r95 = guessesForP(.95,chance),r99 = guessesForP(.99,chance)
        ,rate,rounds = 0, cur = {chance:.5,time:null},s=Date.now() //,keyTime = 0, hashTime = 0
        while (true) {
            rounds++
            //let a = Date.now()
            pair = await root.aegis.pair() // ~86% of guessing time
            //let b = Date.now()
            cid = await root.aegis.hash(pair.pub) // ~14% of guessing time
            //keyTime += b-a
            //hashTime += Date.now()-b
            if(compare(cid)){
                break
            }
            if(rounds === 5000){rate = (Date.now()-s)/rounds;update(.5)}
            if(contUpdateCB && contUpdateCB instanceof Function && !(rounds%5000)){
                cur.time = Math.round(howLong(cur.chance)/1000)
                contUpdateCB.call(contUpdateCB,cur)
            }
            if(rate && rounds === r50)update(.8)
            if(rate && rounds === r80)update(.95)
            if(rate && rounds === r95)update(.99)
            if(rate && rounds === r99)update(.999)
        }
        let fin = Date.now()-s
        root.opt.debug('pickedCID',{fin,rounds,per:fin/rounds})
        cb([pair,cid])
        return [pair,cid]
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
        function compare (keyhash) {
            let i = 0
            for (let b=match.length; i < b; i++) {
              if(keyhash[i] !== match[i]){return false}
            }
            return true
        }
         
    }
    aeon.create = async function(credPass,cb,opt){
        opt = opt || {}
        cb = (cb instanceof Function && cb) || function(){}
        let proofTarget = opt.proof || 16 //15 is network default threshold to create new identity?
        const pair = await root.aegis.pair()
        root.sign = await sign(pair.priv)
        let payload = mTypes.AU([{pub:['PUB',[pair.pub]]}])
        let {ct,iv} = await aeon.pow(payload,{target:proofTarget,all:true})
        let cid = ct.slice(0,32)
        let block = new Block(cid,'AU',payload,pair.pub,iv)
        let sig = await root.sign(block)
        let authCreds = {cid,priv:pair.priv,pub:pair.pub}
        if(credPass){
            authCreds = await root.aegis.extendEncrypt(authCreds,credPass)
        }
        authCreds = root.util.outputHeaderedStr(authCreds,(credPass)?'ENCRYPTED AUTH':'AUTH')
        let msg = [sig,block]
        console.log(msg)
        root.router.send.say(msg,async function(confirmed){
            if(confirmed){
                let a = await aeon.auth({passphrase:credPass,creds:authCreds,tail:sig})
                cb(false,a)
            }else{
                cb(new Error('Network did not accept message. Try again.'))
            }
        })        
    }
    aeon.auth = async function(auth,cb){
        const {wkn,passphrase,creds,tail} = auth || {}
        let authd
        if(creds){
            let {what,content} = root.util.parseHeaderedStr(creds)
            if(what.includes('ENCRYPTED'))content = await dec(content)
            authd = await authSnap(content)
            getTail()
        }else{
            let body = {}
            root.router.send.ask(body,async function(resp){
                //sort through all cid/AU and try to auth each one until success
            })
        }
        
        async function dec(content){
            if(!passphrase)throw new Error('Must provide a passphrase to decrypt the login')
            return await root.aegis.extendDecrypt(content,passphrase)
        }
        async function authSnap(content){
            let {cid,priv,pub} = decode(Buffer.from(content,'base64'))
            root.user = {}
            root.user.is = cid
            root.user.pub = pub
            root.user.sign = await sign(priv)
            return true
        }
        function getTail(){
            if(tail){
                root.user.tail = tail
                if(authd && cb && cb instanceof Function)cb(false,root.user)
                return
            }
            aeon.curTail(function(tail){
                root.user.tail = tail
                if(authd && cb && cb instanceof Function)cb(false,root.user)
            })
        }
    }

    aeon.curTail = function(cb){
        //get our current tail so we can make sure the block will go through
        //has to run this before each send (unless we are queued from being offline)
        //or the peer we are connected to will send this to us on new blocks??
        let body = {}
        root.router.send.ask(body,function(resp){
            //get last block
            //call cb with the header
        })
    }

    aeon.say = function(prevSig,block){
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
    aeon.pow = async function(jsTarget,opt){
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
    aeon.checkPow = async function(pt,iv,opt){
        opt = opt || {}
        if(!(pt instanceof Buffer || pt instanceof Uint8Array))pt=encode(pt,false,true)
        let hash = await root.aegis.hash(pt)
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
    aeon.newPID = async function(work){
        if(!root.peer.isPeer)return [root.aegis.random(8)]
        const {priv,pub} = await root.aegis.pair()
        let s = await sign(priv)
        let pt = await s(pub)
        let {ct,iv} = await aeon.pow(pt,{target:work||24,all:true,contUpdateCB:root.opt.debug,updateEvery:1000000})
        return await aeon.authPeer(0,priv,pub,pt,iv,null,Date.now(),root.opt.address||null,root.opt.owner||null)
    }
    aeon.verifyPID = async function(pid,pub,pubsig,iv,stateSig,date,addr,owner){
        if(!await root.verify(pub,pubsig,pub)){root.opt.warn('PubSig is invalid');return false}
        if(!await root.verify(pub,stateSig,[date,addr,owner])){root.opt.warn('StateSig is invalid');return false}
        let {ct,chance,diffHit} = await root.aeon.checkPow(pubsig,iv,{all:true})
        let pidcheck = ct.slice(0,32)
        return !Buffer.compare(pid,pidcheck)?{diffHit,chance}:0//should be 0 if a match (!0 = true), else -1/1 (!1 = false)
    }
    aeon.authPeer = async function(version,priv,pub,pubsig,iv,stateSig,date,addr,owner){
        root.peer.sign = await sign(priv)
        root.peer.pub = pub
        let {ct} = await root.aeon.checkPow(pubsig,iv,{all:true})
        root.peer.id = ct.slice(0,32)
        root.peer.address = addr
        let stateSig = (version<date || !stateSig)?await root.peer.sign([date,addr,owner]):stateSig
        root.peer.proof = [root.peer.id,pub,pubsig,iv,stateSig,date,addr,owner]
        root.peer.owner = buffUtil(owner)
        root.opt.debug('authPeer Proof:',root.peer.proof)
        return root.peer.proof
    }
    aeon.distance = function (a,b){
        if(!(a instanceof Buffer && b instanceof Buffer))throw new Error('Both coords must be a Buffer')
        if(a.length !== b.length)throw new Error('Must compare equal length coords')
        let dist = 256*a.length
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
            const oByte = a[i];
            const tByte = b[i];
            let hd = hammingDist(oByte,tByte)
            dist -= distScore[hd]
        }
        return dist
    }
    function hammingDist(a,b){
        let d = 0;
        let h = a ^ b;
        while (h > 0) {
            d ++;
            h &= h - 1;
        }
        return d;
    }
    function hammingWt (n) {
        n = n - ((n >> 1) & 0x55555555)
        n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
        return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
    }
    function validBytes(compByte,dist){
        if(dist > 8 || dist < 0)throw new Error('dist must be between 0-4')
        if(compByte>255)throw new Error('must provide an unsigned 8 bit number')
        if(dist === 0)return [compByte]
        let total = (factorial(8)/(factorial(dist)*factorial(8-dist)))
        let val = Math.pow(2,dist)-1
        if(dist === 8)return [compByte^val]
        let valid = []
        for (let i = 0; i < total; i++) {
            valid.push(compByte^val)
            //https://math.stackexchange.com/questions/2254151/is-there-a-general-formula-to-generate-all-numbers-with-a-given-binary-hamming
            let c = val & -val;
            let r = val + c;
            val = (((r^val) >> 2) / c) | r;
        }
        return valid;
    }
    function factorial(num) {
        var result = num;
        if (num === 0 || num === 1) 
          return 1; 
        while (num > 1) { 
          num--;
          result *= num;
        }
        return result;
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