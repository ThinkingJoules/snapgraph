import lmdb from 'node-lmdb'
import fs from 'fs'
import {encode,decode} from '../util'
export default function DiskStore(root){
    this.env = new lmdb.Env()
    const self = this
    const envConfig = {path:root.opt.dataDir || __dirname+'/../../DATA_STORE'}
    const dbiConfig = {name:'data',create:true,keyIsBuffer:true}
    const {path} = envConfig

    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
    self.env.open(envConfig)
    this.dbi = self.env.openDbi(dbiConfig)
    this.rTxn = function(nameSpace){
        let txn = self.env.beginTxn({readOnly:true})
        return {
            get:get(txn),
            commit: function(){txn.commit()},
            abort: function(){txn.abort()}
        }
    }
    this.rwTxn = function(nameSpace){
        let txn = self.env.beginTxn()
        return {
            get:get(txn),
            put:put(txn),
            del:del(txn),
            commit: function(){txn.commit()},
            abort: function(){txn.abort()}
        }
    }
    function get(txn){
        return function(key,cb){
            return new Promise((res,rej)=>{
                let data
                try {
                    data = decode(txn.getBinary(self.dbi,key,{keyIsBuffer:true}))
                    res(data)
                    if(cb instanceof Function)cb(false,data)
                } catch (error) {
                    rej(error)
                    if(cb instanceof Function)cb(error)
                }
            })
            
        }
    }
    function put(txn){
        return function(key,value,cb){
            return new Promise((res,rej)=>{
                try {
                    txn.putBinary(self.dbi,key,encode(value),{keyIsBuffer:true})
                    res(true)
                    if(cb instanceof Function)cb(false,true)
                } catch (error) {
                    rej(error)
                    if(cb instanceof Function)cb(error)
                }
            })
            
        }
    }
    function del(txn){
        return function(key,cb){
            return new Promise((res,rej)=>{
                try {
                    txn.del(self.dbi,key,{keyIsBuffer:true})
                    res(true)
                    if(cb instanceof Function)cb(false,true)
                } catch (error) {
                    rej(error)
                    if(cb instanceof Function)cb(error)
                }
            })
            
        }
    }
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

function LMDB(envConfig,dbiConfig){
    this.env = new lmdb.Env()
    const self = this
    const {path} = envConfig

    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
    self.env.open(envConfig)
    this.dbi = self.env.openDbi(dbiConfig)
    this.rTxn = function(nameSpace,onerror){
        let txn = self.env.beginTxn({readOnly:true})
        return {
            onerror,
            get,
            commit: function(){txn.commit()},
            abort: function(){txn.abort()}
        }
    }
    this.rwTxn = function(nameSpace,onerror){
        let txn = self.env.beginTxn()
        return {
            onerror,
            get,
            put,
            del,
            commit: function(){txn.commit()},
            abort: function(){txn.abort()}
        }
    }
    function get(txn,key,cb){
        let data
        try {
            data = decode(txn.getBinary(self.dbi,key,{keyIsBuffer:true}))
            if(cb instanceof Function)cb(false,data)
        } catch (error) {
            if(cb instanceof Function)cb(error)
        }
    }
    function put(txn,key,value,cb){
        try {
            txn.putBinary(self.dbi,key,encode(value),{keyIsBuffer:true})
            if(cb instanceof Function)cb(false,true)
        } catch (error) {
            if(cb instanceof Function)cb(error)
        }
    }
    function del(txn,key,cb){
        try {
            txn.del(self.dbi,key,{keyIsBuffer:true})
            if(cb instanceof Function)cb(false,true)
        } catch (error) {
            if(cb instanceof Function)cb(error)
        }
    }
}

function LMDB_GOSSIP(envConfig){
    this.env = new lmdb.Env()
    const self = this
    const {path} = envConfig

    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
    self.bs = self.env.openDbi({name:'blockStore',create:true,keyIsBuffer:true})
    self.cs = self.env.openDbi({name:'chainStore',create:true,keyIsBuffer:true})
    self.pi = self.env.openDbi({name:'pubIdx',create:true,keyIsBuffer:true})
    self.ri = self.env.openDbi({name:'resourceIdx',create:true,keyIsBuffer:true})
    self.wkni = self.env.openDbi({name:'wknIdx',create:true,keyIsBuffer:true})

    self.env.open(envConfig)
    //getBlock,getChain,getPub,getResource,getWkn,putBlock

    //make some sort of storing api that we can reuse in memory,nodeDisk,browserDisk??
    //structures are all the same, but the actual storage api's are different
    this.get = function(dbi,key){
        let txn = self.env.beginTxn({readOnly:true})
        let out
        try {
            key = jtob(key)
            out = btoj(txn.getBinary(dbi,key,{keyIsBuffer:true}))
            txn.commit()
            return out
        } catch (error) {//how to handle errors..
            txn.commit()
            return error
        }
    }
    this.put = function(dbi,key,value){
        keyArr = Array.isArray(keyArr)?keyArr:[keyArr]
        let txn = self.env.beginTxn()
        try {
            key = jtob(key)
            txn.putBinary(dbi,key,jtob(value),{keyIsBuffer:true})
        } catch (error) {
            txn.commit()
            return error
        }
        txn.commit()
        return true
    }
}
function jtob(jsVal){
    return Buffer.from(encode(jsVal))//just encode?
}
function btoj(buff){
    return decode(new Uint8Array(buff.buffer,buff.byteOffset,buff.byteLength / Uint8Array.BYTES_PER_ELEMENT))//just decode?
}
function makeKey(id,prop){
    //console.log('MAKING',soul,prop)
    id = String(id)
    if(prop!==undefined){
        return jtob(snapID(id).toFlatPack(p))
    }
    return jtob(id)
}