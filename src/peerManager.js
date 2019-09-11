import {onMsg, onDisConn, Peer} from './wire'
import { setValue, signChallenge, getValue } from './util';
export default function PeerManager(root){
    const self = this
    let opt = root.opt

    const onM = onMsg(root)
    const onD = onDisConn(root)
    let env;
    if(root.isPeer)env = global
    else env = window
    env = env || {};
    root.WebSocket = root.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket;

    this.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
    this.peers = new Map()
    this.auth = function(peer){
        if(peer){//we are already auth'd and we have a new connection, sign it directly
            signChallenge(root,peer)
            return
        }
        for (const peer of peers.values()) {//we just auth'd ourselves, sign and send existing challenges
            if(peer.theirChallenge){
                signChallenge(root,peer)
            }
        }
    }
    this.signout = function(){//NOT DONE YET
        for (const peer of peers.values()) {
            let isInitial = peer.initialPeer && peer.id
            peer.wire.close()
            peer.connected = false
            root.on.peerDisconnect(peer)//need to setup subs at a new peer if we were relying on things from this peer
            if(isInitial){
                //want to reconnect so there are some peers
                setTimeout(()=>{
                    self.connect(peer.id)
                },2000)//let socket settle and close fully, could probably be less
            }
            //short of a page refresh, this is the best we can do
            //that way on reconnect we are no long auth'd
        }
    }
    this.connect = function(peer,intialPeer,cb){
        let wait = 2 * 1000;
        let doc = 'undefined' !== typeof document && document;
        if(!peer){ return }
        let ipAddr = (peer instanceof Peer) ? peer.id : peer
        let url = ipAddr.replace('http', 'ws');
        let wire = new root.WebSocket(url);
        if(!(peer instanceof Peer))peer = new Peer(wire,ipAddr,intialPeer)
        else peer.wire = wire
        if(!root.isPeer)peer.wire.binaryType = 'arraybuffer'
        wire.onclose = function(){//if whoever we are connecting to closes
            root.opt.debug('connection lost to peer: ',peer.id)
            onD(peer)
            reconnect(peer);
        };
        wire.onerror = function(error){
            root.opt.debug('wire.onerror',error)
            reconnect(peer);
        };
        wire.onopen = function(){
            self.peers.set(peer.id,peer)
            peer.connected = true
            root.router.send.intro(peer)
            root.router.send.challenge(peer)
            if(cb && cb instanceof Function)cb(peer)//hook so we know when this peer is connected??
        }
        wire.onmessage = function(raw){
            onM((raw.data || raw),peer)
        };
        return wire
        function reconnect(peer){
            if(root.isPeer)return
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
    this.setPeerState = function(ip,opts){
        //opts = {owns:{baseID:pubKey attemps adds, false removes},connected,pub,verified,hasRoot}
        let peer
        if(!(peer = self.all.get(ip))){
            peer = self.all.set(ip,new Peer(false,ip,false)).get(ip)
        }
        for (const opt in opts) {
            const value = opts[opt];
            if(opt === 'owns'){
                value = value || {}
                for (const baseID in value) {
                    if(peer.pub && peer.pub === value[baseID]){
                        peer.owns.add(b)
                    }else{
                        peer.owns.delete(baseID)
                    }
                }
            }else{
                peer[opt] = value
            }
        }
        return peer
    }
    this.getBestPeers = function(howMany){
        //used on gets
        howMany = howMany || 1
        let all = [...self.peers.values()]
        if(howMany > all.length)howMany = all.length
        return all.filter(x=>x.isPeer).sort((a,b)=>a.ping-b.ping).slice(0,howMany)//superpeers sorted by ping, these should have gossip info on them, treated equally
    }
    this.getNonClients = function(){
        //used on certain updates
        //gets all connected peers that are not clients
        return [...self.peers.values()].filter(x=>x.isPeer&&x.connected)
    }
    this.getConnectedNeedingUpdate = function(nodeID,pval){
        //updates on changes locally that need to be sent to others listening
        //need to make sure they didn't just send us the update? Probably not job of this fn
        let all = new Set() //set because we are going to have to use set operation to remove ones that sent us the update
        for (const {wants} of self.peers.values()) {
            let ps
            if(wants && (ps=wants[nodeID]) && ps.has(pval)){
                all.add(peer)
            }
        }
        return all
    } 
}
