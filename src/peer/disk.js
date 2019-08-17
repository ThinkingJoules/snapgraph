import lmdb from 'node-lmdb'
import fs from 'fs'
import {encode,decode} from '@msgpack/msgpack'
import {removeFromArr,notFound} from '../util'
export default function DiskStore(root){
    //LMDB for k/v and snap data
    //fs for 'files'
    //fs for 'git'
    this.getProps = function(nodeID){
        let ido = snapID(nodeID)
        if(ido.is === 'gossip'){
            return self.gossip.getProps(nodeID)
        }else{
            return self.data.getProps(nodeID)
        }
    }
    this.getProp = function(nodeID,pval){
        let ido = snapID(nodeID)
        if(ido.is === 'gossip'){
            return self.gossip.get({[nodeID]:[pval]})
        }else{
            return self.data.get({[nodeID]:[pval]})
        }
    }
    this.gossip = new LMDB({path:__dirname+'/../../GOSSIP_STORE'},{name:'gossip',create:true})
    this.data = new LMDB({path:__dirname+'/../../DATA_STORE'},{name:'data',create:true})
    this.peer = new LMDB({path:__dirname+'/../../PEER_CONFIG'},{name:'peer',create:true,keyIsBuffer:true}) // ? not sure
}
const NULL = String.fromCharCode(0)
const IS_STRINGIFY = String.fromCharCode(1)

const GUN_NODE = String.fromCharCode(17)
const IS_DATA = String.fromCharCode(18)
const IDX = String.fromCharCode(19)




const RS = String.fromCharCode(30)
const ESC = String.fromCharCode(27)



const enq = String.fromCharCode(5)
const tru = String.fromCharCode(6)

const gl = String.fromCharCode(26)
const prim = String.fromCharCode(2)
const gs = String.fromCharCode(29)
const us = String.fromCharCode(31)

const ENCODING = 'utf8'
function LMDB(envConfig,dbiConfig){
    this.env = new lmdb.Env()
    const self = this
    const {path} = envConfig

    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
    self.env.open(envConfig)
    this.dbi = self.env.openDbi(dbiConfig)
    this.putData = function(root,nodeID,putO,msgs,cb){ //assumes read already, so 'created' is handles outside of dbcall
        //puts = {soul:{[msgIDs]:[],putO:{gunPutObj(partial)}}
        let txn = self.env.beginTxn()
        try {
            putDataSoul(nodeID,putO)
            txn.commit()
            cb(false,true)
            sendAcks(false)
            return
        } catch (error) {
            console.log("ERROR IN TXN",error)
            txn.abort()
            cb(error,false)
            sendAcks(error)
        }
        function sendAcks(error){
            for (const msg of msgs) {
                msg.from.send({
                    'm': msg.m,
                    'r': msg.s,
                    'b':{
                        ok: !error,
                        err: (error === false) ? error : error.toString()
                    }
                   
                })
            }
            
        }
        function putDataSoul(nodeID,put){
            let soulKey = makeKey(nodeID)
            let rawPs = txn.getBinary(self.dbi,soulKey,{keyIsBuffer:true})
            let pvals = rawPs && btoj(rawPs) || []
            let now = Date.now()
            for (const p in put) {
                let vase = put[p]
                let addrKey = makeKey(nodeID,p)
                if(vase !== null && !(vase.e && now>vase.e)){
                    if(!pvals.includes(p))pvals.push(p)
                    // we assumed to read the value outside the txn to know it changed and merge result
                    // if we do cascade, we might want to do that within this txn...                  
                    let encodedVal = jtob(vase)
                    txn.putBinary(self.dbi,addrKey,encodedVal,{keyIsBuffer:true})
                }else{
                    self.removeExpired(addrKey)
                }
            }
            pvals.sort()//make lexical??
            txn.putBinary(self.dbi,soulKey,jtob(pvals),{keyIsBuffer:true})
        }
    }
    this.getProps = function(nodeID){
        let txn = self.env.beginTxn({readOnly:true})
        let props = btoj((txn.getBinary(self.dbi,makeKey(nodeID),{keyIsBuffer:true}) || jtob([])))
        txn.commit()
        return props
    }
    this.get = function(batch){
        let s = Date.now()
        let out = {} //{soul:{validPutObj}}
        let txn = self.env.beginTxn({readOnly:true})
        let fromDisk = 0
        try {
            for (const soul in batch) {
                const arrOfProps = batch[soul];
                if(!arrOfProps) arrOfProps= btoj((txn.getBinary(self.dbi,soulKey,{keyIsBuffer:true}) || jtob([]))) //want full nodes
                out[soul] = {}
                for (const prop of arrOfProps) {
                    fromDisk++
                    self.getProp(soul,prop,out,txn,s)
                }
            }
            console.log('RETRIEVED FROM DISK IN',(Date.now()-s)+'ms',{fromDisk})
            txn.commit()
            return out
        } catch (error) {//how to handle errors..
            txn.commit()
            return error
        }
    }
    this.getProp = function (soul,prop,msgPut,txn,now){
        //txn is readonly
        let addr = makeKey(soul,prop)
        let vase = btoj((txn.getBinary(self.dbi,addr,{keyIsBuffer:true}) || jtob({v:notFound})))//what to put for not found??
        if(now<exp){
            msgPut[soul][prop] = vase
        }
        console.log("REMOVING EXPIRED VALUE")
        self.removeExpired(addr)
    }
    this.getLength = function(soul){//todo
        let txn = self.env.beginTxn({ readOnly: true })
        let val = txn.getBinary(self.dbi,makeKey(soul,'length'),{keyIsBuffer:true})
        val = val && val.toString(ENCODING)*1 || 0
        txn.commit()
        return val
    }
    this.removeExpired = function(addrKey){
        //seperate txn, so gets can be readonly
        let txn = self.env.beginTxn()
        let exists = txn.getBinary(self.dbi,addrKey,{keyIsBuffer:true})
        if(exists !== null){
            txn.del(self.dbi,addrKey,{keyIsBuffer:true})
            removeFromArr(pvals,pvals.indexOf(p))
        }
    }
}
function jtob(jsVal){
    return Buffer.from(encode(jsVal))
}
function btoj(buff){
    return decode(new Uint8Array(buff.buffer,buff.byteOffset,buff.byteLength / Uint8Array.BYTES_PER_ELEMENT))
}
function makeKey(id,prop){
    //console.log('MAKING',soul,prop)
    id = String(id)
    if(prop!==undefined){
        return jtob(snapID(id).toFlatPack(p))
    }
    return jtob(id)
}