export default function addListeners (root){
    root.on('in',onIn)
    root.on('newConnection',onConn)
    root.on('intro',intro)
    root.on('auth',sigs)
    root.on('signout',signout)
    // if(root.isNode){
    //     root.on('in',onIn)
    //     root.on('newConnection',onConn)
    //     root.on('intro',intro)
    //     root.on('auth',sigs)
    // }else{
    //     root.on('in',onIn)
    //     root.on('newConnection',onConn)
    //     root.on('intro',intro)
    //     root.on('auth',sigs)
    // }

    
    
}

//listeners here are for both env

//anything we receive
function onIn(msg,next){
    let root = this
    let {m,s,r} = msg
    let temp
    root.opt.debug('incoming msg',{m,s,r})
    if(s && (temp = root.router.recv[m])){//incoming request
        root.router.recv[m](msg)
    }else if (r && (temp = root.router.pending.get(r))){
        if(m === 'ack'){
            temp.on('ack',msg.ack)//only send the body to the tracker?
        }else if(m === 'error'){
            temp.on('error',msg.b)
        }else{
            temp.on('reply',msg.b)//only send the body to the tracker?
        }
    }else{
        root.opt.debug('Could not route:',msg)
    }
    next()
}


//handshake and auth stuff
function onConn(peerID,next){
    let root = this
    let peer = root.peers.peers.get(peerID)
    if(!peer){
        root.opt.debug('NO PEER FOUND')
        return
    }
    root.router.send.intro(peerID)
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
    console.log(root)
    signChallenge(root,peer,root.user.pub)
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
function signChallenge(root,peer,pub){
    let challenge = peer.theirChallenge
    root.sign(challenge,function(sig){
        peer.theirChallenge = false
        let m = {m:'intro',r:challenge,b:{auth:sig,pub:pub}}
        console.log(m)
        peer.wire.send(JSON.stringify(m))
    })
}
function signout(left,next){
    let root = this
    delete root.sign
    delete root.user
    next()
}