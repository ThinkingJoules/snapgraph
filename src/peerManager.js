export default function PeerHandler(root){
    const self = this
    let opt = root.opt


    let env;
    const isNode = new Function("try {return this===global;}catch(e){return false;}")()
    if(isNode)env = global
    else env = window
    env = env || {};
    this.websocket = root.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket;
	this.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
    this.peers = new Map()
    this.connect = function(ipAddr){
        let wait = 2 * 1000;
        let doc = 'undefined' !== typeof document && document;
        if(!ipAddr){ return }
        let peer = {id:ipAddr}
        let url = peer.id.replace('http', 'ws');
        let wire = peer.wire = new self.websocket(url);
        peer.challenge = false
        peer.pub = false
        wire.onclose = function(){//if whoever we are connecting to closes
            self.onDisConn(peer.id);
            reconnect(peer);
        };
        wire.onerror = function(error){
            root.opt.debug('wire.onerror',error)
            reconnect(peer);
        };
        wire.onopen = function(){
           self.onConn(peer)
            
        }
        wire.onmessage = function(raw){
            //root.opt.debug("RAWWWW",raw)
            self.onMsg((raw.data || raw),peer)
        };
        return
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
    this.onConn = function(peer){
        root.opt.debug('connected')
        self.peers.set(peer.id,peer)
        root.on('newConnection',peer.id)//should send out intro/handshake/challenge/etc
    }
    this.onMsg = function(raw,peer){
        if(!raw){ return }
        let msg, tmp = raw[0];
        if(self.pack <= raw.length){ console.log('PAYLOAD TOO BIG!'); return}
        if('{' === tmp){//for each message
            try{msg = msg || JSON.parse(raw);
            }catch(e){return opt.log('INCOMING MSG JSON parse error', e)}
            if(!msg){ return }
            (msg._ = function(){}).peer = peer;
            //handle acks here? Would make more sense. More of a networking things
            //will use a different message for 'has been written to disk'
            //could be used so we know how many pending (and we know they received) vs responses to a message
            if(msg.ack && msg.s)peer.wire.send(JSON.stringify({m:'ack',r:msg.s}))
            if(msg.m === 'ping' && msg.s){return}//special message, ack ^^^ finishes logic
            root.on('in',msg); //start of the in chain
        }
    }
    this.onDisConn = function(peer){
        root.opt.debug('disconnecting peer')
        if(peer && peer.wire && peer.wire.close)peer.wire.close()
        self.peers.delete(peer.id)
    }
    this.sendTo = function(msg, pid){//this simply sends it, it assumes what its sending is okay to send to that peer
        if(typeof msg !== 'string')msg = JSON.stringify(msg)
        let peer = self.peers.get(pid) || {}
        let wire = root.util.getValue(['wire'],peer)
        if(wire.send && wire.send instanceof Function){
			wire.send(msg);
		}
    }
    this.getPeer = function(pid){
        return self.peers.get(pid)
    }
    this.shuffle = function(){
        //go through all peers and categorize them:
        //isNode: [{peerWith lowest Ping}]
    }
}