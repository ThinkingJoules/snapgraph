import { snapID } from "./util";

export default function addListeners (root){
    let on = root.on = {}
    on.auth = function(){
        root.mesh.auth()
    }
    on.pairwise = function(peer){
        if(peer.pub === root.user.pub){
            peer.hasRoot = true
            root.mesh.shuffle()
        }
    }
    on.signout = function(){
        delete root.sign
        delete root.user
        root.mesh.signout()
        //really need to force refresh the page
        //or disconnect all peers, as this peer is no longer authorized to interact with them.
    }
    on.verifiedPeer = function(){
        let msgs,peers
        for (const baseID in root.resources) {
            const {connected,pending} = self.resources[baseID];
            if((msgs=Object.values(pending)).length && (peers=Object.values(connected).filter(x=>x.verified).sort((a,b)=>a.ping-b.ping)).length){
                root.opt.debug('Sending pending msgs to peer[0]',{msgs,peers})
                for (const msg of msgs) {
                    if(peers[0] && peers[0].send)peers[0].send(msg)
                }
            }
        }
    }
    on.askResponse = function(msg){//reply from our .ask  or an incoming say
        let {hasRoot} = msg.from
        for (const id in msg.b) {
            let ido = snapID(id)
            const obj = msg.b[id];
            if(!hasRoot){//validate sig/data
                for (const p in obj) {
                    const {v,sig} = obj[p];
                }
            }
            let cur = root.memStore.get(id) || {}
            let diff = root.diff(cur,obj)
            if(diff)root.memStore.onChange(id,diff)//store changes and fire emit out to other peers
        }
    }
    on.in = function(msg){
        let {m,s,r} = msg
        let temp
        root.opt.debug('incoming msg',{m,s,r})
        if(s && (temp = root.router.recv[m])){//incoming request
            temp(msg)
        }else if (r && (temp = root.router.pending.get(r))){//incoming response to a previously sent message
            if(m === 'ack'){
                temp.on('ack',msg.ack)//only send the body to the tracker?
            }else if(m === 'error'){
                temp.on('error',msg.b)
            }else{
                temp.on('reply',msg)//only send the body to the tracker?
            }
        }else if (r && m == 'ask'){//msg expired, but we can merge this to graph as an update??
            //maybe this is how subscrive vs retrieve works?
            //we don't expire messages that we are subscribing to, they just stream the results?
            //so if it is here it was a retrieve that had more data come in after expiration?
        }else{
            root.opt.debug('Could not route:',msg)
        }
    }
}

//listeners here are for both env

//anything we receive
function route(msg,next){
    let root = this
    
    next()
}


//handshake and auth stuff
function sendIntro(peerID,next){
    let root = this
    let peer = root.peers.peers.get(peerID)
    if(!peer){
        root.opt.debug('NO PEER FOUND')
        return
    }
    root.router.send.intro(peer)
    next()
}
function intro(peerID,next){
    let root = this
    root.opt.debug('recvd intro message from:',peerID)
    let peer = root.peers.peers.get(peerID)
    if(!peer){
        root.opt.debug('Cannot find peer!! events/intro')
        return
    }
    //could also run the peerShuffle where we evaluate all peers, rank 
    if(!(peer && peer.theirChallenge) || !root.sign)return
    signChallenge(root,peer,root.user.pub)
    next()
}
function loadOwnership(peer,next){
    let pub = peer.pub
    root.router.send
    next()
}
function sigs(pub, next){
    //respond to all challenges from peers
    let root = this
    let peers = root.peers.peers.entries()
    for (const [pid,peer] of peers) {
        if(peer.theirChallenge){
            signChallenge(root,peer,pub)
        }
    }
    next()
}

function findAuthority(peer){
    
    next()

}
function signout(left,next){
    let root = this
    delete root.sign
    delete root.user
    next()
}