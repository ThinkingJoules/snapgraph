import {onMsg} from './wire'
import { setValue, signChallenge } from './util';
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
        let temp,peer
        for (const ip in node) {
            if((peer=self.peers.get(ip)) && (peer.pub && peer.pub === pub)){
                peer.verified = true
                temp = true
            }
        }
        if(temp)root.on.verifiedPeer()

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
    this.connect = function(ipAddr,cb,resource){
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
            if(cb && cb instanceof Function)cb(peer)//hook so we know when this peer is connected
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
    this.shuffle = function(){
        //runs on every new connection
        //go through all peers and categorize them:
        let all = [...self.peers.values()]
        self.isPeer = all.filter(x=>x.isPeer).sort((a,b)=>a.ping-b.ping)//superpeers sorted by ping, these should have gossip info on them, treated equally
        self.isClient = new Map([...self.peers.entries()].filter(x=>!x[1].isPeer))
        self.ours = all.filter(x=>x.hasRoot).sort((a,b)=>a.ping-b.ping)
    }
}
