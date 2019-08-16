import {onMsg} from './wire'
import { setValue, signChallenge, getValue } from './util';
export default function PeerManager(root){
    const self = this
    let opt = root.opt

    const onM = onMsg(root)
    let env;
    if(root.isNode)env = global
    else env = window
    env = env || {};
    this.websocket = root.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket;

    this.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
    this.peers = new Map()
    this.verifyPeer = function(ido,node){
        //should be !*PUB> id
        //node should be {ipAddress:validation}
        //has already been validated, take as truth
        let {pub} = ido
        let nowVerified = new Set(),peer
        for (const ip in node) {
            if((peer=self.peers.get(ip)) && (peer.pub && peer.pub === pub)){
                peer.verified = true
                nowVerified.add(peer.id)
            }
        }
        if(nowVerified.length)root.on.verifiedPeer(nowVerified)

    }
    this.auth = function(peer){
        if(peer){
            signChallenge(root,peer)
            return
        }
        for (const peer of peers.values()) {
            if(peer.theirChallenge){
                signChallenge(root,peer)
            }
        }
    }
    this.signout = function(){
        for (const peer of peers.values()) {
            peer.wire.close()
            self.peers.delete(peer.id)
        }
    }
    this.connect = function(ipAddr,cb){
        let wait = 2 * 1000;
        let doc = 'undefined' !== typeof document && document;
        if(!ipAddr){ return }
        let url = ipAddr.replace('http', 'ws');
        let wire = new self.websocket(url);
        let peer = new Peer(wire,ipAddr)
        if(!root.isNode)peer.wire.binaryType = 'arraybuffer'
        peer.challenge = false
        peer.pub = false
        peer.has = {}
        wire.onclose = function(){//if whoever we are connecting to closes
            root.opt.debug('connection lost to peer: ',peer.id)
            //if this peer is supplying a resource that we are currently looking for
            //then we need to see if we are still connected to it with another peer
            //or if we have additional peers specified 
            if(peer && peer.wire && peer.wire.close)peer.wire.close()
            root.peers.delete(peer.id)
            reconnect(peer);
        };
        wire.onerror = function(error){
            root.opt.debug('wire.onerror',error)
            reconnect(peer);
        };
        wire.onopen = function(){
            self.peers.set(peer.id,peer)
            root.router.send.intro(peer)
            root.router.send.auth(peer)
            if(cb && cb instanceof Function)cb(peer)//hook so we know when this peer is connected??
        }
        wire.onmessage = function(raw){
            onM((raw.data || raw),peer)
        };
        return wire
        function reconnect(peer){
            if(root.isNode)return
            root.opt.debug('attempting reconnect')
            clearTimeout(peer.defer);
            if(doc && peer.retry <= 0){ return } 
            peer.retry = (peer.retry || opt.retry || 60) - 1;
            peer.defer = setTimeout(function to(){
                if(doc && doc.hidden){ return setTimeout(to,wait) }
                self.connect(peer.id);
            }, wait);
        }
    }
    this.resources = {} //{baseID: Set{pubOwners}}
    this.pendingMsgs = {} //{baseID: [msg,msg..]}
    this.addResource = function(ido,node){
        root.memStore.subNode(ido.toNodeID(),self.updateResource)
        //id should be ~!baseID node
        //node should be {ipAddress: {v:pubKeyBaseOwner}}
        //has already been validated, take as truth
        let {b} = ido,peer
        self.resources[b] = self.resources[b] || new Set() 
        for (const ip in node) {
            let pubOwner = node[ip].v
            if(pubOwner !== null)self.resources[b].add(pubOwner)
            if((peer=root.mesh.peers.get(ip))){
                if(pubOwner === null && peer.owns){peer.owns.delete(b);continue}
                if(peer.pub && peer.pub === pubOwner){
                    peer.owns = peer.owns || new Set()
                    peer.owns.add(b)
                }
            }
        }
        self.shuffleResource()
    }
    this.updateResource = function(ido,node){

    }
    this.shuffle = function(){
        //runs on every new connection
        //go through all peers and categorize them:
        let all = [...self.peers.values()]
        self.isPeer = all.filter(x=>x.isPeer).sort((a,b)=>a.ping-b.ping)//superpeers sorted by ping, these should have gossip info on them, treated equally
        self.isClient = new Map([...self.peers.entries()].filter(x=>!x[1].isPeer))
        self.ours = all.filter(x=>x.hasRoot).sort((a,b)=>a.ping-b.ping)
    }
    this.shuffleResource = function(){
        let res = {}
        for (const b in self.resources) {
            const owners = self.resources[b];
            res[b] = {}
                
        }
    }
}
