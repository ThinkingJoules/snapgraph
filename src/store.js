import Disk from './peer/disk'
import BrowserStore from './browser/disk'
import { snapID,encode,decode } from './util'

export default function Store(root){
    let self = this
    this.mem = new Map()
    this.lru = new Map()
    this.disk = root.opt.persist && ((root.isPeer && new Disk(root)) || new BrowserStore(root)) || false
    this.getKey = function(key,cb,txn){
        let openedTxn
        txn = txn || this.disk && (openedTxn=true) && this.disk.rTxn()
        if(!(key instanceof Buffer)){throw new Error('Key must be a Buffer')}
        let val
        if(!(val = self.mem.get(key.toString('binary')))){
            if(txn)txn.get(key,(e,val)=>{cb.call(cb,e,val)})
            else cb.call(cb,false,undefined)
        }else{
            cb.call(cb,false,val)
        }
        if(txn && openedTxn){txn.commit()}
    }
    this.putKey = function(key,val,cb,txn,noMem,noDisk){
        let openedTxn
        txn = txn || this.disk && (openedTxn=true) && this.disk.rwTxn()
        if(!(key instanceof Buffer)){throw new Error('Key must be a Buffer')}
        if(!noMem)self.mem.set(key.toString('binary'),val)//when to evict from mem???
        if(txn && !noDisk)txn.put(key,val,cb)
        if(noDisk)cb.call(cb,false,true)
        if(txn && openedTxn){txn.commit()}
    }
    this.delKey = function(key,cb,txn){
        let openedTxn
        txn = txn || this.disk && (openedTxn=true) && this.disk.rwTxn()
        if(!(key instanceof Buffer)){throw new Error('Key must be a Buffer')}
        self.mem.delete(key.toString('binary'))
        if(txn)txn.del(key,cb)
        else cb.call(cb,false,true)
        if(txn && openedTxn){txn.commit()}
    }


    
    this.get = function(batch,cb){
        let tot = batch.size
        txn = txn || this.disk && (openedTxn=true) && this.disk.rTxn()
        const out = {}
        for (const [nodeID,pvals] of batch.entries()) {
            let ido = snapID(nodeID)
            if(!pvals){
                self.getKey(ido.binary,getThing(ido))
            }else{
                getThing(ido)(false,pvals)
            }
        }
        function getThing(ido){
            let idStr = encode(ido.binary,true)
            let node = out[idStr] || (out[idStr] = {})
            return function(e,pvals){
                let toGet = pvals.length
                const addVal = (p) => (e,val) => {
                    node[p]=val
                    if(!(toGet-=1) && !(tot-=1)){
                        cb.call(cb,out)
                        if(txn){txn.commit()}
                    }
                }
                for (const p of pvals) {
                    self.getKey(ido.toAddress(p),addVal(p))
                }
            }
        }
    }
    this.put = function(subGraph,cb){
        //not sure how we get here
        //will subgraph already be binary or will it be object?
        //if from external peer (browser) we are already shipping everything back (indexes, unique hashes, UP, souls, etc...)
        //if from internal, we just broadcast all things that wrote to disk to other peers that are keeping this info
        
        //so this function should return a subgraph of all things that did not give an error on writing
        //if everything passed, then it would be the same exact object. We should mutate object, since it would also change the mem graph automatically?
        
    }
    
}