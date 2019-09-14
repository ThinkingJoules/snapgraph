import {encode, decode} from '@msgpack/msgpack'
import { getBaseLog } from './util';

export default function Aeon(root){
    //this will be the inbetween of the crypto and outer APIs
    //this is where identity things will happen
    //anything to do with the user chain, authorizing the snap instance
    //such as adding to the curr
    const aeon = this
    const mTypes = aeon.mTypes = {}
    const util = aeon.util = {}

    aeon.create = async function(credPass,cb,opt){
        opt = opt || {}
        cb = (cb instanceof Function && cb) || function(){}
        let proofTarget = opt.proof || 15 //15 is network default threshold to create new identity
        const pair = await root.aegis.pair()
        root.sign = await sign(pair.priv)
        let cid = await root.aegis.hash(pair.pub)
        let payload = mTypes.AU([{pub:['PUB',[pair.pub]]}])
        let proof = await aeon.pow(payload,{target:proofTarget})
        let block = new Block(cid,'AU',payload,pair.pub,proof)
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
            root.sign = await sign(priv)
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
        if(jsTarget == undefined)throw new Error("Must specify something to prove work was performed on")
        opt = opt || {}
        let {updateCB,contUpdateCB,target} = opt
        let hash = await root.aegis.hash(encode(jsTarget,{sortKeys:true}))
        let cKey = await root.aegis.subtle.importKey('raw', powKey, 'AES-CBC', false, ['encrypt'])
        let ct,iv,rounds = 0
        let trgt = target || 15
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
        let proof = {
            ct,
            iv,
        }
        root.opt.debug({proof},{fin,rounds,per:fin/rounds})
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
            let i = ct.length-17
            for (let b=first+i; i < b; i++) {
              if(ct[i] !== 0){return false}
            }
            return last.includes(ct[i])
        }
        
          
        
        
    }
    aeon.checkPow = async function(pt,iv){
        let hash = await root.aegis.hash(encode(pt,{sortKeys:true}))
        let cKey = await root.aegis.subtle.importKey('raw', powKey, 'AES-CBC', false, ['encrypt'])
        let ct = Buffer.from(await root.aegis.subtle.encrypt({ name: 'AES-CBC', iv}, cKey, hash))
        // let mean = ct.length*255/2
        // ,sd = Math.sqrt(ct.length*(Math.pow(254,2)-1)/12)//254 because distribution isn't perfect on edges
        let diffHit = 0,i = ct.length-17
        for (; i < ct.length; i++) {
            const element = ct[i];
            diffHit+=getZeros(element)
            if(element !=0)break
        }
        let chance = calcChance(diffHit)
        root.opt.debug({diffHit,avgGuesses:1/chance})
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
        return async function(data,cb){
            let buff = encode(data,{sortKeys:true});
            const sig = await root.aegis.subtle.sign(algo,cKey,buff)
            console.log(sig)
            let b64 = Buffer.from(sig,'binary').toString('base64')
            if(cb && cb instanceof Function) cb(b64)
            return b64
        }
    }
    
    
}