import { getBaseLog, encode, decode, toBuffer, buffUtil, BitID, buffToUint, uintToBuff, hammingWt, outputHeaderedStr, parseHeaderedStr } from './util';
import EventEmitter from 'eventemitter3';

export default function Gossip(root){
    //this will be the inbetween of the crypto and outer APIs
    //this is where identity things will happen
    //anything to do with the user chain, authorizing the snap instance
    //such as adding to the curr
    const gossip = this
    gossip.stmtStore = new Map() //key is Stmt.id, value is stmt object
    gossip.people = new Map() //key is person.id, value is person
    gossip.hashStore = new Map() //key is BitID(stmt.hash), value is Set(stmt's)
    gossip.nullHash = (async function(){
        return Buffer.from(await root.aegis.hash(encode(null)))
    })()
    gossip.getStmtType = function(val){
        let types = [//these are the statement types and alias
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
        return select
    }
    gossip.verifyStmtBody = function(st,body){
        if(body == undefined)throw new Error('Body must have a non-undefined value')
        switch (st) {
            case 0:{
                if(!body instanceof Uint8Array || body.length !== 65)throw new Error('Must provide 65 Bytes for your first public key')
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
    gossip.Stmt = function(header,body,workTarget){
        //if given header this is an 'incoming' stmt, must attempt to put it with a person, and verify it
        //else we are creating a new statement, and need to use the stmt.set(key,value) method
        //stmt 2 we need to set cid,st,hash,body
        //stmt 4 we need to set cid,st,hash
        //everything else set cid,st,body
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
                gossip.verifyStmtBody(s.st,s.body)
                gossip.stmtStore.set(s.id,s)
                return s //what this returns to, will decide what needs to happen with it (rebroadcast, )
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
        add.once('st',function(st){
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
            for (const [key,len,bytesToVal,valToBytes] of HEADER_ORDER) {
                h = h.concat(valToBytes(key == 'sig'?sig:s[key]))
            }
            return Buffer.from(h)
        }
        s.transform = function(){
            return [s.header,s.body]
        }
    }
    gossip.Person = function (cid,restore){//can only run constructor one time
        let they = this
    
        they.id = BitID(cid)
        they.proof = null //genesis block, to prove their cid is random
        they.say = [] //only added to from saidStmt, set of stmt objects
        they.tail = null //altered from adding by saidStmt, should be the prevSig of the last valid block on the chain
        they.peers = new Set() //altered from adding by saidStm
        they.pubs = new Map() //altered from adding by saidStm, key of BitID(uintToBuff(stmt.pub)), value of Pub bytes
        they.maxWork = 0
        they.cummWork = 0
        they.pin = restore[0] || false //set from a 'follow' api call, will not prune regardless of dist
        let where = (root.peer.isPeer && root.peer.id) || root.state.anchor
        they.dist = restore[1] || (they.id && where) ? root.monarch.distance(where,they.id) : Infinity
        they.add = new EventEmitter()
        they.add.once('genesis',function(stmt){

        })
        they.add.on('addKey',function(stmt){
            let num = Math.max(...they.pubs.keys()) + 1
            they.pubs.set(num,[stmt.ts,stmt.body])
        })
        they.addStmt = async function(stmt){
            if(they.say.includes(stmt))return
            they.say.push(stmt)
            they.say.sort((a,b) =>a.ts-b.ts)
            if(!they.inloop)they.checkStmts()
        }
        they.checkStmts = async function(){
            they.inloop = true
            let idx = they.say.indexOf(they.tail)
            let prev = they.say[idx] || null
            let said = they.say[idx+1]
            if(await said.verify(prev && prev.sig)){
                s.set('prev',prev)
                return await they.checkStmts()
            }
            they.inloop = false
            return
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
        us.addRL = async function(name){

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