import {encode,decode} from './util'
import pako from 'pako'
export const onDisConn = (root) =>(peer)=>{
    if(peer && peer.wire && peer.wire.close)peer.wire.close()
    peer.connected = false
    root.event.emit('peerDisconnect',peer)
}
export const onMsg = (root) => (raw,peer)=>{
    if(!raw){ return }
    let msg
    try {
        raw = Buffer.from(raw,raw.byteOffset,raw.length)
        let decomp = pako.inflate(raw)
        msg = decode(decomp)
        let expire = msg.pop()
        if(expire && (peer.drift+expire+100) <= Date.now()){
            root.opt.debug('Message expired, ignoring:',msg)
            return
        }
        msg.from = peer
        root.event.emit('in',msg); //start of the in chain
    } catch (error) {
        root.opt.debug('wire.onMsg Error: ',error)
    }
}
export function Peer(socket,pid,IP,initialPeer){
    let self = this
    this.wire = socket
    this.id = pid
    this.ipAddr = IP
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
        let s = {dir:msg[0],type:msg[1],id:msg[2]}
        let enc = encode(msg)
        msg = pako.deflate(enc,{level:1})
        if(self.connected && self.wire.send instanceof Function){
            if(!['ack','ping'].includes(s.m))console.log('sent',s,msg.length)
            self.wire.send(msg);
        }
    }
}