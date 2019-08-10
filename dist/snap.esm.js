import url from 'url';
import WebSocket from 'ws';
import Gun from 'gun';
import SEA from 'gun/sea';

//REGEX STUFF
const regOr = (regArr) =>{
    let cur = '';
    for (const r of regArr) {
        cur += '(?:'+r.toString().slice(1,-2)+')' + '|';
    }
    cur = cur.slice(0,-1); //remove trailing '|'
    cur = '/'+cur+'/i';
    return eval(cur)
};
//soul regex
const TYPE_INDEX = /^![a-z0-9]+$/i;
const BASE_CONFIG =/^![a-z0-9]+%$/i;
const NODE_STATE = /^![a-z0-9]+#[a-z0-9]+\$$/i;
const RELATION_STATE = /^![a-z0-9]+-[a-z0-9]+\$$/i;
const BASE = /^![a-z0-9]+$/i;
const NODE_TYPE = /^![a-z0-9]+#[a-z0-9]+$/i;
const RELATION_TYPE = /^![a-z0-9]+-[a-z0-9]+$/i;
const LABEL_INDEX = /^![a-z0-9]+&$/i;
const LABEL_TYPE = /^![a-z0-9]+&[a-z0-9]+$/i;
const TYPE_CONFIG = /^![a-z0-9]+#[a-z0-9]+%$/i;
const RELATION_CONFIG =/^![a-z0-9]+-[a-z0-9]+%$/i;
const PROP_CONFIG = /^![a-z0-9]+(?:#|-)[a-z0-9]+.[a-z0-9]+%$/i;
const TYPE_PROP_INDEX = /^![a-z0-9]+#[a-z0-9]+$/i;
const RELATION_PROP_INDEX = /^![a-z0-9]+-[a-z0-9]+$/i;
const PROP_TYPE = /^![a-z0-9]+(?:#|-)[a-z0-9]+.[a-z0-9]+$/i;

const DATA_INSTANCE_NODE = /^![a-z0-9]+#[a-z0-9]+\$[a-z0-9_]+/i;
const RELATION_INSTANCE_NODE = /^![a-z0-9]+-[a-z0-9]+\$[a-z0-9_]+/i;
const DATA_ADDRESS = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+[^|:;/?]+$/i;
const RELATION_ADDRESS = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+[^|:;/?]+$/i;
const TIME_DATA_ADDRESS = /^![a-z0-9]+#[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+:/i;
const TIME_RELATION_ADDRESS = /^![a-z0-9]+-[a-z0-9]+\.[a-z0-9]+\$[a-z0-9_]+:/i;


const TIME_INDEX_PROP = regOr([TIME_DATA_ADDRESS,TIME_RELATION_ADDRESS]);
const IS_STATE_INDEX = regOr([NODE_STATE,RELATION_STATE]);
const INSTANCE_OR_ADDRESS = regOr([DATA_INSTANCE_NODE,RELATION_INSTANCE_NODE,DATA_ADDRESS,RELATION_ADDRESS]);
const NON_INSTANCE_PATH = regOr([BASE,NODE_TYPE,RELATION_TYPE,PROP_TYPE]);
const ALL_ADDRESSES = regOr([DATA_ADDRESS,RELATION_ADDRESS]);
const ALL_TYPE_PATHS = regOr([NODE_TYPE,RELATION_TYPE,LABEL_TYPE]);
const ALL_INSTANCE_NODES = regOr([DATA_INSTANCE_NODE,RELATION_INSTANCE_NODE]);
const ALL_CONFIGS = {
    typeIndex: TYPE_INDEX,
    baseConfig: BASE_CONFIG,
    propIndex: regOr([TYPE_PROP_INDEX,RELATION_PROP_INDEX]),
    thingConfig: regOr([TYPE_CONFIG,RELATION_CONFIG]),
    propConfig: PROP_CONFIG,
    label: LABEL_TYPE,
    labelIndex: LABEL_INDEX
};
const IS_CONFIG_SOUL = regOr([BASE_CONFIG,TYPE_INDEX,LABEL_TYPE,TYPE_CONFIG,RELATION_CONFIG,PROP_CONFIG,TYPE_PROP_INDEX,RELATION_PROP_INDEX,LABEL_INDEX]);
const CONFIG_SOUL = regOr([BASE_CONFIG,LABEL_TYPE,TYPE_CONFIG,RELATION_CONFIG,PROP_CONFIG]);
const NULL_HASH = hash64(JSON.stringify(null));

//getter and setters
function setValue(propertyPath, value, obj,merge){
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {
        if (!obj.hasOwnProperty(propertyPath[0]) || typeof obj[propertyPath[0]] !== "object") obj[propertyPath[0]] = {};
        return setValue(propertyPath.slice(1), value, obj[propertyPath[0]],merge)
    } else {
        if(merge && typeof value == 'object' && value !== null){
            if (!obj.hasOwnProperty(propertyPath[0]) || typeof obj[propertyPath[0]] !== "object") obj[propertyPath[0]] = {};
            for (const key in value) {
                obj[propertyPath[0]][key] = value[key];
            }
        }else{
            obj[propertyPath[0]] = value;
        }
        return true // this is the end
    }
}
function getValue(propertyPath, obj){
    if(typeof obj !== 'object' || Array.isArray(obj) || obj === null)return undefined
    if(!Array.isArray(propertyPath))throw new Error('Must provide an array for propertyPath')
    if (propertyPath.length > 1) {// Not yet at the last property so keep digging
      if (!obj.hasOwnProperty(propertyPath[0])){
          return undefined
      }
      return getValue(propertyPath.slice(1), obj[propertyPath[0]])
    }else{
        return obj[propertyPath[0]]
    }
}
function mergeObj(oldO,newO){
    //console.log({oldO,newO})
    for (const key in newO) {
        const val = newO[key];
        if(typeof val === 'object' && val !== null && !Array.isArray(val)){
            if(typeof oldO[key] !== 'object')oldO[key] = {};
            mergeObj(oldO[key],newO[key]);
        }
        oldO[key] = newO[key];
    }
}


//SNAP STUFF
const on = function(tag,cb,opts){
    const onObj = this;
    opts = opts || {};
    if((cb && cb instanceof Function) || (cb && Array.isArray(cb) && cb.every(x => x instanceof Function))){//adding an event listener
        if(!getValue(['tag',tag],onObj))setValue(['tag',tag],[],onObj);
        if((opts.dir || 'push') == 'push'){
            onObj.tag[tag] = onObj.tag[tag].concat(cb);
        }else{
            onObj.tag[tag] = cb.concat(onObj.tag[tag]);
        }
    }else{//new event on this tag
        let calls = onObj.tag[tag];
        if(calls && Array.isArray(calls)){
            run(calls,cb);
            function run(calls,eventValue){
                let inst = calls.slice();
                next();                
                function next(){
                    let nextCall = inst.shift();
                    nextCall = (nextCall instanceof Function && nextCall) || function(){};
                    nextCall.call(onObj,eventValue,next);
                }
            }
        }
    }
};


function rand(len, charSet){
    var s = '';
    len = len || 24;
    charSet = charSet || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz';
    while(len > 0){ s += charSet.charAt(Math.floor(Math.random() * charSet.length)); len--; }
    return s;
}
function hash64(string){
    let h1 = hash(string);
    return h1 + hash(h1 + string)
}
function hash(key, seed) {
	var remainder, bytes, h1, h1b, c1, c2, k1, i;
	
	remainder = key.length & 3; // key.length % 4
	bytes = key.length - remainder;
	h1 = seed;
	c1 = 0xcc9e2d51;
	c2 = 0x1b873593;
	i = 0;
	
	while (i < bytes) {
	  	k1 = 
	  	  ((key.charCodeAt(i) & 0xff)) |
	  	  ((key.charCodeAt(++i) & 0xff) << 8) |
	  	  ((key.charCodeAt(++i) & 0xff) << 16) |
	  	  ((key.charCodeAt(++i) & 0xff) << 24);
		++i;
		
		k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

		h1 ^= k1;
        h1 = (h1 << 13) | (h1 >>> 19);
		h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
		h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
	}
	
	k1 = 0;
	
	switch (remainder) {
		case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
		case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
		case 1: k1 ^= (key.charCodeAt(i) & 0xff);
		
		k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
		h1 ^= k1;
	}
	
	h1 ^= key.length;

	h1 ^= h1 >>> 16;
	h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
	h1 ^= h1 >>> 13;
	h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
	h1 ^= h1 >>> 16;

	return h1 >>> 0;
}

const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz~!@#%^&*)-_=+}|]:.?/';
function Router(root){
    //assume root has ws setup and bootstrap peers already listed/connected
    //we may need to connect additional peers
    this.root = root;
    const router = this;
    router.pending = new Map();
    const send = router.send = {};
    const recv = router.recv = {};
    send.intro = function(pid,opts){//sender generates
        opts = opts || {};
        let expireReq = opts.expire || (Date.now()+(1000*60*60*8));//must auth within 8 hrs??? Probably only browsers that will be waiting on human 
        let b = {challenge:0,isPeer:root.isNode};
        let msg = new SendMsg('intro',b,true,expireReq);
        msg.b.challenge = msg.s; //challenge is signing this msgID, that way the know where to respond
        msg.to = [pid];
        track(msg,new TrackOpts(opts.acks,opts.replies,{},{onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}));
        let peer = root.peers.peers.get(pid);
        peer.challenge = msg.s;
        if(!peer.met)peer.met = Date.now();
        root.opt.debug('sending intro',msg);
        sendMsgs(msg);
        function onAck(v,next){
            if(this.acks === 1){//only on first ack
                let n = Date.now();
                let peer = root.peers.getPeer(pid) || {};
                peer.ping = n-this.sent; //round trip
            }
            next();
        }
        function onDone(value,next){//what to do with their response
            console.log('HAS SIG',value,this);
            let {auth,pub} = value;
            root.verify(auth,pub,function(valid){
                if(valid){
                    root.opt.debug('Valid signature, now authenticated!');
                    peer.pub = pub;
                    peer.challenge = false;
                }else{
                    root.opt.log('Signature did not validate!');
                    //what to do? submit another challenge?
                    //send an error message?
                    //if these are two servers then no one will know this has failed
                }
            });
            next();
            //b should have auth, need to verify sig and compare to challenge
        }
    };
    recv.intro = function(msg){//this is what the receiver is going to do on getting it
        let {b} = msg;
        let {challenge,isPeer} = b;
        let peer = msg._.peer;
        peer.theirChallenge = challenge;
        peer.isPeer = isPeer;
        root.on('intro',peer.id);//if auth'd will reply, if not, will wait for auth
    };
    send.ping = function(pid){
        let b = '';
        let msg = new SendMsg('ping',b,false,false,true);
        track(msg,new TrackOpts(1,0,0,false,onDone,function(v,n){n();}));
        msg.to = [pid];
        sendMsgs(msg);
        function onDone(value){
            let n = Date.now();
            let peer = root.peers.getPeer(pid) || {};
            peer.ping = n-this.sent; //round trip
        }
    };
    send.error = function(pid,err){
        let b = err;
        let msg = new SendMsg('error',b,false);
        msg.to = [pid];
        sendMsgs(msg);
    };
    function sendMsgs(msg){
        for (const pid of msg.to) {
            root.peers.sendTo(msg,pid);
        }
    }

    // m:msgType, s:originalMsgID, r:respondingToThisOrigID er:expectsResponse, b:body, e:expiration date to:message went/is going to
    function SendMsg(type,body,expectResponse,expire,ack){
        this.m = type;
        this.s = root.util.rand(12,chars);
        if(expectResponse)this.er = expectResponse; //if we expect a response, which type? (more for humans, we don't do anything with it? Could reject resp if != to)
        this.b = body;
        if(expectResponse)this.e = expire ? expire : (Date.now()+(1000*30));//30 seconds as default?? Gun uses 9, but we can set dif/per msg type
        this.ack = !!ack; //can ack a msg seperate from the reply, redundant when all you want is an ack
    }
    function TrackOpts(acks,replies,initialValue,ons){
        //onError,Done,Reply will be an array of functions that run after snapsgraphs
        let missing = [undefined,false,null];
        this.acks = (!missing.includes(acks) && acks) || 0;
        this.replies = (!missing.includes(replies) && replies) || 1;
        this.initialValue = initialValue;
        this.onAck = isArr(ons.onAck) || [];
        this.onError = isArr(ons.onError) || [root.opt.log];
        this.onDone = isArr(ons.onDone) || [];
        this.onReply = isArr(ons.onReply) || [function(newVal,next){this.value = newVal;next();}];//we should always pass one in for internal messages
        function isArr(value){
            if(!Array.isArray(value)){
                if(value instanceof Function){
                    return [value]
                }
                return false
            }
            if(Array.isArray(value)){
                return value.filter(x => x instanceof Function)
            }
            return false
        }
    }
    function track(msg,opts){
        //create new Tracker
        //store tracker in self.pending.set(msg.s,tracker)
        opts = opts || {};
        let expire = msg.e || (Date.now()+(1000*9)); //default will only be set if we are not expecting a response? which we aren't tracking these anyway.
        let tracker = new Tracker(msg,opts);
        tracker.on('ack',function(value,next){this.acks++;next();});
        tracker.on('ack',opts.onAck);
        tracker.on('ack',function(){
            this.test();
        });
        tracker.on('reply',function(newVal,next){this.replies++;next();});
        tracker.on('reply',opts.onReply);
        tracker.on('reply',function(){
            this.test();
        });//will always be last, no need for next
        tracker.on('error',opts.onError);
        tracker.on('error',function(){router.pending.delete(this.id);});
        tracker.on('done',opts.onDone);
        tracker.on('done',function(){router.pending.delete(this.id);});
        tracker.timer = setTimeout(tracker.on,(expire-Date.now()),'error','MESSAGE EXPIRED');
        tracker.sent = Date.now();
        router.pending.set(tracker.id,tracker);
        //root.opt.debug('tracking msg',tracker)

        function Tracker(msg,opts){
            opts = opts || {};
            let self = this;
            this.on = on;
            this.id = msg.s || msg.r;
            this.acks = 0;
            this.replies = 0;
            this.value = opts.initialValue;
            this.test = function(){
                let acksNeeded = opts.acks;
                let repliesNeeded = opts.replies;
                if(acksNeeded >= self.acks && repliesNeeded >= self.replies){
                    self.on('done',self.value);
                    clearTimeout(self.timer);
                }
            };
        }
    }
}

function PeerHandler(root){
    const self = this;
    let opt = root.opt;


    let env;
    const isNode = new Function("try {return this===global;}catch(e){return false;}")();
    if(isNode)env = global;
    else env = window;
    env = env || {};
    this.websocket = root.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket;
	this.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
    this.peers = new Map();
    this.connect = function(ipAddr){
        let wait = 2 * 1000;
        let doc = 'undefined' !== typeof document && document;
        if(!ipAddr){ return }
        let peer = {id:ipAddr};
        let url = peer.id.replace('http', 'ws');
        let wire = peer.wire = new self.websocket(url);
        peer.challenge = false;
        peer.pub = false;
        wire.onclose = function(){//if whoever we are connecting to closes
            self.onDisConn(peer.id);
            reconnect(peer);
        };
        wire.onerror = function(error){
            root.opt.debug('wire.onerror',error);
            reconnect(peer);
        };
        wire.onopen = function(){
           self.onConn(peer);
            
        };
        wire.onmessage = function(raw){
            //root.opt.debug("RAWWWW",raw)
            self.onMsg((raw.data || raw),peer);
        };
        return
        function reconnect(peer){
            if(root.isNode)return
            root.opt.debug('attempting reconnect');
            clearTimeout(peer.defer);
            if(doc && peer.retry <= 0){ return } 
            peer.retry = (peer.retry || opt.retry || 60) - 1;
            peer.defer = setTimeout(function to(){
                if(doc && doc.hidden){ return setTimeout(to,wait) }
                self.connect(peer.id);
            }, wait);
        }
    };
    this.onConn = function(peer){
        root.opt.debug('connected');
        self.peers.set(peer.id,peer);
        root.on('newConnection',peer.id);//should send out intro/handshake/challenge/etc
    };
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
            if(msg.ack && msg.s)peer.wire.send(JSON.stringify({m:'ack',r:msg.s}));
            if(msg.m === 'ping' && msg.s){return}//special message, ack ^^^ finishes logic
            root.on('in',msg); //start of the in chain
        }
    };
    this.onDisConn = function(peer){
        root.opt.debug('disconnecting peer');
        if(peer && peer.wire && peer.wire.close)peer.wire.close();
        self.peers.delete(peer.id);
    };
    this.sendTo = function(msg, pid){//this simply sends it, it assumes what its sending is okay to send to that peer
        if(typeof msg !== 'string')msg = JSON.stringify(msg);
        let peer = self.peers.get(pid) || {};
        let wire = root.util.getValue(['wire'],peer);
        if(wire.send && wire.send instanceof Function){
			wire.send(msg);
		}
    };
    this.getPeer = function(pid){
        return self.peers.get(pid)
    };
    this.shuffle = function(){
        //go through all peers and categorize them:
        //isNode: [{peerWith lowest Ping}]
    };
}

