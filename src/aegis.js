import {getValue,setValue,rand} from './util'
import {encode,decode} from '@msgpack/msgpack'

import {TextEncoder, TextDecoder} from 'text-encoding'
import WebCrypto from 'node-webcrypto-ossl'
import crypto from 'crypto'
import atob from 'atob'
import btoa from 'btoa'

const isNode=new Function("try {return this===global;}catch(e){return false;}")()
export default function Aegis(snap){
    let root = snap._
    const aegis = this
    aegis.crypto = crypto || (!isNode && (window.msCrypto || window.webkitCrypto || window.mozCrypto))
    aegis.subtle = (aegis.crypto.subtle || aegis.crypto.webkitSubtle) || (isNode && new WebCrypto().subtle)
    aegis.random = (len) => Buffer.from(aegis.crypto.getRandomValues(new Uint8Array(Buffer.alloc(len))))
    
    const s = aegis.settings = {};
    s.pbkdf2 = {hash: 'SHA-256', iter: 100000, ks: 64};
    s.ecdsa = {
        pair: {name: 'ECDSA', namedCurve: 'P-256'},
        sign: {name: 'ECDSA', hash: {name: 'SHA-256'}}
    };
    s.ecdh = {name: 'ECDH', namedCurve: 'P-256'};
    
    // This creates Web Cryptography API compliant JWK for sign/verify purposes
    aegis.pairToJwk = function(pair,ecdh){  // d === priv
        let {pub,priv:d} = pair
        pub = pub.split('.');
        const x = pub[0], y = pub[1];
        const jwk = {kty: "EC", crv: "P-256", x: x, y: y, ext: true};
        jwk.key_ops = d ? ['sign'] : ['verify'];
        if(d){ jwk.d = d }
        return jwk;
    };
    aegis.jwkToPair = function(jwk){
        const keys = {}
        const {x,y,d} = jwk
        keys.pub = x+'.'+y
        if(d){ keys.priv = d }
        return keys;
    }
    
    
    aegis.pair = async function(cb, opts){
        try {
            var sa = await aegis.subtle.generateKey(s.ecdsa.pair, true, [ 'sign', 'verify' ])
            .then(async (keys) => {
                return await aegis.subtle.exportKey('jwk', keys.privateKey)    
            })
            var dh = await aegis.subtle.generateKey(s.ecdh, true, ['deriveKey'])
            .then(async (keys) => {
               return await aegis.subtle.exportKey('jwk', keys.privateKey)
            })
            var r = {a:aegis.jwkToPair(sa), e:aegis.jwkToPair(dh)}
            if(cb){ try{ cb(r) }catch(e){console.log(e)} }
            return r;
          } catch(e) {
            console.log(e);
            if(cb){ cb(e) }
            return;
          }
    }
    function js2str(js) {
        return btoa(String.fromCharCode.apply(null, encode(js)))
    }
    function strTojs(str){
        str = atob(str)
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
          bufView[i] = str.charCodeAt(i);
        }
        return decode(bufView)
    }
    aegis.hash = async function(value,cb){
        let enc = encode(value)
        let digest = await aegis.subtle.digest({name:'SHA-256'},enc)
        if(cb && cb instanceof Function)cb(digest)
        return digest
    }
    aegis.aes = async function(key,salt){//??? Not sure... 
        const combo = Buffer.concat([Buffer.from(key),((salt && Buffer.from(salt)) || aegis.random(8))])
        const hash = await aegis.subtle.digest({name:'SHA-256'},combo)
        return await aegis.subtle.importKey('raw', new Uint8Array(hash), 'AES-GCM', false, ['encrypt', 'decrypt'])
    }
    aegis.extend = async function(jsThing,entropy,cb,opt){
        //entropy is string
        //jsThing can be string (password), but could also be object, array, etc, as it will be encoded in bits
        //passphrase+salt+pbkdf2 = secure-er bits
        //uses pbkdf2 to derive output
        var opt = opt || {};
        var salt = entropy || opt.salt || rand(64)
        let srcBits = encode(jsThing,{sortKeys:true})
        var keyBits = await aegis.subtle.importKey('raw', srcBits, {name:'PBKDF2'}, false, ['deriveBits'])
        .then(async(key) =>{
            console.log(key)
            return await aegis.subtle.deriveBits({
                name: 'PBKDF2',
                iterations: opt.iterations || 250000,
                salt: Buffer.from(salt),
                hash: {name: 'SHA-256'},
              }, key, 256)
        })
        if(cb && cb instanceof Function)cb(keyBits)
        return keyBits
    }
    aegis.encrypt = async function(payload,passphrase,cb){
        let u
        if(u === payload){ console.warn('`undefined` not allowed. VALUE CHANGED TO `null`!!!') }
        var encPayload = encode(payload)
        var rand = {s: aegis.random(9), iv: aegis.random(15)}; // consider making this 9 and 15 or 18 or 12 to reduce == padding.
        var ct = await aegis.aes(passphrase, rand.s)
        .then((aes) => aegis.subtle.encrypt(
            { name: 'AES-GCM', iv: new Uint8Array(rand.iv)}, aes, encPayload)
        );
        var r = {
          ct:Buffer.from(ct),
          iv: rand.iv,
          s: rand.s
        }
        let b64 = js2str(r)
        if(cb && cb instanceof Function)cb(b64)
        return b64
    }
    aegis.decrypt = async function(b64Str,passphrase,cb){
        let {ct,iv,s} = strTojs(b64Str)      
        var pt = await aegis.aes(passphrase, s)
        .then((aes) => aegis.subtle.decrypt({ name: 'AES-GCM', iv}, aes, ct));
        var plainJs = decode(pt)
        if(cb && cb instanceof Function)cb(plainJs)
        return plainJs
    }
    snap.pow = async function(jsTarget,cb,opt){
        let s = Date.now()
        if(jsTarget == undefined)throw new Error("Must specify something to prove work was performed on")
        opt = opt || {}
        const trgt = opt.target&&Buffer.from(opt.target) || Buffer.from([0,0,128])//change to a bit value, 256 = [0], 284 = [0,128], 640 = [0,0,128]
        var hash = await aegis.hash(jsTarget)
        var cKey = await aegis.subtle.importKey('raw', aegis.random(16), 'AES-CBC', true, ['encrypt', 'decrypt'])
        let ct,iv,rounds = 0
        while (true) {
            rounds++
            iv = aegis.random(16)
            ct = Buffer.from(await aegis.subtle.encrypt({ name: 'AES-CBC', iv}, cKey, hash))
            if(Buffer.compare(ct,trgt) === -1){
                break
            }
        }
        let fin = Date.now()-s
        var proof = {
            pt:encode(jsTarget),
            ct,
            iv,
            key: Buffer.from(await aegis.subtle.exportKey('raw',cKey))
        }
        let b64 = js2str(proof)
        console.log({proof},{fin,rounds,per:fin/rounds},{b64})
        if(cb && cb instanceof Function)cb(proof)
        return proof
    }
    snap.test = function(){
        snap.create(function(strPair){
            snap.auth(strPair,function(){
                root.user.sign({abc:true,bob:'isBob'},function(sig){

                    root.verify(root.user.pub,sig,{bob:'isBoba', abc: true},function(passed){
                        console.log({passed})
                    })
                })
            })
        })
    }
    snap.extend = function(password){
        aegis.extend(password,false,function(keyBits){
            aegis.pair(function(newPair){
                console.log({newPair})
                aegis.encrypt(newPair,keyBits,function(ct){
                    aegis.decrypt(ct,keyBits,function(pt){
                        console.log({pt})
                    })
                })

            })
        })
    }

    snap.create = function(cb){
        aegis.pair(function(pair1){
            let jsenc = js2str(pair1)
            cb(jsenc)
        })
    }
    snap.rotate = function(curHead,newKeys){
        //this is in place of signin/auth
    
    }
    
    snap.leave = function(){
        let snap = this
        let root = snap._
        root.on.signout()
    }
    snap.auth = async function(encStr,cb){
        let {a,e} = strTojs(encStr)
        let signPair = aegis.pairToJwk(a)
        let signKey = await aegis.subtle.importKey('jwk',signPair,s.ecdsa.pair,true,["sign"])
        let user = root.user = {pub:a.pub}
        user.sign = sign(s.ecdsa.sign,signKey)
        user.encrypt = encrypt(e)
        user.decrypt = decrypt(e)
        if(cb && cb instanceof Function) cb(user)
        return user
    }

    function sign(algo,key){
        return async function(data,cb){
            var buff = encode(data,{sortKeys:true});
            const sig = await aegis.subtle.sign(algo,key,buff)
            let b64 = Buffer.from(sig,'binary').toString('base64')
            if(cb && cb instanceof Function) cb(b64)
            return b64
        }
    }
    function decrypt(ePair){
        return async function(ctB64,cb){
            return await aegis.decrypt(ctB64,ePair.priv,cb)
        }
    }
    function encrypt(ePair){
        return async function(jsTarget,cb){
            return await aegis.encrypt(jsTarget,ePair.priv,cb)
        }
    }
    root.verify = async function(pub,b64sig,jsData,cb){
        let data = encode(jsData,{sortKeys:true})
        let sig = Buffer.from(b64sig,'base64')
        let passed = await aegis.subtle.importKey('jwk',aegis.pairToJwk({pub}),s.ecdsa.pair,false,['verify'])
        .then((key)=> aegis.subtle.verify(s.ecdsa.sign,key,sig,data))
        if(cb && cb instanceof Function) cb(passed)
        return passed
    }
}




function str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
}
function pemToKey(pem,isPub){
    let type = isPub ? 'PUBLIC' : 'PRIVATE'
    const pemHeader = `-----BEGIN ${type} KEY-----`;
    const pemFooter = `-----END ${type} KEY-----`;
    const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length);
    // base64 decode the string to get the binary data
    const binaryDerString = atob(pemContents);
    // convert from a binary string to an ArrayBuffer
    return str2ab(binaryDerString);
}
function keyToPem(key,isPub){
    let type = isPub ? 'PUBLIC' : 'PRIVATE'
    const exportedAsString = ab2str(key);
    const exportedAsBase64 = btoa(exportedAsString);
    return `-----BEGIN ${type} KEY-----\n${exportedAsBase64}\n-----END ${type} KEY-----`;
}
function ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}