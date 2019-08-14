import {encode,decode} from '@msgpack/msgpack'
import { encTime, decTime } from './util';

export const onMsg = (root) => (raw,peer)=>{
    if(!raw){ return }
    let msg
    try {
        msg = decode(raw)
        if(msg.e){
            console.log(msg.e)
            msg.e = decTime(msg.e)
            if((msg.e+100) <= Date.now()){
                root.opt.debug('Message expired, ignoring:',msg)
                return 
            }//if we are within 100ms, then don't bother as our response will probably not make it back in time.
        }
        if(msg.ack && msg.s)peer.send({m:'ack',r:msg.s})
        msg.from = peer
        root.on.in(msg); //start of the in chain
    } catch (error) {
        root.opt.debug('wire.onMsg Error: '+error.toString())
    }
}
export function Peer(socket,pid){
    this.wire = socket
    this.id = pid
    this.send = function(msg){
        console.log('sending')
        if(msg.e)msg.e = encTime(msg.e)
        console.log('e: ',msg.e)
        msg = encode(msg)
        let self = this
        if(self.wire.send instanceof Function){
            console.log('sent')
            self.wire.send(msg);
        }
    }
}