function commsInit(root){
	let opt = root.opt;
	let ws = {};
	ws.server = opt.web;

	if(ws.server && !ws.web){
		root.WebSocket = WebSocket;
		opt.WebSocket = WebSocket;
		ws.path = ws.path || '/snap';
		ws.maxPayload = ws.maxPayload; // || opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3;
		ws.web = new WebSocket.Server(ws);
		root.opt.debug('listening');
		ws.web.on('connection', function(wire){ 
			let peer;
			root.opt.debug('new connection');
			wire.upgradeReq = wire.upgradeReq || {};
			wire.url = url.parse(wire.upgradeReq.url||'', true);
			peer = {wire: wire,id:root.util.rand(12)};

			root.peers.onConn(peer);
			wire.on('message', function(msg){
				root.peers.onMsg(msg,peer);
			});
			wire.on('close', function(){
				root.peers.onDisConn(peer);
			});
			wire.on('error', function(e){});
			setTimeout(function heart(){ //setInterval??
				if(!root.peers.peers.get(peer.id)){ return } 
				try{ 
					root.router.send.ping(peer.id); 
					setTimeout(heart, 1000 * 50); 
				}catch(e){} 
			}, 1000 * 50); // Some systems, like Heroku, require heartbeats to not time out. // TODO: Make this configurable?
		});
	}
	

}

