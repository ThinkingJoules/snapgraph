import {encode,decode} from '@msgpack/msgpack'
export const onDisConn = (root) =>(peer)=>{
    if(peer && peer.wire && peer.wire.close)peer.wire.close()
    peer.connected = false
    root.on.peerDisconnect(peer)
}
export const onMsg = (root) => (raw,peer)=>{
    if(!raw){ return }
    let msg
    try {
        msg = decode(raw)
        if(msg.e){
            if((peer.drift+msg.e+100) <= Date.now()){
                root.opt.debug('Message expired, ignoring:',msg)
                return 
            }//if we are within 100ms, then don't bother as our response will probably not make it back in time.
        }
        if(msg.ack && msg.s)peer.send({m:'ack',r:msg.s,b:Date.now()})
        msg.from = peer
        root.on.in(msg); //start of the in chain
    } catch (error) {
        root.opt.debug('wire.onMsg Error: ',error)
    }
}
export function Peer(socket,pid,initialPeer){
    this.wire = socket
    this.id = pid
    this.ping = 1000
    this.challenge = false //our challenge to them for proof
    this.theirChallenge = false //they are challenging us, if we are not signed in yet, it waits here for our response
    this.pub = false //their pubkey once they answer our challenge?? //CHAIN ID
    this.verified = false //this is if their pub is valid and authed
    this.connected = false //all peers are in the same list now...
    this.isPeer = false //server or browser
    this.hasRoot = false //we are exchanging information with 100% trust, we own both connections (according to sigs + gossip)
    this.owns = new Set()//set of baseID's that this IP Owner === BaseIDOwners.includes(IP Owner)
    this.pendingMsgs = []//for handling things that are waiting for a state change?
    this.initialPeer = initialPeer || false
    this.drift = 0
    this.gossip = new Map() //batching gossip by peer
    this.send = function(msg){
        let s = {m:msg.m,s:msg.s,r:msg.r}
        msg = encode(msg,{sortKeys:true})
        let self = this
        if(self.connected && self.wire.send instanceof Function){
            if(!['ack','ping'].includes(s.m))console.log('sent',s)
            self.wire.send(msg);
        }
    }
}