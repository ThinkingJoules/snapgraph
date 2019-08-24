import {encode, decode} from '@msgpack/msgpack'

export default function Aeon(root){
    //this will be the inbetween of the crypto and outer APIs
    //this is where identity things will happen
    //anything to do with the user chain, authorizing the snap instance
    //such as adding to the curr
    const aeon = this
    const mTypes = aeon.mTypes = {}
    const util = aeon.util = {}

    aeon.create = async function(proofTarget){
        proofTarget = proofTarget || 525
        const pair = await root.aegis.pair()
        root.sign = await sign(pair.priv)
        let cid = await root.aegis.hash(pair.pub)
        let payload = mTypes.AU([{pub:['PUB',[pair.pub]]}])
        let proof = await root.aegis.pow(payload,{target:proofTarget})
        let block = new Block(cid,'AU',payload,pair.pub,proof)
        let sig = await root.sign(block)
        console.log({[sig]:block})
        return {cid,pair}
    }




    aeon.curTail = function(){
        //get our current tail so we can make sure the block will go through
        //has to run this before each send (unless we are queued from being offline)
        //or the peer we are connected to will send this to us on new blocks??
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
    mTypes.AU = function(keyArr){
        let out = []
        for (const keyObj of keyArr) {
            let {rank,pub,deauth} = keyObj
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

    async function sign(keyBits){
        let cKey = await root.aegis.importSignKey(keyBits)
        let algo = root.aegis.settings.ecdsa.sign
        return async function(data,cb){
            let buff = encode(data,{sortKeys:true});
            const sig = await root.aegis.subtle.sign(algo,cKey,buff)
            let b64 = Buffer.from(sig,'binary').toString('base64')
            if(cb && cb instanceof Function) cb(b64)
            return b64
        }
    }
    root.verify = async function(pub,b64sig,jsData,cb){
        let data = encode(jsData,{sortKeys:true})
        let sig = Buffer.from(b64sig,'base64')
        let passed = await root.aegis.subtle.importKey('raw',pub,root.aegis.settings.ecdsa.pair,false,['verify'])
        .then((cKey)=> root.aegis.subtle.verify(root.aegis.settings.ecdsa.sign,cKey,sig,data))
        if(cb && cb instanceof Function) cb(passed)
        return passed
    }
}