function addListeners (root){
    root.on('in',onIn);
    root.on('newConnection',onConn);
    root.on('intro',intro);
    root.on('auth',sigs);
    root.on('signout',signout);
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
    let root = this;
    let {m,s,r} = msg;
    let temp;
    root.opt.debug('incoming msg',{m,s,r});
    if(s && (temp = root.router.recv[m])){//incoming request
        root.router.recv[m](msg);
    }else if (r && (temp = root.router.pending.get(r))){
        if(m === 'ack'){
            temp.on('ack',msg.ack);//only send the body to the tracker?
        }else if(m === 'error'){
            temp.on('error',msg.b);
        }else{
            temp.on('reply',msg.b);//only send the body to the tracker?
        }
    }else{
        root.opt.debug('Could not route:',msg);
    }
    next();
}


//handshake and auth stuff
function onConn(peerID,next){
    let root = this;
    let peer = root.peers.peers.get(peerID);
    if(!peer){
        root.opt.debug('NO PEER FOUND');
        return
    }
    root.router.send.intro(peerID);
}
function intro(peerID,next){
    let root = this;
    root.opt.debug('recvd intro message from:',peerID);
    let peer = root.peers.peers.get(peerID);
    if(!peer){
        root.opt.debug('Cannot find peer!! events/intro');
        return
    }
    //could also run the peerShuffle where we evaluate all peers, rank 
    if(!(peer && peer.theirChallenge) || !root.sign)return
    console.log(root);
    signChallenge(root,peer,root.user.pub);
    next();
}
function sigs(pub, next){
    //respond to all challenges from peers
    let root = this;
    let peers = root.peers.peers.entries();
    for (const [pid,peer] of peers) {
        if(peer.theirChallenge){
            signChallenge(root,peer,pub);
        }
    }
    next();
}
function signChallenge(root,peer,pub){
    let challenge = peer.theirChallenge;
    root.sign(challenge,function(sig){
        peer.theirChallenge = false;
        let m = {m:'intro',r:challenge,b:{auth:sig,pub:pub}};
        console.log(m);
        peer.wire.send(JSON.stringify(m));
    });
}
function signout(left,next){
    let root = this;
    delete root.sign;
    delete root.user;
    next();
}

