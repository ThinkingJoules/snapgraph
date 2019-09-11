import {getValue,setValue,rand} from './util'
import {encode,decode} from '@msgpack/msgpack'
import WebCrypto from 'node-webcrypto-ossl'
import crypto from 'crypto'
import atob from 'atob'
import btoa from 'btoa'

const isNode=new Function("try {return this===global;}catch(e){return false;}")()
export default function Aegis(root){
    const aegis = this
    aegis.crypto = crypto || (!isNode && (window.msCrypto || window.webkitCrypto || window.mozCrypto))
    aegis.subtle = (aegis.crypto.subtle || aegis.crypto.webkitSubtle) || (isNode && new WebCrypto().subtle)
    aegis.random = (len) => Buffer.from(aegis.crypto.getRandomValues(new Uint8Array(Buffer.alloc(len))))
    const util = aegis.util = {}
    const s = aegis.settings = {};
    s.pbkdf2 = {hash: 'SHA-256', iter: 100000, ks: 64};
    s.ecdsa = {
        pair: {name: 'ECDSA', namedCurve: 'P-256'},
        sign: {name: 'ECDSA', hash: {name: 'SHA-256'}}
    };
    s.ecdh = {name: 'ECDH', namedCurve: 'P-256'};
    
    // This creates Web Cryptography API compliant JWK for sign/verify purposes
    util.pairToJwk = function(pair){  // d === priv
        let {pub,priv:d} = pair
        pub = pub.split('.');
        const x = pub[0], y = pub[1];
        const jwk = {kty: "EC", crv: "P-256", x: x, y: y, ext: true};
        jwk.key_ops = d ? ['sign'] : ['verify'];
        if(d){ jwk.d = d }
        return jwk;
    };
    util.jwkToPair = function(jwk){
        const keys = {}
        const {x,y,d} = jwk
        keys.pub = x+'.'+y
        if(d){ keys.priv = d }
        return keys;
    }    
    aegis.pair = async function(){
        return await aegis.subtle.generateKey(s.ecdsa.pair, true, [ 'sign', 'verify' ])
        .then(async (keys) => {
            let k = {}
            k.priv = Buffer.from(await aegis.subtle.exportKey('pkcs8', keys.privateKey))
            k.pub = Buffer.from(await aegis.subtle.exportKey('raw', keys.publicKey))
            return k 
        })    
    }

    util.rawPubToJwkPub = async function(raw){
        return await aegis.subtle.importKey('raw', raw, {name: 'ECDSA', namedCurve: 'P-256'}, true, ['verify'])
        .then(async(cKey)=>{ return aegis.jwkToPair(await aegis.subtle.exportKey('jwk', cKey)).pub})
    }

    aegis.hash = async function(byteArray){
        return Buffer.from(await aegis.subtle.digest({name:'SHA-256'},byteArray))
    }
    aegis.aes = async function(key,salt){//??? Not sure... 
        const combo = Buffer.concat([Buffer.from(key),((salt && Buffer.from(salt)) || aegis.random(8))])
        const hash = await aegis.subtle.digest({name:'SHA-256'},combo)
        return await aegis.subtle.importKey('raw', new Uint8Array(hash), 'AES-GCM', false, ['encrypt', 'decrypt'])
    }
    aegis.importSignKey = async function(keyBits){
        return await aegis.subtle.importKey('pkcs8',keyBits,s.ecdsa.pair,false,['sign'])
    }
    aegis.extend = async function(jsThing,entropy,opt){
        //entropy is string, but could be a buffer already
        //jsThing can be string (password), but could also be object, array, etc, as it will be encoded in bits
        //this returns bits for a key
        opt = opt || {};
        let salt = entropy || opt.salt
        salt = (salt && Buffer.from(salt)) || aegis.random(16)
        let srcBits = encode(jsThing,{sortKeys:true})
        let keyBits = await aegis.subtle.importKey('raw', srcBits, {name:'PBKDF2'}, false, ['deriveBits'])
        .then(async(key) =>{
            console.log(key)
            return Buffer.from(await aegis.subtle.deriveBits({
                name: 'PBKDF2',
                iterations: opt.iterations || 250000,
                salt: Buffer.from(salt),
                hash: {name: 'SHA-256'},
              }, key, 256))
        })
        return keyBits
    }
    aegis.encrypt = async function(payload,keyBits,cb){
        let u
        if(u === payload){ console.warn('`undefined` not allowed. VALUE CHANGED TO `null`!!!') }
        let encPayload = encode(payload,{sortKeys:true})
        let iv = aegis.random(12)
        let ct = await aegis.subtle.importKey('raw', keyBits, 'AES-GCM', false, ['encrypt'])
        .then((aes) => aegis.subtle.encrypt(
            { name: 'AES-GCM', iv}, aes, encPayload)
        );
        let r = {
          ct:Buffer.from(ct),
          iv,
        }
        if(cb && cb instanceof Function)cb(r)
        return r
    }
    aegis.decrypt = async function(encObj,keyBits,cb){
        let {ct,iv} = encObj
        let pt =  await aegis.subtle.importKey('raw', keyBits, 'AES-GCM', false, ['decrypt'])
        .then((aes) => aegis.subtle.decrypt({ name: 'AES-GCM', iv}, aes, ct));
        let plainJs = decode(pt)
        if(cb && cb instanceof Function)cb(plainJs)
        return plainJs
    }
    
    aegis.extendEncrypt = async function(jsTarget,passphrase){
        let s = aegis.random(16)
        let encObj = await aegis.extend(passphrase,s)
        .then(async(keyBits) =>{
            return await aegis.encrypt(jsTarget,keyBits)
        })
        encObj.s = s
        return encObj

    }
    aegis.extendDecrypt = async function(encObj,passphrase){
        let s = encObj.s
        let jsThing = await aegis.extend(passphrase,s)
        .then(async(keyBits) =>{
            return Buffer.from(await aegis.decrypt(encObj,keyBits))
        })
        return jsThing
    }
    
    root.verify = async function(pub,b64sig,jsData,cb){
        let data = encode(jsData,{sortKeys:true})
        let sig = Buffer.from(b64sig,'base64')
        let passed = await root.aegis.subtle.importKey('raw',pub,root.aegis.settings.ecdsa.pair,false,['verify'])
        .then((cKey)=> root.aegis.subtle.verify(root.aegis.settings.ecdsa.sign,cKey,sig,data))
        if(cb && cb instanceof Function) cb(passed)
        return passed
    }

    //not sure where to put this, its a general util with a dependencies(btoa,atob,encode,decode)
    root.util.jsToStr = jsToStr
    root.util.strToJs = strToJs
    root.util.outputHeaderedStr = outputHeaderedStr
    root.util.parseHeaderedStr = parseHeaderedStr
    function jsToStr(js) {
        return btoa(String.fromCharCode.apply(null, encode(js,{sortKeys:true})))
    }
    function strToJs(str){
        str = atob(str)
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
          bufView[i] = str.charCodeAt(i);
        }
        return decode(bufView)
    }
    function outputHeaderedStr(jsTarget,what){
        const exportedAsBase64 = root.util.jsToStr(jsTarget)
        return `-----BEGIN ${what}-----\n${exportedAsBase64}\n-----END ${what}-----`;
    }
    function parseHeaderedStr(headeredString){
        //returns what was in the label 'what' and the contents
        let r = /(?:-----BEGIN )(.+)(?:-----)/
        let what = headeredString.match(r)[1]
        let content = headeredString.split("\n")[1]
        return {what,content}
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

function ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}