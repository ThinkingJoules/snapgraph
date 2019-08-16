import { snapID } from "./util";

export default function addListeners (root){
    let on = root.on = {}
    on.auth = function(){
        root.mesh.auth()
    }
    on.pairwise = function(peer){
        if(peer.pub === root.user.pub){
            peer.hasRoot = true
        }
    }
    on.signout = function(){
        delete root.sign
        delete root.user
        root.mesh.signout()//disconnect all peers, as this peer is no longer authorized to interact with them.
        //really need to force refresh the page
        
    }
    on.verifiedPeer = function(nowVerified){
        let msgs,peers //'is' should have all the ips we need to add owns to?? shouldn't need the first loop
        for (const baseID in root.resources) {
            const {connected,owner} = self.resources[baseID];
            for (const ip in connected) {
                const peer = connected[ip];
                if(!nowVerified.has(peer.id) || (nowVerified.has(peer.id) && peer.pub !== owner))continue
                //this is ugly and slow, but we need to have the data on the peer so when they disconnect we don't have to know where its all at
                peer.owns = peer.owns || new Set()
                peer.owns.add(baseID)
            }
        }

        for (const baseID in root.resources) {
            const {connected,pending} = self.resources[baseID];
            if((msgs=Object.values(pending)).length && (peers=Object.values(connected).filter(x=>x.verified)).length){
                root.opt.debug('Sending pending msgs to peer[0]',{msgs,peers})
                peers.sort((a,b)=>a.ping-b.ping)
                for (const msg of msgs) {
                    if(peers[0] && peers[0].send)peers[0].send(msg)
                }
            }
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
            //maybe this is how subscrive vs retrieve works? NO, must specify an off message to stop updates (which should be 'say' not 'ask')
            //WE COULD TREAT THIS AS A 'SAY' AND IT WOULD ACT LIKE A 'NEW' NODE WAS CREATED???
            //doesn't really matter, if retrieve fired cb, then won't do anything, if sub'd, just merge and emit?
        }else{
            root.opt.debug('Could not route:',msg)
        }
    }
    on.peerDisconnect = function(peer){
        console.warn('API NOT FINISHED')
        //remove from resources, as the peer object is still in memory
        //even though we deleted the reference to it in mesh.peers
        //can't be garbage collected until all refs are gone
        //we need to manually do that here.

        //IF CLIENT VVV
        //if this peer is supplying a resource that we are currently looking for
        //then we need to see if we are still connected to it with another peer
        //or if we have additional peers specified 
    }
}

//listeners here are for both env

//anything we receive


//handshake and auth stuff

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