const create = function(alias, pass, cb){
    let snap = this;
    let root = snap._;
    let cat = getValue(['state','cat'], root) || {};
    cb = cb || noop;
    if(cat.ing){
      cb({err: root.opt.log("User is already being created or authenticated!")});
    }
    root.util.setValue(['state','cat','ing'],true,root);
    var act = {};
    act.a = function(pubs){
        if(pubs){//must be online/connected to mainnet to create a userID
            // If we can enforce that a user name is already taken, it might be nice to try, but this is not guaranteed.
            var ack = {err: Gun.log('User already created!')};
            cat.ing = false;
            cb(ack);
            return;
        }
        act.pubs = pubs;
        act.salt = Gun.text.random(64); // pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it.
        SEA.work(pass, act.salt, act.b); // this will take some short amount of time to produce a proof, which slows brute force attacks.
    };
    act.b = function(proof){
        act.proof = proof;
        SEA.pair(act.c); // now we have generated a brand new ECDSA key pair for the user account.
    };
    act.c = function(pair){ 
        let tmp = {};
        act.pair = pair || {};
        tmp.is = {pub: pair.pub, epub: pair.epub, alias: alias};
        // the user's public key doesn't need to be signed. But everything else needs to be signed with it! // we have now automated it! clean up these extra steps now!
        act.data = {pub: pair.pub};
        act.data.alias = alias;
        act.data.epub = act.pair.epub; 
        SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, act.proof, act.g, {raw:1}); // to keep the private key safe, we AES encrypt it with the proof of work!
    };
    act.g = function(auth){        act.data.auth = JSON.stringify({ek: auth, s: act.salt}); 
        root.opt.debug('SUCCESSFUL USER CREATION!',act);

        //want to gossip this, and wait for one ack until we fire the auth event


        root.sign = sign(act.pair);
        root.user = {pub: act.pair.pub,alias:act.data.alias};
        root.util.setValue(['state','cat','ing'],false,root);
        root.on('auth',act.pair.pub);
        //root.get(tmp = '~'+act.pair.pub).put(act.data); // awesome, now we can actually save the user with their public key as their ID.
        //root.get('~@'+alias).put(Gun.obj.put({}, tmp, Gun.val.link.ify(tmp))); // next up, we want to associate the alias with the public key. So we add it to the alias list.
        
    };
    act.a(null);
    //root.get('~@'+alias).once(act.a);
    return
};
const leave = function(){
    let snap = this;
    let root = snap._;
    root.on('signout',true);
};
const auth = function(alias, pass, cb, opt){
    let cat = getValue(['state','cat'], root) || {};
    cb = cb || function(){};
    if(cat.ing){
    cb({err: Gun.log("User is already being created or authenticated!"), wait: true});
    return gun;
    }
    root.util.setValue(['state','cat','ing'],true,root);
    opt = opt || {};
    var pair = (alias && (alias.pub || alias.epub))? alias : (pass && (pass.pub || pass.epub))? pass : null;
    var act = {}, u;
    act.a = function(data){
        if(!data){ return act.b() }
        if(!data.pub){
            var tmp = [];
            Gun.node.is(data, function(v){ tmp.push(v); });
            return act.b(tmp);
        }
        act.c((act.data = data).auth); //this sets data.pub a>map>b>getsSoul2>c>ifFail start over
    };
    act.b = function(list){
        var get = (act.list = (act.list||[]).concat(list||[])).shift();
        if(u === get){
            return act.err('Wrong user or password.') 
        }
        root.ask(get,false,act.a);
    };
    act.c = function(auth){
        if(u === auth){ return act.b() }
        SEA.work(pass, (act.auth = auth).s, act.d, act.enc); // the proof of work is evidence that we've spent some time/effort trying to log in, this slows brute force.
    };
    act.d = function(proof){
        SEA.decrypt(act.auth.ek, proof, act.e, act.enc);
    };
    act.e = function(half){
        if(u === half){
            act.enc = null; // end backwards
            return act.b();
        }
        act.half = half;
        act.f(act.data);
    };
    act.f = function(data){
        if(!data || !data.pub){ return act.b() }
        var tmp = act.half || {};
        act.g({pub: data.pub, epub: data.epub, priv: tmp.priv, epriv: tmp.epriv});
    };
    act.g = function(pair){
        act.pair = pair;
        opt.change? act.z() : done(act.pair);
    };
    act.z = function(){
        // password update so encrypt private key using new pwd + salt
        act.salt = Gun.text.random(64); // pseudo-random
        SEA.work(opt.change, act.salt, act.y);
    };
    act.y = function(proof){
        SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, proof, act.x, {raw:1});
    };
    act.x = function(auth){
        act.w(JSON.stringify({ek: auth, s: act.salt}));
    };
    act.w = function(auth){
        //root.get('~'+act.pair.pub).get('auth').put(auth, cb);
    };
    act.err = function(e){
        var ack = {err: Gun.log(e || 'User cannot be found!')};
        cat.ing = false;
        cb(ack);
    };
    if(pair){
        act.g(pair);
    } else
    if(alias){
        root.get('~@'+alias).once(act.a);
    } else
    if(!alias && !pass){
        act.err('NOT SURE!!');
    }
    function done(pair){
        root.sign = sign(pair);
        root.verify = verify(pair);
        root.alias = alias;
    }
};
function sign(pair){
    return function(msg,cb){
        SEA.sign(msg,pair,cb);
    }
}
const verify = function(msg,pub,cb){
    SEA.verify(msg,pub,cb);
};

var isNode=new Function("try {return this===global;}catch(e){return false;}")();


const defaultOpts = {
    persist: {
        gossip:isNode,
        data:isNode, //would be nice to give it a namespace of things to persist (if this peer was only watching 1 db?)
    },
    inMemory: {
        gossip:true,
        data:true, 
    },
    listen: {
        gossip: isNode,
        data: (isNode) ? 'namespace' : 'requested' //namespace according to your public records, requested, only things you have asked from that person
    },
    log: console.log,
    debug: function(){}
};

function Snap(initialPeers,opts){
    if(!new.target){ return new Snap(initialPeers,opts) }
    opts = opts || {};
    if(!initialPeers)initialPeers = (isNode) ? [] : ['http://localhost:8765/snap'];  // https://www.hello.snapgraph.net/snap //if they want no peers, must specify []
    let self = this;
	this._ = {};
    let root = this._;
    //root.memStore = new MemStore()
    root.isNode = isNode;
    root.opt = defaultOpts;
    //root.sg = new SG(root)
    root.tag = {};
    mergeObj(root.opt,opts); //apply user's ops
    root.router = new Router(root);
    root.verify = verify;
    root.on  = on;
    if(isNode){
        commsInit(root);//listen on port
    }
    root.peers = new PeerHandler(root); //this will open new peers
    root.util = {getValue,setValue,rand};


    addListeners(root);
    for (let i = 0; i < initialPeers.length; i++) {
        root.peers.connect(initialPeers[i]);
    }
        
    Object.assign(self,snapChainOpt(self));   
}
//const kill = makekill(querySubs,configSubs,killSub)


function snapChainOpt(snap){
    return {snap,
        signUp:create,
        signIn:auth,
        signOut:leave,
        //newBase, 
        //showgb, 
        //showcache, 
        //showgsub, 
        //showgunsub, 
        //solve, 
        //base, 
        //node: node(),
        //ls:ls(),
        //help:chainHelp(),
        //getConfig: getConfig(),
        //kill:kill()
    }
}

export default Snap;
