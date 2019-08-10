(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('ws'), require('aws-sdk')) :
  typeof define === 'function' && define.amd ? define(['ws', 'aws-sdk'], factory) :
  (global = global || self, global.Snap = factory(global.WebSocket, global.awsSdk));
}(this, function (WebSocket, awsSdk) { 'use strict';

  WebSocket = WebSocket && WebSocket.hasOwnProperty('default') ? WebSocket['default'] : WebSocket;
  awsSdk = awsSdk && awsSdk.hasOwnProperty('default') ? awsSdk['default'] : awsSdk;

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

  var global$1 = (typeof global !== "undefined" ? global :
              typeof self !== "undefined" ? self :
              typeof window !== "undefined" ? window : {});

  function PeerHandler(root){
      const self = this;
      let opt = root.opt;


      let env;
      const isNode = new Function("try {return this===global;}catch(e){return false;}")();
      if(isNode)env = global$1;
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

  /*! https://mths.be/punycode v1.4.1 by @mathias */


  /** Highest positive signed 32-bit float value */
  var maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

  /** Bootstring parameters */
  var base = 36;
  var tMin = 1;
  var tMax = 26;
  var skew = 38;
  var damp = 700;
  var initialBias = 72;
  var initialN = 128; // 0x80
  var delimiter = '-'; // '\x2D'
  var regexNonASCII = /[^\x20-\x7E]/; // unprintable ASCII chars + non-ASCII chars
  var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

  /** Error messages */
  var errors = {
    'overflow': 'Overflow: input needs wider integers to process',
    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    'invalid-input': 'Invalid input'
  };

  /** Convenience shortcuts */
  var baseMinusTMin = base - tMin;
  var floor = Math.floor;
  var stringFromCharCode = String.fromCharCode;

  /*--------------------------------------------------------------------------*/

  /**
   * A generic error utility function.
   * @private
   * @param {String} type The error type.
   * @returns {Error} Throws a `RangeError` with the applicable error message.
   */
  function error(type) {
    throw new RangeError(errors[type]);
  }

  /**
   * A generic `Array#map` utility function.
   * @private
   * @param {Array} array The array to iterate over.
   * @param {Function} callback The function that gets called for every array
   * item.
   * @returns {Array} A new array of values returned by the callback function.
   */
  function map$1(array, fn) {
    var length = array.length;
    var result = [];
    while (length--) {
      result[length] = fn(array[length]);
    }
    return result;
  }

  /**
   * A simple `Array#map`-like wrapper to work with domain name strings or email
   * addresses.
   * @private
   * @param {String} domain The domain name or email address.
   * @param {Function} callback The function that gets called for every
   * character.
   * @returns {Array} A new string of characters returned by the callback
   * function.
   */
  function mapDomain(string, fn) {
    var parts = string.split('@');
    var result = '';
    if (parts.length > 1) {
      // In email addresses, only the domain name should be punycoded. Leave
      // the local part (i.e. everything up to `@`) intact.
      result = parts[0] + '@';
      string = parts[1];
    }
    // Avoid `split(regex)` for IE8 compatibility. See #17.
    string = string.replace(regexSeparators, '\x2E');
    var labels = string.split('.');
    var encoded = map$1(labels, fn).join('.');
    return result + encoded;
  }

  /**
   * Creates an array containing the numeric code points of each Unicode
   * character in the string. While JavaScript uses UCS-2 internally,
   * this function will convert a pair of surrogate halves (each of which
   * UCS-2 exposes as separate characters) into a single code point,
   * matching UTF-16.
   * @see `punycode.ucs2.encode`
   * @see <https://mathiasbynens.be/notes/javascript-encoding>
   * @memberOf punycode.ucs2
   * @name decode
   * @param {String} string The Unicode input string (UCS-2).
   * @returns {Array} The new array of code points.
   */
  function ucs2decode(string) {
    var output = [],
      counter = 0,
      length = string.length,
      value,
      extra;
    while (counter < length) {
      value = string.charCodeAt(counter++);
      if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
        // high surrogate, and there is a next character
        extra = string.charCodeAt(counter++);
        if ((extra & 0xFC00) == 0xDC00) { // low surrogate
          output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
        } else {
          // unmatched surrogate; only append this code unit, in case the next
          // code unit is the high surrogate of a surrogate pair
          output.push(value);
          counter--;
        }
      } else {
        output.push(value);
      }
    }
    return output;
  }

  /**
   * Converts a digit/integer into a basic code point.
   * @see `basicToDigit()`
   * @private
   * @param {Number} digit The numeric value of a basic code point.
   * @returns {Number} The basic code point whose value (when used for
   * representing integers) is `digit`, which needs to be in the range
   * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
   * used; else, the lowercase form is used. The behavior is undefined
   * if `flag` is non-zero and `digit` has no uppercase form.
   */
  function digitToBasic(digit, flag) {
    //  0..25 map to ASCII a..z or A..Z
    // 26..35 map to ASCII 0..9
    return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
  }

  /**
   * Bias adaptation function as per section 3.4 of RFC 3492.
   * https://tools.ietf.org/html/rfc3492#section-3.4
   * @private
   */
  function adapt(delta, numPoints, firstTime) {
    var k = 0;
    delta = firstTime ? floor(delta / damp) : delta >> 1;
    delta += floor(delta / numPoints);
    for ( /* no initialization */ ; delta > baseMinusTMin * tMax >> 1; k += base) {
      delta = floor(delta / baseMinusTMin);
    }
    return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
  }

  /**
   * Converts a string of Unicode symbols (e.g. a domain name label) to a
   * Punycode string of ASCII-only symbols.
   * @memberOf punycode
   * @param {String} input The string of Unicode symbols.
   * @returns {String} The resulting Punycode string of ASCII-only symbols.
   */
  function encode(input) {
    var n,
      delta,
      handledCPCount,
      basicLength,
      bias,
      j,
      m,
      q,
      k,
      t,
      currentValue,
      output = [],
      /** `inputLength` will hold the number of code points in `input`. */
      inputLength,
      /** Cached calculation results */
      handledCPCountPlusOne,
      baseMinusT,
      qMinusT;

    // Convert the input in UCS-2 to Unicode
    input = ucs2decode(input);

    // Cache the length
    inputLength = input.length;

    // Initialize the state
    n = initialN;
    delta = 0;
    bias = initialBias;

    // Handle the basic code points
    for (j = 0; j < inputLength; ++j) {
      currentValue = input[j];
      if (currentValue < 0x80) {
        output.push(stringFromCharCode(currentValue));
      }
    }

    handledCPCount = basicLength = output.length;

    // `handledCPCount` is the number of code points that have been handled;
    // `basicLength` is the number of basic code points.

    // Finish the basic string - if it is not empty - with a delimiter
    if (basicLength) {
      output.push(delimiter);
    }

    // Main encoding loop:
    while (handledCPCount < inputLength) {

      // All non-basic code points < n have been handled already. Find the next
      // larger one:
      for (m = maxInt, j = 0; j < inputLength; ++j) {
        currentValue = input[j];
        if (currentValue >= n && currentValue < m) {
          m = currentValue;
        }
      }

      // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
      // but guard against overflow
      handledCPCountPlusOne = handledCPCount + 1;
      if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
        error('overflow');
      }

      delta += (m - n) * handledCPCountPlusOne;
      n = m;

      for (j = 0; j < inputLength; ++j) {
        currentValue = input[j];

        if (currentValue < n && ++delta > maxInt) {
          error('overflow');
        }

        if (currentValue == n) {
          // Represent delta as a generalized variable-length integer
          for (q = delta, k = base; /* no condition */ ; k += base) {
            t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
            if (q < t) {
              break;
            }
            qMinusT = q - t;
            baseMinusT = base - t;
            output.push(
              stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
            );
            q = floor(qMinusT / baseMinusT);
          }

          output.push(stringFromCharCode(digitToBasic(q, 0)));
          bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
          delta = 0;
          ++handledCPCount;
        }
      }

      ++delta;
      ++n;

    }
    return output.join('');
  }

  /**
   * Converts a Unicode string representing a domain name or an email address to
   * Punycode. Only the non-ASCII parts of the domain name will be converted,
   * i.e. it doesn't matter if you call it with a domain that's already in
   * ASCII.
   * @memberOf punycode
   * @param {String} input The domain name or email address to convert, as a
   * Unicode string.
   * @returns {String} The Punycode representation of the given domain name or
   * email address.
   */
  function toASCII(input) {
    return mapDomain(input, function(string) {
      return regexNonASCII.test(string) ?
        'xn--' + encode(string) :
        string;
    });
  }

  var lookup = [];
  var revLookup = [];
  var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
  var inited = false;
  function init () {
    inited = true;
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }

    revLookup['-'.charCodeAt(0)] = 62;
    revLookup['_'.charCodeAt(0)] = 63;
  }

  function toByteArray (b64) {
    if (!inited) {
      init();
    }
    var i, j, l, tmp, placeHolders, arr;
    var len = b64.length;

    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(len * 3 / 4 - placeHolders);

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? len - 4 : len;

    var L = 0;

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
      arr[L++] = (tmp >> 16) & 0xFF;
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    if (placeHolders === 2) {
      tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
      arr[L++] = tmp & 0xFF;
    } else if (placeHolders === 1) {
      tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    return arr
  }

  function tripletToBase64 (num) {
    return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
  }

  function encodeChunk (uint8, start, end) {
    var tmp;
    var output = [];
    for (var i = start; i < end; i += 3) {
      tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
      output.push(tripletToBase64(tmp));
    }
    return output.join('')
  }

  function fromByteArray (uint8) {
    if (!inited) {
      init();
    }
    var tmp;
    var len = uint8.length;
    var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
    var output = '';
    var parts = [];
    var maxChunkLength = 16383; // must be multiple of 3

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    if (extraBytes === 1) {
      tmp = uint8[len - 1];
      output += lookup[tmp >> 2];
      output += lookup[(tmp << 4) & 0x3F];
      output += '==';
    } else if (extraBytes === 2) {
      tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
      output += lookup[tmp >> 10];
      output += lookup[(tmp >> 4) & 0x3F];
      output += lookup[(tmp << 2) & 0x3F];
      output += '=';
    }

    parts.push(output);

    return parts.join('')
  }

  function read (buffer, offset, isLE, mLen, nBytes) {
    var e, m;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var nBits = -7;
    var i = isLE ? (nBytes - 1) : 0;
    var d = isLE ? -1 : 1;
    var s = buffer[offset + i];

    i += d;

    e = s & ((1 << (-nBits)) - 1);
    s >>= (-nBits);
    nBits += eLen;
    for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    m = e & ((1 << (-nBits)) - 1);
    e >>= (-nBits);
    nBits += mLen;
    for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : ((s ? -1 : 1) * Infinity)
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
  }

  function write (buffer, value, offset, isLE, mLen, nBytes) {
    var e, m, c;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
    var i = isLE ? 0 : (nBytes - 1);
    var d = isLE ? 1 : -1;
    var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

    value = Math.abs(value);

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }

      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }

    for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

    e = (e << mLen) | m;
    eLen += mLen;
    for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

    buffer[offset + i - d] |= s * 128;
  }

  var toString = {}.toString;

  var isArray = Array.isArray || function (arr) {
    return toString.call(arr) == '[object Array]';
  };

  var INSPECT_MAX_BYTES = 50;

  /**
   * If `Buffer.TYPED_ARRAY_SUPPORT`:
   *   === true    Use Uint8Array implementation (fastest)
   *   === false   Use Object implementation (most compatible, even IE6)
   *
   * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
   * Opera 11.6+, iOS 4.2+.
   *
   * Due to various browser bugs, sometimes the Object implementation will be used even
   * when the browser supports typed arrays.
   *
   * Note:
   *
   *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
   *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
   *
   *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
   *
   *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
   *     incorrect length in some situations.

   * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
   * get the Object implementation, which is slower but behaves correctly.
   */
  Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
    ? global$1.TYPED_ARRAY_SUPPORT
    : true;

  function kMaxLength () {
    return Buffer.TYPED_ARRAY_SUPPORT
      ? 0x7fffffff
      : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length);
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer(length);
      }
      that.length = length;
    }

    return that
  }

  /**
   * The Buffer constructor returns instances of `Uint8Array` that have their
   * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
   * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
   * and the `Uint8Array` methods. Square bracket notation works as expected -- it
   * returns a single octet.
   *
   * The `Uint8Array` prototype remains unmodified.
   */

  function Buffer (arg, encodingOrOffset, length) {
    if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
      return new Buffer(arg, encodingOrOffset, length)
    }

    // Common case.
    if (typeof arg === 'number') {
      if (typeof encodingOrOffset === 'string') {
        throw new Error(
          'If encoding is specified then the first argument must be a string'
        )
      }
      return allocUnsafe(this, arg)
    }
    return from(this, arg, encodingOrOffset, length)
  }

  Buffer.poolSize = 8192; // not used by this implementation

  // TODO: Legacy, not needed anymore. Remove in next major version.
  Buffer._augment = function (arr) {
    arr.__proto__ = Buffer.prototype;
    return arr
  };

  function from (that, value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('"value" argument must not be a number')
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return fromArrayBuffer(that, value, encodingOrOffset, length)
    }

    if (typeof value === 'string') {
      return fromString(that, value, encodingOrOffset)
    }

    return fromObject(that, value)
  }

  /**
   * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
   * if value is a number.
   * Buffer.from(str[, encoding])
   * Buffer.from(array)
   * Buffer.from(buffer)
   * Buffer.from(arrayBuffer[, byteOffset[, length]])
   **/
  Buffer.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  };

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    Buffer.prototype.__proto__ = Uint8Array.prototype;
    Buffer.__proto__ = Uint8Array;
  }

  function assertSize (size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number')
    } else if (size < 0) {
      throw new RangeError('"size" argument must not be negative')
    }
  }

  function alloc (that, size, fill, encoding) {
    assertSize(size);
    if (size <= 0) {
      return createBuffer(that, size)
    }
    if (fill !== undefined) {
      // Only pay attention to encoding if it's a string. This
      // prevents accidentally sending in a number that would
      // be interpretted as a start offset.
      return typeof encoding === 'string'
        ? createBuffer(that, size).fill(fill, encoding)
        : createBuffer(that, size).fill(fill)
    }
    return createBuffer(that, size)
  }

  /**
   * Creates a new filled Buffer instance.
   * alloc(size[, fill[, encoding]])
   **/
  Buffer.alloc = function (size, fill, encoding) {
    return alloc(null, size, fill, encoding)
  };

  function allocUnsafe (that, size) {
    assertSize(size);
    that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) {
      for (var i = 0; i < size; ++i) {
        that[i] = 0;
      }
    }
    return that
  }

  /**
   * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
   * */
  Buffer.allocUnsafe = function (size) {
    return allocUnsafe(null, size)
  };
  /**
   * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
   */
  Buffer.allocUnsafeSlow = function (size) {
    return allocUnsafe(null, size)
  };

  function fromString (that, string, encoding) {
    if (typeof encoding !== 'string' || encoding === '') {
      encoding = 'utf8';
    }

    if (!Buffer.isEncoding(encoding)) {
      throw new TypeError('"encoding" must be a valid string encoding')
    }

    var length = byteLength(string, encoding) | 0;
    that = createBuffer(that, length);

    var actual = that.write(string, encoding);

    if (actual !== length) {
      // Writing a hex string, for example, that contains invalid characters will
      // cause everything after the first invalid character to be ignored. (e.g.
      // 'abxxcd' will be treated as 'ab')
      that = that.slice(0, actual);
    }

    return that
  }

  function fromArrayLike (that, array) {
    var length = array.length < 0 ? 0 : checked(array.length) | 0;
    that = createBuffer(that, length);
    for (var i = 0; i < length; i += 1) {
      that[i] = array[i] & 255;
    }
    return that
  }

  function fromArrayBuffer (that, array, byteOffset, length) {
    array.byteLength; // this throws if `array` is not a valid ArrayBuffer

    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('\'offset\' is out of bounds')
    }

    if (array.byteLength < byteOffset + (length || 0)) {
      throw new RangeError('\'length\' is out of bounds')
    }

    if (byteOffset === undefined && length === undefined) {
      array = new Uint8Array(array);
    } else if (length === undefined) {
      array = new Uint8Array(array, byteOffset);
    } else {
      array = new Uint8Array(array, byteOffset, length);
    }

    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = array;
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      that = fromArrayLike(that, array);
    }
    return that
  }

  function fromObject (that, obj) {
    if (internalIsBuffer(obj)) {
      var len = checked(obj.length) | 0;
      that = createBuffer(that, len);

      if (that.length === 0) {
        return that
      }

      obj.copy(that, 0, 0, len);
      return that
    }

    if (obj) {
      if ((typeof ArrayBuffer !== 'undefined' &&
          obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
        if (typeof obj.length !== 'number' || isnan(obj.length)) {
          return createBuffer(that, 0)
        }
        return fromArrayLike(that, obj)
      }

      if (obj.type === 'Buffer' && isArray(obj.data)) {
        return fromArrayLike(that, obj.data)
      }
    }

    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
  }

  function checked (length) {
    // Note: cannot use `length < kMaxLength()` here because that fails when
    // length is NaN (which is otherwise coerced to zero.)
    if (length >= kMaxLength()) {
      throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                           'size: 0x' + kMaxLength().toString(16) + ' bytes')
    }
    return length | 0
  }
  Buffer.isBuffer = isBuffer;
  function internalIsBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  Buffer.compare = function compare (a, b) {
    if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
      throw new TypeError('Arguments must be Buffers')
    }

    if (a === b) return 0

    var x = a.length;
    var y = b.length;

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i];
        y = b[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  Buffer.isEncoding = function isEncoding (encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true
      default:
        return false
    }
  };

  Buffer.concat = function concat (list, length) {
    if (!isArray(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }

    if (list.length === 0) {
      return Buffer.alloc(0)
    }

    var i;
    if (length === undefined) {
      length = 0;
      for (i = 0; i < list.length; ++i) {
        length += list[i].length;
      }
    }

    var buffer = Buffer.allocUnsafe(length);
    var pos = 0;
    for (i = 0; i < list.length; ++i) {
      var buf = list[i];
      if (!internalIsBuffer(buf)) {
        throw new TypeError('"list" argument must be an Array of Buffers')
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer
  };

  function byteLength (string, encoding) {
    if (internalIsBuffer(string)) {
      return string.length
    }
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
        (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
      return string.byteLength
    }
    if (typeof string !== 'string') {
      string = '' + string;
    }

    var len = string.length;
    if (len === 0) return 0

    // Use a for loop to avoid recursion
    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'ascii':
        case 'latin1':
        case 'binary':
          return len
        case 'utf8':
        case 'utf-8':
        case undefined:
          return utf8ToBytes(string).length
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return len * 2
        case 'hex':
          return len >>> 1
        case 'base64':
          return base64ToBytes(string).length
        default:
          if (loweredCase) return utf8ToBytes(string).length // assume utf8
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }
  Buffer.byteLength = byteLength;

  function slowToString (encoding, start, end) {
    var loweredCase = false;

    // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
    // property of a typed array.

    // This behaves neither like String nor Uint8Array in that we set start/end
    // to their upper/lower bounds if the value passed is out of range.
    // undefined is handled specially as per ECMA-262 6th Edition,
    // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
    if (start === undefined || start < 0) {
      start = 0;
    }
    // Return early if start > this.length. Done here to prevent potential uint32
    // coercion fail below.
    if (start > this.length) {
      return ''
    }

    if (end === undefined || end > this.length) {
      end = this.length;
    }

    if (end <= 0) {
      return ''
    }

    // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0;
    start >>>= 0;

    if (end <= start) {
      return ''
    }

    if (!encoding) encoding = 'utf8';

    while (true) {
      switch (encoding) {
        case 'hex':
          return hexSlice(this, start, end)

        case 'utf8':
        case 'utf-8':
          return utf8Slice(this, start, end)

        case 'ascii':
          return asciiSlice(this, start, end)

        case 'latin1':
        case 'binary':
          return latin1Slice(this, start, end)

        case 'base64':
          return base64Slice(this, start, end)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return utf16leSlice(this, start, end)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = (encoding + '').toLowerCase();
          loweredCase = true;
      }
    }
  }

  // The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
  // Buffer instances.
  Buffer.prototype._isBuffer = true;

  function swap (b, n, m) {
    var i = b[n];
    b[n] = b[m];
    b[m] = i;
  }

  Buffer.prototype.swap16 = function swap16 () {
    var len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits')
    }
    for (var i = 0; i < len; i += 2) {
      swap(this, i, i + 1);
    }
    return this
  };

  Buffer.prototype.swap32 = function swap32 () {
    var len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits')
    }
    for (var i = 0; i < len; i += 4) {
      swap(this, i, i + 3);
      swap(this, i + 1, i + 2);
    }
    return this
  };

  Buffer.prototype.swap64 = function swap64 () {
    var len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits')
    }
    for (var i = 0; i < len; i += 8) {
      swap(this, i, i + 7);
      swap(this, i + 1, i + 6);
      swap(this, i + 2, i + 5);
      swap(this, i + 3, i + 4);
    }
    return this
  };

  Buffer.prototype.toString = function toString () {
    var length = this.length | 0;
    if (length === 0) return ''
    if (arguments.length === 0) return utf8Slice(this, 0, length)
    return slowToString.apply(this, arguments)
  };

  Buffer.prototype.equals = function equals (b) {
    if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
    if (this === b) return true
    return Buffer.compare(this, b) === 0
  };

  Buffer.prototype.inspect = function inspect () {
    var str = '';
    var max = INSPECT_MAX_BYTES;
    if (this.length > 0) {
      str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
      if (this.length > max) str += ' ... ';
    }
    return '<Buffer ' + str + '>'
  };

  Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
    if (!internalIsBuffer(target)) {
      throw new TypeError('Argument must be a Buffer')
    }

    if (start === undefined) {
      start = 0;
    }
    if (end === undefined) {
      end = target ? target.length : 0;
    }
    if (thisStart === undefined) {
      thisStart = 0;
    }
    if (thisEnd === undefined) {
      thisEnd = this.length;
    }

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index')
    }

    if (thisStart >= thisEnd && start >= end) {
      return 0
    }
    if (thisStart >= thisEnd) {
      return -1
    }
    if (start >= end) {
      return 1
    }

    start >>>= 0;
    end >>>= 0;
    thisStart >>>= 0;
    thisEnd >>>= 0;

    if (this === target) return 0

    var x = thisEnd - thisStart;
    var y = end - start;
    var len = Math.min(x, y);

    var thisCopy = this.slice(thisStart, thisEnd);
    var targetCopy = target.slice(start, end);

    for (var i = 0; i < len; ++i) {
      if (thisCopy[i] !== targetCopy[i]) {
        x = thisCopy[i];
        y = targetCopy[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  // Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
  // OR the last index of `val` in `buffer` at offset <= `byteOffset`.
  //
  // Arguments:
  // - buffer - a Buffer to search
  // - val - a string, Buffer, or number
  // - byteOffset - an index into `buffer`; will be clamped to an int32
  // - encoding - an optional encoding, relevant is val is a string
  // - dir - true for indexOf, false for lastIndexOf
  function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
    // Empty buffer means no match
    if (buffer.length === 0) return -1

    // Normalize byteOffset
    if (typeof byteOffset === 'string') {
      encoding = byteOffset;
      byteOffset = 0;
    } else if (byteOffset > 0x7fffffff) {
      byteOffset = 0x7fffffff;
    } else if (byteOffset < -0x80000000) {
      byteOffset = -0x80000000;
    }
    byteOffset = +byteOffset;  // Coerce to Number.
    if (isNaN(byteOffset)) {
      // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
      byteOffset = dir ? 0 : (buffer.length - 1);
    }

    // Normalize byteOffset: negative offsets start from the end of the buffer
    if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
    if (byteOffset >= buffer.length) {
      if (dir) return -1
      else byteOffset = buffer.length - 1;
    } else if (byteOffset < 0) {
      if (dir) byteOffset = 0;
      else return -1
    }

    // Normalize val
    if (typeof val === 'string') {
      val = Buffer.from(val, encoding);
    }

    // Finally, search either indexOf (if dir is true) or lastIndexOf
    if (internalIsBuffer(val)) {
      // Special case: looking for empty string/buffer always fails
      if (val.length === 0) {
        return -1
      }
      return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
    } else if (typeof val === 'number') {
      val = val & 0xFF; // Search for a byte value [0-255]
      if (Buffer.TYPED_ARRAY_SUPPORT &&
          typeof Uint8Array.prototype.indexOf === 'function') {
        if (dir) {
          return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
        } else {
          return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
        }
      }
      return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
    }

    throw new TypeError('val must be string, number or Buffer')
  }

  function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
    var indexSize = 1;
    var arrLength = arr.length;
    var valLength = val.length;

    if (encoding !== undefined) {
      encoding = String(encoding).toLowerCase();
      if (encoding === 'ucs2' || encoding === 'ucs-2' ||
          encoding === 'utf16le' || encoding === 'utf-16le') {
        if (arr.length < 2 || val.length < 2) {
          return -1
        }
        indexSize = 2;
        arrLength /= 2;
        valLength /= 2;
        byteOffset /= 2;
      }
    }

    function read (buf, i) {
      if (indexSize === 1) {
        return buf[i]
      } else {
        return buf.readUInt16BE(i * indexSize)
      }
    }

    var i;
    if (dir) {
      var foundIndex = -1;
      for (i = byteOffset; i < arrLength; i++) {
        if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
          if (foundIndex === -1) foundIndex = i;
          if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
        } else {
          if (foundIndex !== -1) i -= i - foundIndex;
          foundIndex = -1;
        }
      }
    } else {
      if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
      for (i = byteOffset; i >= 0; i--) {
        var found = true;
        for (var j = 0; j < valLength; j++) {
          if (read(arr, i + j) !== read(val, j)) {
            found = false;
            break
          }
        }
        if (found) return i
      }
    }

    return -1
  }

  Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
    return this.indexOf(val, byteOffset, encoding) !== -1
  };

  Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
  };

  Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
  };

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0;
    var remaining = buf.length - offset;
    if (!length) {
      length = remaining;
    } else {
      length = Number(length);
      if (length > remaining) {
        length = remaining;
      }
    }

    // must be an even number of digits
    var strLen = string.length;
    if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

    if (length > strLen / 2) {
      length = strLen / 2;
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16);
      if (isNaN(parsed)) return i
      buf[offset + i] = parsed;
    }
    return i
  }

  function utf8Write (buf, string, offset, length) {
    return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  }

  function asciiWrite (buf, string, offset, length) {
    return blitBuffer(asciiToBytes(string), buf, offset, length)
  }

  function latin1Write (buf, string, offset, length) {
    return asciiWrite(buf, string, offset, length)
  }

  function base64Write (buf, string, offset, length) {
    return blitBuffer(base64ToBytes(string), buf, offset, length)
  }

  function ucs2Write (buf, string, offset, length) {
    return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  }

  Buffer.prototype.write = function write (string, offset, length, encoding) {
    // Buffer#write(string)
    if (offset === undefined) {
      encoding = 'utf8';
      length = this.length;
      offset = 0;
    // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset;
      length = this.length;
      offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset | 0;
      if (isFinite(length)) {
        length = length | 0;
        if (encoding === undefined) encoding = 'utf8';
      } else {
        encoding = length;
        length = undefined;
      }
    // legacy write(string, encoding, offset, length) - remove in v0.13
    } else {
      throw new Error(
        'Buffer.write(string, encoding, offset[, length]) is no longer supported'
      )
    }

    var remaining = this.length - offset;
    if (length === undefined || length > remaining) length = remaining;

    if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
      throw new RangeError('Attempt to write outside buffer bounds')
    }

    if (!encoding) encoding = 'utf8';

    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'hex':
          return hexWrite(this, string, offset, length)

        case 'utf8':
        case 'utf-8':
          return utf8Write(this, string, offset, length)

        case 'ascii':
          return asciiWrite(this, string, offset, length)

        case 'latin1':
        case 'binary':
          return latin1Write(this, string, offset, length)

        case 'base64':
          // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return ucs2Write(this, string, offset, length)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  };

  Buffer.prototype.toJSON = function toJSON () {
    return {
      type: 'Buffer',
      data: Array.prototype.slice.call(this._arr || this, 0)
    }
  };

  function base64Slice (buf, start, end) {
    if (start === 0 && end === buf.length) {
      return fromByteArray(buf)
    } else {
      return fromByteArray(buf.slice(start, end))
    }
  }

  function utf8Slice (buf, start, end) {
    end = Math.min(buf.length, end);
    var res = [];

    var i = start;
    while (i < end) {
      var firstByte = buf[i];
      var codePoint = null;
      var bytesPerSequence = (firstByte > 0xEF) ? 4
        : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
        : 1;

      if (i + bytesPerSequence <= end) {
        var secondByte, thirdByte, fourthByte, tempCodePoint;

        switch (bytesPerSequence) {
          case 1:
            if (firstByte < 0x80) {
              codePoint = firstByte;
            }
            break
          case 2:
            secondByte = buf[i + 1];
            if ((secondByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
              if (tempCodePoint > 0x7F) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 3:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
              if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 4:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            fourthByte = buf[i + 3];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
              if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
                codePoint = tempCodePoint;
              }
            }
        }
      }

      if (codePoint === null) {
        // we did not generate a valid codePoint so insert a
        // replacement char (U+FFFD) and advance only 1 byte
        codePoint = 0xFFFD;
        bytesPerSequence = 1;
      } else if (codePoint > 0xFFFF) {
        // encode to utf16 (surrogate pair dance)
        codePoint -= 0x10000;
        res.push(codePoint >>> 10 & 0x3FF | 0xD800);
        codePoint = 0xDC00 | codePoint & 0x3FF;
      }

      res.push(codePoint);
      i += bytesPerSequence;
    }

    return decodeCodePointsArray(res)
  }

  // Based on http://stackoverflow.com/a/22747272/680742, the browser with
  // the lowest limit is Chrome, with 0x10000 args.
  // We go 1 magnitude less, for safety
  var MAX_ARGUMENTS_LENGTH = 0x1000;

  function decodeCodePointsArray (codePoints) {
    var len = codePoints.length;
    if (len <= MAX_ARGUMENTS_LENGTH) {
      return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
    }

    // Decode in chunks to avoid "call stack size exceeded".
    var res = '';
    var i = 0;
    while (i < len) {
      res += String.fromCharCode.apply(
        String,
        codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
      );
    }
    return res
  }

  function asciiSlice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i] & 0x7F);
    }
    return ret
  }

  function latin1Slice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i]);
    }
    return ret
  }

  function hexSlice (buf, start, end) {
    var len = buf.length;

    if (!start || start < 0) start = 0;
    if (!end || end < 0 || end > len) end = len;

    var out = '';
    for (var i = start; i < end; ++i) {
      out += toHex(buf[i]);
    }
    return out
  }

  function utf16leSlice (buf, start, end) {
    var bytes = buf.slice(start, end);
    var res = '';
    for (var i = 0; i < bytes.length; i += 2) {
      res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
    }
    return res
  }

  Buffer.prototype.slice = function slice (start, end) {
    var len = this.length;
    start = ~~start;
    end = end === undefined ? len : ~~end;

    if (start < 0) {
      start += len;
      if (start < 0) start = 0;
    } else if (start > len) {
      start = len;
    }

    if (end < 0) {
      end += len;
      if (end < 0) end = 0;
    } else if (end > len) {
      end = len;
    }

    if (end < start) end = start;

    var newBuf;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      newBuf = this.subarray(start, end);
      newBuf.__proto__ = Buffer.prototype;
    } else {
      var sliceLen = end - start;
      newBuf = new Buffer(sliceLen, undefined);
      for (var i = 0; i < sliceLen; ++i) {
        newBuf[i] = this[i + start];
      }
    }

    return newBuf
  };

  /*
   * Need to make sure that buffer isn't trying to write out of bounds.
   */
  function checkOffset (offset, ext, length) {
    if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
    if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
  }

  Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }

    return val
  };

  Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length);
    }

    var val = this[offset + --byteLength];
    var mul = 1;
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul;
    }

    return val
  };

  Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    return this[offset]
  };

  Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return this[offset] | (this[offset + 1] << 8)
  };

  Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return (this[offset] << 8) | this[offset + 1]
  };

  Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return ((this[offset]) |
        (this[offset + 1] << 8) |
        (this[offset + 2] << 16)) +
        (this[offset + 3] * 0x1000000)
  };

  Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
  };

  Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var i = byteLength;
    var mul = 1;
    var val = this[offset + --i];
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    if (!(this[offset] & 0x80)) return (this[offset])
    return ((0xff - this[offset] + 1) * -1)
  };

  Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset] | (this[offset + 1] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset + 1] | (this[offset] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
  };

  Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
  };

  Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, true, 23, 4)
  };

  Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, false, 23, 4)
  };

  Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, true, 52, 8)
  };

  Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, false, 52, 8)
  };

  function checkInt (buf, value, offset, ext, max, min) {
    if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
    if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
  }

  Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var mul = 1;
    var i = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var i = byteLength - 1;
    var mul = 1;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    this[offset] = (value & 0xff);
    return offset + 1
  };

  function objectWriteUInt16 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
      buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
        (littleEndian ? i : 1 - i) * 8;
    }
  }

  Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  function objectWriteUInt32 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffffffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
      buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
    }
  }

  Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset + 3] = (value >>> 24);
      this[offset + 2] = (value >>> 16);
      this[offset + 1] = (value >>> 8);
      this[offset] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = 0;
    var mul = 1;
    var sub = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = byteLength - 1;
    var mul = 1;
    var sub = 0;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
    if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    if (value < 0) value = 0xff + value + 1;
    this[offset] = (value & 0xff);
    return offset + 1
  };

  Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
      this[offset + 2] = (value >>> 16);
      this[offset + 3] = (value >>> 24);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (value < 0) value = 0xffffffff + value + 1;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  function checkIEEE754 (buf, value, offset, ext, max, min) {
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
    if (offset < 0) throw new RangeError('Index out of range')
  }

  function writeFloat (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 4);
    }
    write(buf, value, offset, littleEndian, 23, 4);
    return offset + 4
  }

  Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
    return writeFloat(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
    return writeFloat(this, value, offset, false, noAssert)
  };

  function writeDouble (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 8);
    }
    write(buf, value, offset, littleEndian, 52, 8);
    return offset + 8
  }

  Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
    return writeDouble(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
    return writeDouble(this, value, offset, false, noAssert)
  };

  // copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
  Buffer.prototype.copy = function copy (target, targetStart, start, end) {
    if (!start) start = 0;
    if (!end && end !== 0) end = this.length;
    if (targetStart >= target.length) targetStart = target.length;
    if (!targetStart) targetStart = 0;
    if (end > 0 && end < start) end = start;

    // Copy 0 bytes; we're done
    if (end === start) return 0
    if (target.length === 0 || this.length === 0) return 0

    // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError('targetStart out of bounds')
    }
    if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
    if (end < 0) throw new RangeError('sourceEnd out of bounds')

    // Are we oob?
    if (end > this.length) end = this.length;
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    var len = end - start;
    var i;

    if (this === target && start < targetStart && targetStart < end) {
      // descending copy from end
      for (i = len - 1; i >= 0; --i) {
        target[i + targetStart] = this[i + start];
      }
    } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
      // ascending copy from start
      for (i = 0; i < len; ++i) {
        target[i + targetStart] = this[i + start];
      }
    } else {
      Uint8Array.prototype.set.call(
        target,
        this.subarray(start, start + len),
        targetStart
      );
    }

    return len
  };

  // Usage:
  //    buffer.fill(number[, offset[, end]])
  //    buffer.fill(buffer[, offset[, end]])
  //    buffer.fill(string[, offset[, end]][, encoding])
  Buffer.prototype.fill = function fill (val, start, end, encoding) {
    // Handle string cases:
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === 'string') {
        encoding = end;
        end = this.length;
      }
      if (val.length === 1) {
        var code = val.charCodeAt(0);
        if (code < 256) {
          val = code;
        }
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string')
      }
      if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding)
      }
    } else if (typeof val === 'number') {
      val = val & 255;
    }

    // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index')
    }

    if (end <= start) {
      return this
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) val = 0;

    var i;
    if (typeof val === 'number') {
      for (i = start; i < end; ++i) {
        this[i] = val;
      }
    } else {
      var bytes = internalIsBuffer(val)
        ? val
        : utf8ToBytes(new Buffer(val, encoding).toString());
      var len = bytes.length;
      for (i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len];
      }
    }

    return this
  };

  // HELPER FUNCTIONS
  // ================

  var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

  function base64clean (str) {
    // Node strips out invalid characters like \n and \t from the string, base64-js does not
    str = stringtrim(str).replace(INVALID_BASE64_RE, '');
    // Node converts strings with length < 2 to ''
    if (str.length < 2) return ''
    // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
    while (str.length % 4 !== 0) {
      str = str + '=';
    }
    return str
  }

  function stringtrim (str) {
    if (str.trim) return str.trim()
    return str.replace(/^\s+|\s+$/g, '')
  }

  function toHex (n) {
    if (n < 16) return '0' + n.toString(16)
    return n.toString(16)
  }

  function utf8ToBytes (string, units) {
    units = units || Infinity;
    var codePoint;
    var length = string.length;
    var leadSurrogate = null;
    var bytes = [];

    for (var i = 0; i < length; ++i) {
      codePoint = string.charCodeAt(i);

      // is surrogate component
      if (codePoint > 0xD7FF && codePoint < 0xE000) {
        // last char was a lead
        if (!leadSurrogate) {
          // no lead yet
          if (codePoint > 0xDBFF) {
            // unexpected trail
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          } else if (i + 1 === length) {
            // unpaired lead
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          }

          // valid lead
          leadSurrogate = codePoint;

          continue
        }

        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          leadSurrogate = codePoint;
          continue
        }

        // valid surrogate pair
        codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
      } else if (leadSurrogate) {
        // valid bmp char, but last char was a lead
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
      }

      leadSurrogate = null;

      // encode utf8
      if (codePoint < 0x80) {
        if ((units -= 1) < 0) break
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        if ((units -= 2) < 0) break
        bytes.push(
          codePoint >> 0x6 | 0xC0,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x10000) {
        if ((units -= 3) < 0) break
        bytes.push(
          codePoint >> 0xC | 0xE0,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x110000) {
        if ((units -= 4) < 0) break
        bytes.push(
          codePoint >> 0x12 | 0xF0,
          codePoint >> 0xC & 0x3F | 0x80,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else {
        throw new Error('Invalid code point')
      }
    }

    return bytes
  }

  function asciiToBytes (str) {
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      // Node's code seems to be doing this and not & 0x7F..
      byteArray.push(str.charCodeAt(i) & 0xFF);
    }
    return byteArray
  }

  function utf16leToBytes (str, units) {
    var c, hi, lo;
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      if ((units -= 2) < 0) break

      c = str.charCodeAt(i);
      hi = c >> 8;
      lo = c % 256;
      byteArray.push(lo);
      byteArray.push(hi);
    }

    return byteArray
  }


  function base64ToBytes (str) {
    return toByteArray(base64clean(str))
  }

  function blitBuffer (src, dst, offset, length) {
    for (var i = 0; i < length; ++i) {
      if ((i + offset >= dst.length) || (i >= src.length)) break
      dst[i + offset] = src[i];
    }
    return i
  }

  function isnan (val) {
    return val !== val // eslint-disable-line no-self-compare
  }


  // the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
  // The _isBuffer check is for Safari 5-7 support, because it's missing
  // Object.prototype.constructor. Remove this eventually
  function isBuffer(obj) {
    return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
  }

  function isFastBuffer (obj) {
    return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

  // For Node v0.10 support. Remove this eventually.
  function isSlowBuffer (obj) {
    return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
  }

  // shim for using process in browser
  // based off https://github.com/defunctzombie/node-process/blob/master/browser.js

  function defaultSetTimout() {
      throw new Error('setTimeout has not been defined');
  }
  function defaultClearTimeout () {
      throw new Error('clearTimeout has not been defined');
  }
  var cachedSetTimeout = defaultSetTimout;
  var cachedClearTimeout = defaultClearTimeout;
  if (typeof global$1.setTimeout === 'function') {
      cachedSetTimeout = setTimeout;
  }
  if (typeof global$1.clearTimeout === 'function') {
      cachedClearTimeout = clearTimeout;
  }

  function runTimeout(fun) {
      if (cachedSetTimeout === setTimeout) {
          //normal enviroments in sane situations
          return setTimeout(fun, 0);
      }
      // if setTimeout wasn't available but was latter defined
      if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
          cachedSetTimeout = setTimeout;
          return setTimeout(fun, 0);
      }
      try {
          // when when somebody has screwed with setTimeout but no I.E. maddness
          return cachedSetTimeout(fun, 0);
      } catch(e){
          try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
              return cachedSetTimeout.call(null, fun, 0);
          } catch(e){
              // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
              return cachedSetTimeout.call(this, fun, 0);
          }
      }


  }
  function runClearTimeout(marker) {
      if (cachedClearTimeout === clearTimeout) {
          //normal enviroments in sane situations
          return clearTimeout(marker);
      }
      // if clearTimeout wasn't available but was latter defined
      if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
          cachedClearTimeout = clearTimeout;
          return clearTimeout(marker);
      }
      try {
          // when when somebody has screwed with setTimeout but no I.E. maddness
          return cachedClearTimeout(marker);
      } catch (e){
          try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
              return cachedClearTimeout.call(null, marker);
          } catch (e){
              // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
              // Some versions of I.E. have different rules for clearTimeout vs setTimeout
              return cachedClearTimeout.call(this, marker);
          }
      }



  }
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;

  function cleanUpNextTick() {
      if (!draining || !currentQueue) {
          return;
      }
      draining = false;
      if (currentQueue.length) {
          queue = currentQueue.concat(queue);
      } else {
          queueIndex = -1;
      }
      if (queue.length) {
          drainQueue();
      }
  }

  function drainQueue() {
      if (draining) {
          return;
      }
      var timeout = runTimeout(cleanUpNextTick);
      draining = true;

      var len = queue.length;
      while(len) {
          currentQueue = queue;
          queue = [];
          while (++queueIndex < len) {
              if (currentQueue) {
                  currentQueue[queueIndex].run();
              }
          }
          queueIndex = -1;
          len = queue.length;
      }
      currentQueue = null;
      draining = false;
      runClearTimeout(timeout);
  }
  function nextTick(fun) {
      var args = new Array(arguments.length - 1);
      if (arguments.length > 1) {
          for (var i = 1; i < arguments.length; i++) {
              args[i - 1] = arguments[i];
          }
      }
      queue.push(new Item(fun, args));
      if (queue.length === 1 && !draining) {
          runTimeout(drainQueue);
      }
  }
  // v8 likes predictible objects
  function Item(fun, array) {
      this.fun = fun;
      this.array = array;
  }
  Item.prototype.run = function () {
      this.fun.apply(null, this.array);
  };
  var title = 'browser';
  var platform = 'browser';
  var browser = true;
  var env = {};
  var argv = [];
  var version = ''; // empty string to avoid regexp issues
  var versions = {};
  var release = {};
  var config = {};

  function noop$1() {}

  var on$1 = noop$1;
  var addListener = noop$1;
  var once = noop$1;
  var off = noop$1;
  var removeListener = noop$1;
  var removeAllListeners = noop$1;
  var emit = noop$1;

  function binding(name) {
      throw new Error('process.binding is not supported');
  }

  function cwd () { return '/' }
  function chdir (dir) {
      throw new Error('process.chdir is not supported');
  }function umask() { return 0; }

  // from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
  var performance$1 = global$1.performance || {};
  var performanceNow =
    performance$1.now        ||
    performance$1.mozNow     ||
    performance$1.msNow      ||
    performance$1.oNow       ||
    performance$1.webkitNow  ||
    function(){ return (new Date()).getTime() };

  // generate timestamp or delta
  // see http://nodejs.org/api/process.html#process_process_hrtime
  function hrtime(previousTimestamp){
    var clocktime = performanceNow.call(performance$1)*1e-3;
    var seconds = Math.floor(clocktime);
    var nanoseconds = Math.floor((clocktime%1)*1e9);
    if (previousTimestamp) {
      seconds = seconds - previousTimestamp[0];
      nanoseconds = nanoseconds - previousTimestamp[1];
      if (nanoseconds<0) {
        seconds--;
        nanoseconds += 1e9;
      }
    }
    return [seconds,nanoseconds]
  }

  var startTime = new Date();
  function uptime() {
    var currentTime = new Date();
    var dif = currentTime - startTime;
    return dif / 1000;
  }

  var process = {
    nextTick: nextTick,
    title: title,
    browser: browser,
    env: env,
    argv: argv,
    version: version,
    versions: versions,
    on: on$1,
    addListener: addListener,
    once: once,
    off: off,
    removeListener: removeListener,
    removeAllListeners: removeAllListeners,
    emit: emit,
    binding: binding,
    cwd: cwd,
    chdir: chdir,
    umask: umask,
    hrtime: hrtime,
    platform: platform,
    release: release,
    config: config,
    uptime: uptime
  };

  function isNull(arg) {
    return arg === null;
  }

  function isNullOrUndefined(arg) {
    return arg == null;
  }

  function isString(arg) {
    return typeof arg === 'string';
  }

  function isObject(arg) {
    return typeof arg === 'object' && arg !== null;
  }

  // Copyright Joyent, Inc. and other Node contributors.
  //
  // Permission is hereby granted, free of charge, to any person obtaining a
  // copy of this software and associated documentation files (the
  // "Software"), to deal in the Software without restriction, including
  // without limitation the rights to use, copy, modify, merge, publish,
  // distribute, sublicense, and/or sell copies of the Software, and to permit
  // persons to whom the Software is furnished to do so, subject to the
  // following conditions:
  //
  // The above copyright notice and this permission notice shall be included
  // in all copies or substantial portions of the Software.
  //
  // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
  // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
  // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
  // USE OR OTHER DEALINGS IN THE SOFTWARE.


  // If obj.hasOwnProperty has been overridden, then calling
  // obj.hasOwnProperty(prop) will break.
  // See: https://github.com/joyent/node/issues/1707
  function hasOwnProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }
  var isArray$1 = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
  };
  function stringifyPrimitive(v) {
    switch (typeof v) {
      case 'string':
        return v;

      case 'boolean':
        return v ? 'true' : 'false';

      case 'number':
        return isFinite(v) ? v : '';

      default:
        return '';
    }
  }

  function stringify (obj, sep, eq, name) {
    sep = sep || '&';
    eq = eq || '=';
    if (obj === null) {
      obj = undefined;
    }

    if (typeof obj === 'object') {
      return map$2(objectKeys(obj), function(k) {
        var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
        if (isArray$1(obj[k])) {
          return map$2(obj[k], function(v) {
            return ks + encodeURIComponent(stringifyPrimitive(v));
          }).join(sep);
        } else {
          return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
        }
      }).join(sep);

    }

    if (!name) return '';
    return encodeURIComponent(stringifyPrimitive(name)) + eq +
           encodeURIComponent(stringifyPrimitive(obj));
  }
  function map$2 (xs, f) {
    if (xs.map) return xs.map(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
      res.push(f(xs[i], i));
    }
    return res;
  }

  var objectKeys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
  };

  function parse(qs, sep, eq, options) {
    sep = sep || '&';
    eq = eq || '=';
    var obj = {};

    if (typeof qs !== 'string' || qs.length === 0) {
      return obj;
    }

    var regexp = /\+/g;
    qs = qs.split(sep);

    var maxKeys = 1000;
    if (options && typeof options.maxKeys === 'number') {
      maxKeys = options.maxKeys;
    }

    var len = qs.length;
    // maxKeys <= 0 means that we should not limit keys count
    if (maxKeys > 0 && len > maxKeys) {
      len = maxKeys;
    }

    for (var i = 0; i < len; ++i) {
      var x = qs[i].replace(regexp, '%20'),
          idx = x.indexOf(eq),
          kstr, vstr, k, v;

      if (idx >= 0) {
        kstr = x.substr(0, idx);
        vstr = x.substr(idx + 1);
      } else {
        kstr = x;
        vstr = '';
      }

      k = decodeURIComponent(kstr);
      v = decodeURIComponent(vstr);

      if (!hasOwnProperty(obj, k)) {
        obj[k] = v;
      } else if (isArray$1(obj[k])) {
        obj[k].push(v);
      } else {
        obj[k] = [obj[k], v];
      }
    }

    return obj;
  }

  // Copyright Joyent, Inc. and other Node contributors.
  var require$$0 = {
    parse: urlParse,
    resolve: urlResolve,
    resolveObject: urlResolveObject,
    format: urlFormat,
    Url: Url
  };
  function Url() {
    this.protocol = null;
    this.slashes = null;
    this.auth = null;
    this.host = null;
    this.port = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.query = null;
    this.pathname = null;
    this.path = null;
    this.href = null;
  }

  // Reference: RFC 3986, RFC 1808, RFC 2396

  // define these here so at least they only have to be
  // compiled once on the first module load.
  var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    };

  function urlParse(url, parseQueryString, slashesDenoteHost) {
    if (url && isObject(url) && url instanceof Url) return url;

    var u = new Url;
    u.parse(url, parseQueryString, slashesDenoteHost);
    return u;
  }
  Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
    return parse$1(this, url, parseQueryString, slashesDenoteHost);
  };

  function parse$1(self, url, parseQueryString, slashesDenoteHost) {
    if (!isString(url)) {
      throw new TypeError('Parameter \'url\' must be a string, not ' + typeof url);
    }

    // Copy chrome, IE, opera backslash-handling behavior.
    // Back slashes before the query string get converted to forward slashes
    // See: https://code.google.com/p/chromium/issues/detail?id=25916
    var queryIndex = url.indexOf('?'),
      splitter =
      (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
    uSplit[0] = uSplit[0].replace(slashRegex, '/');
    url = uSplit.join(splitter);

    var rest = url;

    // trim before proceeding.
    // This is to support parse stuff like "  http://foo.com  \n"
    rest = rest.trim();

    if (!slashesDenoteHost && url.split('#').length === 1) {
      // Try fast path regexp
      var simplePath = simplePathPattern.exec(rest);
      if (simplePath) {
        self.path = rest;
        self.href = rest;
        self.pathname = simplePath[1];
        if (simplePath[2]) {
          self.search = simplePath[2];
          if (parseQueryString) {
            self.query = parse(self.search.substr(1));
          } else {
            self.query = self.search.substr(1);
          }
        } else if (parseQueryString) {
          self.search = '';
          self.query = {};
        }
        return self;
      }
    }

    var proto = protocolPattern.exec(rest);
    if (proto) {
      proto = proto[0];
      var lowerProto = proto.toLowerCase();
      self.protocol = lowerProto;
      rest = rest.substr(proto.length);
    }

    // figure out if it's got a host
    // user@server is *always* interpreted as a hostname, and url
    // resolution will treat //foo/bar as host=foo,path=bar because that's
    // how the browser resolves relative URLs.
    if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
      var slashes = rest.substr(0, 2) === '//';
      if (slashes && !(proto && hostlessProtocol[proto])) {
        rest = rest.substr(2);
        self.slashes = true;
      }
    }
    var i, hec, l, p;
    if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

      // there's a hostname.
      // the first instance of /, ?, ;, or # ends the host.
      //
      // If there is an @ in the hostname, then non-host chars *are* allowed
      // to the left of the last @ sign, unless some host-ending character
      // comes *before* the @-sign.
      // URLs are obnoxious.
      //
      // ex:
      // http://a@b@c/ => user:a@b host:c
      // http://a@b?@c => user:a host:c path:/?@c

      // v0.12 TODO(isaacs): This is not quite how Chrome does things.
      // Review our test case against browsers more comprehensively.

      // find the first instance of any hostEndingChars
      var hostEnd = -1;
      for (i = 0; i < hostEndingChars.length; i++) {
        hec = rest.indexOf(hostEndingChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
          hostEnd = hec;
      }

      // at this point, either we have an explicit point where the
      // auth portion cannot go past, or the last @ char is the decider.
      var auth, atSign;
      if (hostEnd === -1) {
        // atSign can be anywhere.
        atSign = rest.lastIndexOf('@');
      } else {
        // atSign must be in auth portion.
        // http://a@b/c@d => host:b auth:a path:/c@d
        atSign = rest.lastIndexOf('@', hostEnd);
      }

      // Now we have a portion which is definitely the auth.
      // Pull that off.
      if (atSign !== -1) {
        auth = rest.slice(0, atSign);
        rest = rest.slice(atSign + 1);
        self.auth = decodeURIComponent(auth);
      }

      // the host is the remaining to the left of the first non-host char
      hostEnd = -1;
      for (i = 0; i < nonHostChars.length; i++) {
        hec = rest.indexOf(nonHostChars[i]);
        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
          hostEnd = hec;
      }
      // if we still have not hit it, then the entire thing is a host.
      if (hostEnd === -1)
        hostEnd = rest.length;

      self.host = rest.slice(0, hostEnd);
      rest = rest.slice(hostEnd);

      // pull out port.
      parseHost(self);

      // we've indicated that there is a hostname,
      // so even if it's empty, it has to be present.
      self.hostname = self.hostname || '';

      // if hostname begins with [ and ends with ]
      // assume that it's an IPv6 address.
      var ipv6Hostname = self.hostname[0] === '[' &&
        self.hostname[self.hostname.length - 1] === ']';

      // validate a little.
      if (!ipv6Hostname) {
        var hostparts = self.hostname.split(/\./);
        for (i = 0, l = hostparts.length; i < l; i++) {
          var part = hostparts[i];
          if (!part) continue;
          if (!part.match(hostnamePartPattern)) {
            var newpart = '';
            for (var j = 0, k = part.length; j < k; j++) {
              if (part.charCodeAt(j) > 127) {
                // we replace non-ASCII char with a temporary placeholder
                // we need this to make sure size of hostname is not
                // broken by replacing non-ASCII by nothing
                newpart += 'x';
              } else {
                newpart += part[j];
              }
            }
            // we test again with ASCII char only
            if (!newpart.match(hostnamePartPattern)) {
              var validParts = hostparts.slice(0, i);
              var notHost = hostparts.slice(i + 1);
              var bit = part.match(hostnamePartStart);
              if (bit) {
                validParts.push(bit[1]);
                notHost.unshift(bit[2]);
              }
              if (notHost.length) {
                rest = '/' + notHost.join('.') + rest;
              }
              self.hostname = validParts.join('.');
              break;
            }
          }
        }
      }

      if (self.hostname.length > hostnameMaxLen) {
        self.hostname = '';
      } else {
        // hostnames are always lower case.
        self.hostname = self.hostname.toLowerCase();
      }

      if (!ipv6Hostname) {
        // IDNA Support: Returns a punycoded representation of "domain".
        // It only converts parts of the domain name that
        // have non-ASCII characters, i.e. it doesn't matter if
        // you call it with a domain that already is ASCII-only.
        self.hostname = toASCII(self.hostname);
      }

      p = self.port ? ':' + self.port : '';
      var h = self.hostname || '';
      self.host = h + p;
      self.href += self.host;

      // strip [ and ] from the hostname
      // the host field still retains them, though
      if (ipv6Hostname) {
        self.hostname = self.hostname.substr(1, self.hostname.length - 2);
        if (rest[0] !== '/') {
          rest = '/' + rest;
        }
      }
    }

    // now rest is set to the post-host stuff.
    // chop off any delim chars.
    if (!unsafeProtocol[lowerProto]) {

      // First, make 100% sure that any "autoEscape" chars get
      // escaped, even if encodeURIComponent doesn't think they
      // need to be.
      for (i = 0, l = autoEscape.length; i < l; i++) {
        var ae = autoEscape[i];
        if (rest.indexOf(ae) === -1)
          continue;
        var esc = encodeURIComponent(ae);
        if (esc === ae) {
          esc = escape(ae);
        }
        rest = rest.split(ae).join(esc);
      }
    }


    // chop off from the tail first.
    var hash = rest.indexOf('#');
    if (hash !== -1) {
      // got a fragment string.
      self.hash = rest.substr(hash);
      rest = rest.slice(0, hash);
    }
    var qm = rest.indexOf('?');
    if (qm !== -1) {
      self.search = rest.substr(qm);
      self.query = rest.substr(qm + 1);
      if (parseQueryString) {
        self.query = parse(self.query);
      }
      rest = rest.slice(0, qm);
    } else if (parseQueryString) {
      // no query string, but parseQueryString still requested
      self.search = '';
      self.query = {};
    }
    if (rest) self.pathname = rest;
    if (slashedProtocol[lowerProto] &&
      self.hostname && !self.pathname) {
      self.pathname = '/';
    }

    //to support http.request
    if (self.pathname || self.search) {
      p = self.pathname || '';
      var s = self.search || '';
      self.path = p + s;
    }

    // finally, reconstruct the href based on what has been validated.
    self.href = format(self);
    return self;
  }

  // format a parsed object into a url string
  function urlFormat(obj) {
    // ensure it's an object, and not a string url.
    // If it's an obj, this is a no-op.
    // this way, you can call url_format() on strings
    // to clean up potentially wonky urls.
    if (isString(obj)) obj = parse$1({}, obj);
    return format(obj);
  }

  function format(self) {
    var auth = self.auth || '';
    if (auth) {
      auth = encodeURIComponent(auth);
      auth = auth.replace(/%3A/i, ':');
      auth += '@';
    }

    var protocol = self.protocol || '',
      pathname = self.pathname || '',
      hash = self.hash || '',
      host = false,
      query = '';

    if (self.host) {
      host = auth + self.host;
    } else if (self.hostname) {
      host = auth + (self.hostname.indexOf(':') === -1 ?
        self.hostname :
        '[' + this.hostname + ']');
      if (self.port) {
        host += ':' + self.port;
      }
    }

    if (self.query &&
      isObject(self.query) &&
      Object.keys(self.query).length) {
      query = stringify(self.query);
    }

    var search = self.search || (query && ('?' + query)) || '';

    if (protocol && protocol.substr(-1) !== ':') protocol += ':';

    // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
    // unless they had them to begin with.
    if (self.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
      host = '//' + (host || '');
      if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
    } else if (!host) {
      host = '';
    }

    if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
    if (search && search.charAt(0) !== '?') search = '?' + search;

    pathname = pathname.replace(/[?#]/g, function(match) {
      return encodeURIComponent(match);
    });
    search = search.replace('#', '%23');

    return protocol + host + pathname + search + hash;
  }

  Url.prototype.format = function() {
    return format(this);
  };

  function urlResolve(source, relative) {
    return urlParse(source, false, true).resolve(relative);
  }

  Url.prototype.resolve = function(relative) {
    return this.resolveObject(urlParse(relative, false, true)).format();
  };

  function urlResolveObject(source, relative) {
    if (!source) return relative;
    return urlParse(source, false, true).resolveObject(relative);
  }

  Url.prototype.resolveObject = function(relative) {
    if (isString(relative)) {
      var rel = new Url();
      rel.parse(relative, false, true);
      relative = rel;
    }

    var result = new Url();
    var tkeys = Object.keys(this);
    for (var tk = 0; tk < tkeys.length; tk++) {
      var tkey = tkeys[tk];
      result[tkey] = this[tkey];
    }

    // hash is always overridden, no matter what.
    // even href="" will remove it.
    result.hash = relative.hash;

    // if the relative url is empty, then there's nothing left to do here.
    if (relative.href === '') {
      result.href = result.format();
      return result;
    }

    // hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative.protocol) {
      // take everything except the protocol from relative
      var rkeys = Object.keys(relative);
      for (var rk = 0; rk < rkeys.length; rk++) {
        var rkey = rkeys[rk];
        if (rkey !== 'protocol')
          result[rkey] = relative[rkey];
      }

      //urlParse appends trailing / to urls like http://www.example.com
      if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
        result.path = result.pathname = '/';
      }

      result.href = result.format();
      return result;
    }
    var relPath;
    if (relative.protocol && relative.protocol !== result.protocol) {
      // if it's a known url protocol, then changing
      // the protocol does weird things
      // first, if it's not file:, then we MUST have a host,
      // and if there was a path
      // to begin with, then we MUST have a path.
      // if it is file:, then the host is dropped,
      // because that's known to be hostless.
      // anything else is assumed to be absolute.
      if (!slashedProtocol[relative.protocol]) {
        var keys = Object.keys(relative);
        for (var v = 0; v < keys.length; v++) {
          var k = keys[v];
          result[k] = relative[k];
        }
        result.href = result.format();
        return result;
      }

      result.protocol = relative.protocol;
      if (!relative.host && !hostlessProtocol[relative.protocol]) {
        relPath = (relative.pathname || '').split('/');
        while (relPath.length && !(relative.host = relPath.shift()));
        if (!relative.host) relative.host = '';
        if (!relative.hostname) relative.hostname = '';
        if (relPath[0] !== '') relPath.unshift('');
        if (relPath.length < 2) relPath.unshift('');
        result.pathname = relPath.join('/');
      } else {
        result.pathname = relative.pathname;
      }
      result.search = relative.search;
      result.query = relative.query;
      result.host = relative.host || '';
      result.auth = relative.auth;
      result.hostname = relative.hostname || relative.host;
      result.port = relative.port;
      // to support http.request
      if (result.pathname || result.search) {
        var p = result.pathname || '';
        var s = result.search || '';
        result.path = p + s;
      }
      result.slashes = result.slashes || relative.slashes;
      result.href = result.format();
      return result;
    }

    var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
        relative.host ||
        relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
        (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];
    relPath = relative.pathname && relative.pathname.split('/') || [];
    // if the url is a non-slashed url, then relative
    // links like ../.. should be able
    // to crawl up to the hostname, as well.  This is strange.
    // result.protocol has already been set by now.
    // Later on, put the first path part into the host field.
    if (psychotic) {
      result.hostname = '';
      result.port = null;
      if (result.host) {
        if (srcPath[0] === '') srcPath[0] = result.host;
        else srcPath.unshift(result.host);
      }
      result.host = '';
      if (relative.protocol) {
        relative.hostname = null;
        relative.port = null;
        if (relative.host) {
          if (relPath[0] === '') relPath[0] = relative.host;
          else relPath.unshift(relative.host);
        }
        relative.host = null;
      }
      mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
    }
    var authInHost;
    if (isRelAbs) {
      // it's absolute.
      result.host = (relative.host || relative.host === '') ?
        relative.host : result.host;
      result.hostname = (relative.hostname || relative.hostname === '') ?
        relative.hostname : result.hostname;
      result.search = relative.search;
      result.query = relative.query;
      srcPath = relPath;
      // fall through to the dot-handling below.
    } else if (relPath.length) {
      // it's relative
      // throw away the existing file, and take the new path instead.
      if (!srcPath) srcPath = [];
      srcPath.pop();
      srcPath = srcPath.concat(relPath);
      result.search = relative.search;
      result.query = relative.query;
    } else if (!isNullOrUndefined(relative.search)) {
      // just pull out the search.
      // like href='?foo'.
      // Put this after the other two cases because it simplifies the booleans
      if (psychotic) {
        result.hostname = result.host = srcPath.shift();
        //occationaly the auth can get stuck only in host
        //this especially happens in cases like
        //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
        authInHost = result.host && result.host.indexOf('@') > 0 ?
          result.host.split('@') : false;
        if (authInHost) {
          result.auth = authInHost.shift();
          result.host = result.hostname = authInHost.shift();
        }
      }
      result.search = relative.search;
      result.query = relative.query;
      //to support http.request
      if (!isNull(result.pathname) || !isNull(result.search)) {
        result.path = (result.pathname ? result.pathname : '') +
          (result.search ? result.search : '');
      }
      result.href = result.format();
      return result;
    }

    if (!srcPath.length) {
      // no path at all.  easy.
      // we've already handled the other stuff above.
      result.pathname = null;
      //to support http.request
      if (result.search) {
        result.path = '/' + result.search;
      } else {
        result.path = null;
      }
      result.href = result.format();
      return result;
    }

    // if a url ENDs in . or .., then it must get a trailing slash.
    // however, if it ends in anything else non-slashy,
    // then it must NOT get a trailing slash.
    var last = srcPath.slice(-1)[0];
    var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

    // strip single dots, resolve double dots to parent dir
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = srcPath.length; i >= 0; i--) {
      last = srcPath[i];
      if (last === '.') {
        srcPath.splice(i, 1);
      } else if (last === '..') {
        srcPath.splice(i, 1);
        up++;
      } else if (up) {
        srcPath.splice(i, 1);
        up--;
      }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
      for (; up--; up) {
        srcPath.unshift('..');
      }
    }

    if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
      srcPath.unshift('');
    }

    if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
      srcPath.push('');
    }

    var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

    // put the host back
    if (psychotic) {
      result.hostname = result.host = isAbsolute ? '' :
        srcPath.length ? srcPath.shift() : '';
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      authInHost = result.host && result.host.indexOf('@') > 0 ?
        result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }

    mustEndAbs = mustEndAbs || (result.host && srcPath.length);

    if (mustEndAbs && !isAbsolute) {
      srcPath.unshift('');
    }

    if (!srcPath.length) {
      result.pathname = null;
      result.path = null;
    } else {
      result.pathname = srcPath.join('/');
    }

    //to support request.http
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
        (result.search ? result.search : '');
    }
    result.auth = relative.auth || result.auth;
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  };

  Url.prototype.parseHost = function() {
    return parseHost(this);
  };

  function parseHost(self) {
    var host = self.host;
    var port = portPattern.exec(host);
    if (port) {
      port = port[0];
      if (port !== ':') {
        self.port = port.substr(1);
      }
      host = host.substr(0, host.length - port.length);
    }
    if (host) self.hostname = host;
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
  			wire.url = require$$0.parse(wire.upgradeReq.url||'', true);
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

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function commonjsRequire () {
  	throw new Error('Dynamic requires are not currently supported by rollup-plugin-commonjs');
  }

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var gun$1 = createCommonjsModule(function (module) {
  (function(){

    /* UNBUILD */
    var root;
    if(typeof window !== "undefined"){ root = window; }
    if(typeof commonjsGlobal !== "undefined"){ root = commonjsGlobal; }
    root = root || {};
    var console = root.console || {log: function(){}};
    function USE(arg, req){
      return req? commonjsRequire() : arg.slice? USE[R(arg)] : function(mod, path){
        arg(mod = {exports: {}});
        USE[R(path)] = mod.exports;
      }
      function R(p){
        return p.split('/').slice(-1).toString().replace('.js','');
      }
    }
    { var common = module; }
  USE(function(module){
  		// Generic javascript utilities.
  		var Type = {};
  		//Type.fns = Type.fn = {is: function(fn){ return (!!fn && fn instanceof Function) }}
  		Type.fn = {is: function(fn){ return (!!fn && 'function' == typeof fn) }};
  		Type.bi = {is: function(b){ return (b instanceof Boolean || typeof b == 'boolean') }};
  		Type.num = {is: function(n){ return !list_is(n) && ((n - parseFloat(n) + 1) >= 0 || Infinity === n || -Infinity === n) }};
  		Type.text = {is: function(t){ return (typeof t == 'string') }};
  		Type.text.ify = function(t){
  			if(Type.text.is(t)){ return t }
  			if(typeof JSON !== "undefined"){ return JSON.stringify(t) }
  			return (t && t.toString)? t.toString() : t;
  		};
  		Type.text.random = function(l, c){
  			var s = '';
  			l = l || 24; // you are not going to make a 0 length random number, so no need to check type
  			c = c || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz';
  			while(l > 0){ s += c.charAt(Math.floor(Math.random() * c.length)); l--; }
  			return s;
  		};
  		Type.text.match = function(t, o){ var tmp, u;
  			if('string' !== typeof t){ return false }
  			if('string' == typeof o){ o = {'=': o}; }
  			o = o || {};
  			tmp = (o['='] || o['*'] || o['>'] || o['<']);
  			if(t === tmp){ return true }
  			if(u !== o['=']){ return false }
  			tmp = (o['*'] || o['>'] || o['<']);
  			if(t.slice(0, (tmp||'').length) === tmp){ return true }
  			if(u !== o['*']){ return false }
  			if(u !== o['>'] && u !== o['<']){
  				return (t >= o['>'] && t <= o['<'])? true : false;
  			}
  			if(u !== o['>'] && t >= o['>']){ return true }
  			if(u !== o['<'] && t <= o['<']){ return true }
  			return false;
  		};
  		Type.list = {is: function(l){ return (l instanceof Array) }};
  		Type.list.slit = Array.prototype.slice;
  		Type.list.sort = function(k){ // creates a new sort function based off some key
  			return function(A,B){
  				if(!A || !B){ return 0 } A = A[k]; B = B[k];
  				if(A < B){ return -1 }else if(A > B){ return 1 }
  				else { return 0 }
  			}
  		};
  		Type.list.map = function(l, c, _){ return obj_map(l, c, _) };
  		Type.list.index = 1; // change this to 0 if you want non-logical, non-mathematical, non-matrix, non-convenient array notation
  		Type.obj = {is: function(o){ return o? (o instanceof Object && o.constructor === Object) || Object.prototype.toString.call(o).match(/^\[object (\w+)\]$/)[1] === 'Object' : false }};
  		Type.obj.put = function(o, k, v){ return (o||{})[k] = v, o };
  		Type.obj.has = function(o, k){ return o && Object.prototype.hasOwnProperty.call(o, k) };
  		Type.obj.del = function(o, k){
  			if(!o){ return }
  			o[k] = null;
  			delete o[k];
  			return o;
  		};
  		Type.obj.as = function(o, k, v, u){ return o[k] = o[k] || (u === v? {} : v) };
  		Type.obj.ify = function(o){
  			if(obj_is(o)){ return o }
  			try{o = JSON.parse(o);
  			}catch(e){o={};}			return o;
  		}
  		;(function(){ var u;
  			function map(v,k){
  				if(obj_has(this,k) && u !== this[k]){ return }
  				this[k] = v;
  			}
  			Type.obj.to = function(from, to){
  				to = to || {};
  				obj_map(from, map, to);
  				return to;
  			};
  		}());
  		Type.obj.copy = function(o){ // because http://web.archive.org/web/20140328224025/http://jsperf.com/cloning-an-object/2
  			return !o? o : JSON.parse(JSON.stringify(o)); // is shockingly faster than anything else, and our data has to be a subset of JSON anyways!
  		}
  		;(function(){
  			function empty(v,i){ var n = this.n;
  				if(n && (i === n || (obj_is(n) && obj_has(n, i)))){ return }
  				if(i){ return true }
  			}
  			Type.obj.empty = function(o, n){
  				if(!o){ return true }
  				return obj_map(o,empty,{n:n})? false : true;
  			};
  		}());
  (function(){
  			function t(k,v){
  				if(2 === arguments.length){
  					t.r = t.r || {};
  					t.r[k] = v;
  					return;
  				} t.r = t.r || [];
  				t.r.push(k);
  			}			var keys = Object.keys;
  			Type.obj.map = function(l, c, _){
  				var u, i = 0, x, r, ll, lle, f = fn_is(c);
  				t.r = null;
  				if(keys && obj_is(l)){
  					ll = keys(l); lle = true;
  				}
  				if(list_is(l) || ll){
  					x = (ll || l).length;
  					for(;i < x; i++){
  						var ii = (i + Type.list.index);
  						if(f){
  							r = lle? c.call(_ || this, l[ll[i]], ll[i], t) : c.call(_ || this, l[i], ii, t);
  							if(r !== u){ return r }
  						} else {
  							//if(Type.test.is(c,l[i])){ return ii } // should implement deep equality testing!
  							if(c === l[lle? ll[i] : i]){ return ll? ll[i] : ii } // use this for now
  						}
  					}
  				} else {
  					for(i in l){
  						if(f){
  							if(obj_has(l,i)){
  								r = _? c.call(_, l[i], i, t) : c(l[i], i, t);
  								if(r !== u){ return r }
  							}
  						} else {
  							//if(a.test.is(c,l[i])){ return i } // should implement deep equality testing!
  							if(c === l[i]){ return i } // use this for now
  						}
  					}
  				}
  				return f? t.r : Type.list.index? 0 : -1;
  			};
  		}());
  		Type.time = {};
  		Type.time.is = function(t){ return t? t instanceof Date : (+new Date().getTime()) };

  		var fn_is = Type.fn.is;
  		var list_is = Type.list.is;
  		var obj = Type.obj, obj_is = obj.is, obj_has = obj.has, obj_map = obj.map;
  		module.exports = Type;
  	})(USE, './type');
  USE(function(module){
  		// On event emitter generic javascript utility.
  		module.exports = function onto(tag, arg, as){
  			if(!tag){ return {to: onto} }
  			var u, tag = (this.tag || (this.tag = {}))[tag] ||
  			(this.tag[tag] = {tag: tag, to: onto._ = {
  				next: function(arg){ var tmp;
  					if((tmp = this.to)){
  						tmp.next(arg);
  				}}
  			}});
  			if(arg instanceof Function){
  				var be = {
  					off: onto.off ||
  					(onto.off = function(){
  						if(this.next === onto._.next){ return !0 }
  						if(this === this.the.last){
  							this.the.last = this.back;
  						}
  						this.to.back = this.back;
  						this.next = onto._.next;
  						this.back.to = this.to;
  						if(this.the.last === this.the){
  							delete this.on.tag[this.the.tag];
  						}
  					}),
  					to: onto._,
  					next: arg,
  					the: tag,
  					on: this,
  					as: as,
  				};
  				(be.back = tag.last || tag).to = be;
  				return tag.last = be;
  			}
  			if((tag = tag.to) && u !== arg){ tag.next(arg); }
  			return tag;
  		};
  	})(USE, './onto');
  USE(function(module){
  		/* Based on the Hypothetical Amnesia Machine thought experiment */
  		function HAM(machineState, incomingState, currentState, incomingValue, currentValue){
  			if(machineState < incomingState){
  				return {defer: true}; // the incoming value is outside the boundary of the machine's state, it must be reprocessed in another state.
  			}
  			if(incomingState < currentState){
  				return {historical: true}; // the incoming value is within the boundary of the machine's state, but not within the range.

  			}
  			if(currentState < incomingState){
  				return {converge: true, incoming: true}; // the incoming value is within both the boundary and the range of the machine's state.

  			}
  			if(incomingState === currentState){
  				incomingValue = Lexical(incomingValue) || "";
  				currentValue = Lexical(currentValue) || "";
  				if(incomingValue === currentValue){ // Note: while these are practically the same, the deltas could be technically different
  					return {state: true};
  				}
  				/*
  					The following is a naive implementation, but will always work.
  					Never change it unless you have specific needs that absolutely require it.
  					If changed, your data will diverge unless you guarantee every peer's algorithm has also been changed to be the same.
  					As a result, it is highly discouraged to modify despite the fact that it is naive,
  					because convergence (data integrity) is generally more important.
  					Any difference in this algorithm must be given a new and different name.
  				*/
  				if(incomingValue < currentValue){ // Lexical only works on simple value types!
  					return {converge: true, current: true};
  				}
  				if(currentValue < incomingValue){ // Lexical only works on simple value types!
  					return {converge: true, incoming: true};
  				}
  			}
  			return {err: "Invalid CRDT Data: "+ incomingValue +" to "+ currentValue +" at "+ incomingState +" to "+ currentState +"!"};
  		}
  		if(typeof JSON === 'undefined'){
  			throw new Error(
  				'JSON is not included in this browser. Please load it first: ' +
  				'ajax.cdnjs.com/ajax/libs/json2/20110223/json2.js'
  			);
  		}
  		var Lexical = JSON.stringify;
  		module.exports = HAM;
  	})(USE, './HAM');
  USE(function(module){
  		var Type = USE('./type');
  		var Val = {};
  		Val.is = function(v){ // Valid values are a subset of JSON: null, binary, number (!Infinity), text, or a soul relation. Arrays need special algorithms to handle concurrency, so they are not supported directly. Use an extension that supports them if needed but research their problems first.
  			if(v === u){ return false }
  			if(v === null){ return true } // "deletes", nulling out keys.
  			if(v === Infinity){ return false } // we want this to be, but JSON does not support it, sad face.
  			if(text_is(v) // by "text" we mean strings.
  			|| bi_is(v) // by "binary" we mean boolean.
  			|| num_is(v)){ // by "number" we mean integers or decimals.
  				return true; // simple values are valid.
  			}
  			return Val.link.is(v) || false; // is the value a soul relation? Then it is valid and return it. If not, everything else remaining is an invalid data type. Custom extensions can be built on top of these primitives to support other types.
  		};
  		Val.link = Val.rel = {_: '#'};
  (function(){
  			Val.link.is = function(v){ // this defines whether an object is a soul relation or not, they look like this: {'#': 'UUID'}
  				if(v && v[rel_] && !v._ && obj_is(v)){ // must be an object.
  					var o = {};
  					obj_map(v, map, o);
  					if(o.id){ // a valid id was found.
  						return o.id; // yay! Return it.
  					}
  				}
  				return false; // the value was not a valid soul relation.
  			};
  			function map(s, k){ var o = this; // map over the object...
  				if(o.id){ return o.id = false } // if ID is already defined AND we're still looping through the object, it is considered invalid.
  				if(k == rel_ && text_is(s)){ // the key should be '#' and have a text value.
  					o.id = s; // we found the soul!
  				} else {
  					return o.id = false; // if there exists anything else on the object that isn't the soul, then it is considered invalid.
  				}
  			}
  		}());
  		Val.link.ify = function(t){ return obj_put({}, rel_, t) }; // convert a soul into a relation and return it.
  		Type.obj.has._ = '.';
  		var rel_ = Val.link._, u;
  		var bi_is = Type.bi.is;
  		var num_is = Type.num.is;
  		var text_is = Type.text.is;
  		var obj = Type.obj, obj_is = obj.is, obj_put = obj.put, obj_map = obj.map;
  		module.exports = Val;
  	})(USE, './val');
  USE(function(module){
  		var Type = USE('./type');
  		var Val = USE('./val');
  		var Node = {_: '_'};
  		Node.soul = function(n, o){ return (n && n._ && n._[o || soul_]) }; // convenience function to check to see if there is a soul on a node and return it.
  		Node.soul.ify = function(n, o){ // put a soul on an object.
  			o = (typeof o === 'string')? {soul: o} : o || {};
  			n = n || {}; // make sure it exists.
  			n._ = n._ || {}; // make sure meta exists.
  			n._[soul_] = o.soul || n._[soul_] || text_random(); // put the soul on it.
  			return n;
  		};
  		Node.soul._ = Val.link._;
  (function(){
  			Node.is = function(n, cb, as){ var s; // checks to see if an object is a valid node.
  				if(!obj_is(n)){ return false } // must be an object.
  				if(s = Node.soul(n)){ // must have a soul on it.
  					return !obj_map(n, map, {as:as,cb:cb,s:s,n:n});
  				}
  				return false; // nope! This was not a valid node.
  			};
  			function map(v, k){ // we invert this because the way we check for this is via a negation.
  				if(k === Node._){ return } // skip over the metadata.
  				if(!Val.is(v)){ return true } // it is true that this is an invalid node.
  				if(this.cb){ this.cb.call(this.as, v, k, this.n, this.s); } // optionally callback each key/value.
  			}
  		}());
  (function(){
  			Node.ify = function(obj, o, as){ // returns a node from a shallow object.
  				if(!o){ o = {}; }
  				else if(typeof o === 'string'){ o = {soul: o}; }
  				else if(o instanceof Function){ o = {map: o}; }
  				if(o.map){ o.node = o.map.call(as, obj, u, o.node || {}); }
  				if(o.node = Node.soul.ify(o.node || {}, o)){
  					obj_map(obj, map, {o:o,as:as});
  				}
  				return o.node; // This will only be a valid node if the object wasn't already deep!
  			};
  			function map(v, k){ var o = this.o, tmp, u; // iterate over each key/value.
  				if(o.map){
  					tmp = o.map.call(this.as, v, ''+k, o.node);
  					if(u === tmp){
  						obj_del(o.node, k);
  					} else
  					if(o.node){ o.node[k] = tmp; }
  					return;
  				}
  				if(Val.is(v)){
  					o.node[k] = v;
  				}
  			}
  		}());
  		var obj = Type.obj, obj_is = obj.is, obj_del = obj.del, obj_map = obj.map;
  		var text = Type.text, text_random = text.random;
  		var soul_ = Node.soul._;
  		var u;
  		module.exports = Node;
  	})(USE, './node');
  USE(function(module){
  		var Type = USE('./type');
  		var Node = USE('./node');
  		function State(){
  			var t;
  			/*if(perf){
  				t = start + perf.now(); // Danger: Accuracy decays significantly over time, even if precise.
  			} else {*/
  				t = time();
  			//}
  			if(last < t){
  				return N = 0, last = t + State.drift;
  			}
  			return last = t + ((N += 1) / D) + State.drift;
  		}
  		var time = Type.time.is, last = -Infinity, N = 0, D = 1000; // WARNING! In the future, on machines that are D times faster than 2016AD machines, you will want to increase D by another several orders of magnitude so the processing speed never out paces the decimal resolution (increasing an integer effects the state accuracy).
  		var perf = (typeof performance !== 'undefined')? (performance.timing && performance) : false, start = (perf && perf.timing && perf.timing.navigationStart) || (perf = false);
  		State._ = '>';
  		State.drift = 0;
  		State.is = function(n, k, o){ // convenience function to get the state on a key on a node and return it.
  			var tmp = (k && n && n[N_] && n[N_][State._]) || o;
  			if(!tmp){ return }
  			return num_is(tmp = tmp[k])? tmp : -Infinity;
  		};
  		State.lex = function(){ return State().toString(36).replace('.','') };
  		State.ify = function(n, k, s, v, soul){ // put a key's state on a node.
  			if(!n || !n[N_]){ // reject if it is not node-like.
  				if(!soul){ // unless they passed a soul
  					return;
  				}
  				n = Node.soul.ify(n, soul); // then make it so!
  			}
  			var tmp = obj_as(n[N_], State._); // grab the states data.
  			if(u !== k && k !== N_){
  				if(num_is(s)){
  					tmp[k] = s; // add the valid state.
  				}
  				if(u !== v){ // Note: Not its job to check for valid values!
  					n[k] = v;
  				}
  			}
  			return n;
  		};
  		State.to = function(from, k, to){
  			var val = (from||{})[k];
  			if(obj_is(val)){
  				val = obj_copy(val);
  			}
  			return State.ify(to, k, State.is(from, k), val, Node.soul(from));
  		}
  		;(function(){
  			State.map = function(cb, s, as){ var u; // for use with Node.ify
  				var o = obj_is(o = cb || s)? o : null;
  				cb = fn_is(cb = cb || s)? cb : null;
  				if(o && !cb){
  					s = num_is(s)? s : State();
  					o[N_] = o[N_] || {};
  					obj_map(o, map, {o:o,s:s});
  					return o;
  				}
  				as = as || obj_is(s)? s : u;
  				s = num_is(s)? s : State();
  				return function(v, k, o, opt){
  					if(!cb){
  						map.call({o: o, s: s}, v,k);
  						return v;
  					}
  					cb.call(as || this || {}, v, k, o, opt);
  					if(obj_has(o,k) && u === o[k]){ return }
  					map.call({o: o, s: s}, v,k);
  				}
  			};
  			function map(v,k){
  				if(N_ === k){ return }
  				State.ify(this.o, k, this.s) ;
  			}
  		}());
  		var obj = Type.obj, obj_as = obj.as, obj_has = obj.has, obj_is = obj.is, obj_map = obj.map, obj_copy = obj.copy;
  		var num = Type.num, num_is = num.is;
  		var fn = Type.fn, fn_is = fn.is;
  		var N_ = Node._, u;
  		module.exports = State;
  	})(USE, './state');
  USE(function(module){
  		var Type = USE('./type');
  		var Val = USE('./val');
  		var Node = USE('./node');
  		var Graph = {};
  (function(){
  			Graph.is = function(g, cb, fn, as){ // checks to see if an object is a valid graph.
  				if(!g || !obj_is(g) || obj_empty(g)){ return false } // must be an object.
  				return !obj_map(g, map, {cb:cb,fn:fn,as:as}); // makes sure it wasn't an empty object.
  			};
  			function map(n, s){ // we invert this because the way'? we check for this is via a negation.
  				if(!n || s !== Node.soul(n) || !Node.is(n, this.fn, this.as)){ return true } // it is true that this is an invalid graph.
  				if(!this.cb){ return }
  				nf.n = n; nf.as = this.as; // sequential race conditions aren't races.
  				this.cb.call(nf.as, n, s, nf);
  			}
  			function nf(fn){ // optional callback for each node.
  				if(fn){ Node.is(nf.n, fn, nf.as); } // where we then have an optional callback for each key/value.
  			}
  		}());
  (function(){
  			Graph.ify = function(obj, env, as){
  				var at = {path: [], obj: obj};
  				if(!env){
  					env = {};
  				} else
  				if(typeof env === 'string'){
  					env = {soul: env};
  				} else
  				if(env instanceof Function){
  					env.map = env;
  				}
  				if(env.soul){
  					at.link = Val.link.ify(env.soul);
  				}
  				env.shell = (as||{}).shell;
  				env.graph = env.graph || {};
  				env.seen = env.seen || [];
  				env.as = env.as || as;
  				node(env, at);
  				env.root = at.node;
  				return env.graph;
  			};
  			function node(env, at){ var tmp;
  				if(tmp = seen(env, at)){ return tmp }
  				at.env = env;
  				at.soul = soul;
  				if(Node.ify(at.obj, map, at)){
  					at.link = at.link || Val.link.ify(Node.soul(at.node));
  					if(at.obj !== env.shell){
  						env.graph[Val.link.is(at.link)] = at.node;
  					}
  				}
  				return at;
  			}
  			function map(v,k,n){
  				var at = this, env = at.env, is, tmp;
  				if(Node._ === k && obj_has(v,Val.link._)){
  					return n._; // TODO: Bug?
  				}
  				if(!(is = valid(v,k,n, at,env))){ return }
  				if(!k){
  					at.node = at.node || n || {};
  					if(obj_has(v, Node._) && Node.soul(v)){ // ? for safety ?
  						at.node._ = obj_copy(v._);
  					}
  					at.node = Node.soul.ify(at.node, Val.link.is(at.link));
  					at.link = at.link || Val.link.ify(Node.soul(at.node));
  				}
  				if(tmp = env.map){
  					tmp.call(env.as || {}, v,k,n, at);
  					if(obj_has(n,k)){
  						v = n[k];
  						if(u === v){
  							obj_del(n, k);
  							return;
  						}
  						if(!(is = valid(v,k,n, at,env))){ return }
  					}
  				}
  				if(!k){ return at.node }
  				if(true === is){
  					return v;
  				}
  				tmp = node(env, {obj: v, path: at.path.concat(k)});
  				if(!tmp.node){ return }
  				return tmp.link; //{'#': Node.soul(tmp.node)};
  			}
  			function soul(id){ var at = this;
  				var prev = Val.link.is(at.link), graph = at.env.graph;
  				at.link = at.link || Val.link.ify(id);
  				at.link[Val.link._] = id;
  				if(at.node && at.node[Node._]){
  					at.node[Node._][Val.link._] = id;
  				}
  				if(obj_has(graph, prev)){
  					graph[id] = graph[prev];
  					obj_del(graph, prev);
  				}
  			}
  			function valid(v,k,n, at,env){ var tmp;
  				if(Val.is(v)){ return true }
  				if(obj_is(v)){ return 1 }
  				if(tmp = env.invalid){
  					v = tmp.call(env.as || {}, v,k,n);
  					return valid(v,k,n, at,env);
  				}
  				env.err = "Invalid value at '" + at.path.concat(k).join('.') + "'!";
  				if(Type.list.is(v)){ env.err += " Use `.set(item)` instead of an Array."; }
  			}
  			function seen(env, at){
  				var arr = env.seen, i = arr.length, has;
  				while(i--){ has = arr[i];
  					if(at.obj === has.obj){ return has }
  				}
  				arr.push(at);
  			}
  		}());
  		Graph.node = function(node){
  			var soul = Node.soul(node);
  			if(!soul){ return }
  			return obj_put({}, soul, node);
  		}
  		;(function(){
  			Graph.to = function(graph, root, opt){
  				if(!graph){ return }
  				var obj = {};
  				opt = opt || {seen: {}};
  				obj_map(graph[root], map, {obj:obj, graph: graph, opt: opt});
  				return obj;
  			};
  			function map(v,k){ var tmp, obj;
  				if(Node._ === k){
  					if(obj_empty(v, Val.link._)){
  						return;
  					}
  					this.obj[k] = obj_copy(v);
  					return;
  				}
  				if(!(tmp = Val.link.is(v))){
  					this.obj[k] = v;
  					return;
  				}
  				if(obj = this.opt.seen[tmp]){
  					this.obj[k] = obj;
  					return;
  				}
  				this.obj[k] = this.opt.seen[tmp] = Graph.to(this.graph, tmp, this.opt);
  			}
  		}());
  		var fn_is = Type.fn.is;
  		var obj = Type.obj, obj_is = obj.is, obj_del = obj.del, obj_has = obj.has, obj_empty = obj.empty, obj_put = obj.put, obj_map = obj.map, obj_copy = obj.copy;
  		var u;
  		module.exports = Graph;
  	})(USE, './graph');
  USE(function(module){
  		// request / response module, for asking and acking messages.
  		USE('./onto'); // depends upon onto!
  		module.exports = function ask(cb, as){
  			if(!this.on){ return }
  			if(!(cb instanceof Function)){
  				if(!cb || !as){ return }
  				var id = cb['#'] || cb, tmp = (this.tag||empty)[id];
  				if(!tmp){ return }
  				tmp = this.on(id, as);
  				clearTimeout(tmp.err);
  				return true;
  			}
  			var id = (as && as['#']) || Math.random().toString(36).slice(2);
  			if(!cb){ return id }
  			var to = this.on(id, cb, as);
  			to.err = to.err || setTimeout(function(){
  				to.next({err: "Error: No ACK received yet.", lack: true});
  				to.off();
  			}, (this.opt||{}).lack || 9000);
  			return id;
  		};
  	})(USE, './ask');
  USE(function(module){
  		var Type = USE('./type');
  		function Dup(opt){
  			var dup = {s:{}};
  			opt = opt || {max: 1000, age: 1000 * 9};//1000 * 60 * 2};
  			dup.check = function(id){ var tmp;
  				if(!(tmp = dup.s[id])){ return false }
  				if(tmp.pass){ return tmp.pass = false }
  				return dup.track(id);
  			};
  			dup.track = function(id, pass){
  				var it = dup.s[id] || (dup.s[id] = {});
  				it.was = time_is();
  				if(pass){ it.pass = true; }
  				if(!dup.to){
  					dup.to = setTimeout(function(){
  						var now = time_is();
  						Type.obj.map(dup.s, function(it, id){
  							if(it && opt.age > (now - it.was)){ return }
  							Type.obj.del(dup.s, id);
  						});
  						dup.to = null;
  					}, opt.age + 9);
  				}
  				return it;
  			};
  			return dup;
  		}
  		var time_is = Type.time.is;
  		module.exports = Dup;
  	})(USE, './dup');
  USE(function(module){

  		function Gun(o){
  			if(o instanceof Gun){ return (this._ = {gun: this, $: this}).$ }
  			if(!(this instanceof Gun)){ return new Gun(o) }
  			return Gun.create(this._ = {gun: this, $: this, opt: o});
  		}

  		Gun.is = function($){ return ($ instanceof Gun) || ($ && $._ && ($ === $._.$)) || false };

  		Gun.version = 0.9;

  		Gun.chain = Gun.prototype;
  		Gun.chain.toJSON = function(){};

  		var Type = USE('./type');
  		Type.obj.to(Type, Gun);
  		Gun.HAM = USE('./HAM');
  		Gun.val = USE('./val');
  		Gun.node = USE('./node');
  		Gun.state = USE('./state');
  		Gun.graph = USE('./graph');
  		Gun.on = USE('./onto');
  		Gun.ask = USE('./ask');
  		Gun.dup = USE('./dup');
  (function(){
  			Gun.create = function(at){
  				at.root = at.root || at;
  				at.graph = at.graph || {};
  				at.on = at.on || Gun.on;
  				at.ask = at.ask || Gun.ask;
  				at.dup = at.dup || Gun.dup();
  				var gun = at.$.opt(at.opt);
  				if(!at.once){
  					at.on('in', root, at);
  					at.on('out', root, {at: at, out: root});
  					Gun.on('create', at);
  					at.on('create', at);
  				}
  				at.once = 1;
  				return gun;
  			};
  			function root(msg){
  				//add to.next(at); // TODO: MISSING FEATURE!!!
  				var ev = this, as = ev.as, at = as.at || as, gun = at.$, dup, tmp;
  				if(!(tmp = msg['#'])){ tmp = msg['#'] = text_rand(9); }
  				if((dup = at.dup).check(tmp)){
  					if(as.out === msg.out){
  						msg.out = u;
  						ev.to.next(msg);
  					}
  					return;
  				}
  				dup.track(tmp);
  				if(!at.ask(msg['@'], msg)){
  					if(msg.get){
  						Gun.on.get(msg, gun); //at.on('get', get(msg));
  					}
  					if(msg.put){
  						Gun.on.put(msg, gun); //at.on('put', put(msg));
  					}
  				}
  				ev.to.next(msg);
  				if(!as.out){
  					msg.out = root;
  					at.on('out', msg);
  				}
  			}
  		}());
  (function(){
  			Gun.on.put = function(msg, gun){
  				var at = gun._, ctx = {$: gun, graph: at.graph, put: {}, map: {}, souls: {}, machine: Gun.state(), ack: msg['@'], cat: at, stop: {}};
  				if(!Gun.graph.is(msg.put, null, verify, ctx)){ ctx.err = "Error: Invalid graph!"; }
  				if(ctx.err){ return at.on('in', {'@': msg['#'], err: Gun.log(ctx.err) }) }
  				obj_map(ctx.put, merge, ctx);
  				if(!ctx.async){ obj_map(ctx.map, map, ctx); }
  				if(u !== ctx.defer){
  					setTimeout(function(){
  						Gun.on.put(msg, gun);
  					}, ctx.defer - ctx.machine);
  				}
  				if(!ctx.diff){ return }
  				at.on('put', obj_to(msg, {put: ctx.diff}));
  			};
  			function verify(val, key, node, soul){ var ctx = this;
  				var state = Gun.state.is(node, key);
  				if(!state){ return ctx.err = "Error: No state on '"+key+"' in node '"+soul+"'!" }
  				var vertex = ctx.graph[soul] || empty, was = Gun.state.is(vertex, key, true), known = vertex[key];
  				var HAM = Gun.HAM(ctx.machine, state, was, val, known);
  				if(!HAM.incoming){
  					if(HAM.defer){ // pick the lowest
  						ctx.defer = (state < (ctx.defer || Infinity))? state : ctx.defer;
  					}
  					return;
  				}
  				ctx.put[soul] = Gun.state.to(node, key, ctx.put[soul]);
  				(ctx.diff || (ctx.diff = {}))[soul] = Gun.state.to(node, key, ctx.diff[soul]);
  				ctx.souls[soul] = true;
  			}
  			function merge(node, soul){
  				var ctx = this, cat = ctx.$._, at = (cat.next || empty)[soul];
  				if(!at){
  					if(!(cat.opt||empty).super){
  						ctx.souls[soul] = false;
  						return;
  					}
  					at = (ctx.$.get(soul)._);
  				}
  				var msg = ctx.map[soul] = {
  					put: node,
  					get: soul,
  					$: at.$
  				}, as = {ctx: ctx, msg: msg};
  				ctx.async = !!cat.tag.node;
  				if(ctx.ack){ msg['@'] = ctx.ack; }
  				obj_map(node, each, as);
  				if(!ctx.async){ return }
  				if(!ctx.and){
  					// If it is async, we only need to setup one listener per context (ctx)
  					cat.on('node', function(m){
  						this.to.next(m); // make sure to call other context's listeners.
  						if(m !== ctx.map[m.get]){ return } // filter out events not from this context!
  						ctx.souls[m.get] = false; // set our many-async flag
  						obj_map(m.put, patch, m); // merge into view
  						if(obj_map(ctx.souls, function(v){ if(v){ return v } })){ return } // if flag still outstanding, keep waiting.
  						if(ctx.c){ return } ctx.c = 1; // failsafe for only being called once per context.
  						this.off();
  						obj_map(ctx.map, map, ctx); // all done, trigger chains.
  					});
  				}
  				ctx.and = true;
  				cat.on('node', msg); // each node on the current context's graph needs to be emitted though.
  			}
  			function each(val, key){
  				var ctx = this.ctx, graph = ctx.graph, msg = this.msg, soul = msg.get, node = msg.put, at = (msg.$._);
  				graph[soul] = Gun.state.to(node, key, graph[soul]);
  				if(ctx.async){ return }
  				at.put = Gun.state.to(node, key, at.put);
  			}
  			function patch(val, key){
  				var msg = this, node = msg.put, at = (msg.$._);
  				at.put = Gun.state.to(node, key, at.put);
  			}
  			function map(msg, soul){
  				if(!msg.$){ return }
  				this.cat.stop = this.stop; // temporary fix till a better solution?
  				(msg.$._).on('in', msg);
  				this.cat.stop = null; // temporary fix till a better solution?
  			}

  			Gun.on.get = function(msg, gun){
  				var root = gun._, get = msg.get, soul = get[_soul], node = root.graph[soul], has = get[_has], tmp;
  				var next = root.next || (root.next = {}), at = next[soul];
  				if(!node){ return root.on('get', msg) }
  				if(has){
  					if('string' != typeof has || !obj_has(node, has)){ return root.on('get', msg) }
  					node = Gun.state.to(node, has);
  					// If we have a key in-memory, do we really need to fetch?
  					// Maybe... in case the in-memory key we have is a local write
  					// we still need to trigger a pull/merge from peers.
  				} else {
  					node = Gun.obj.copy(node);
  				}
  				node = Gun.graph.node(node);
  				tmp = (at||empty).ack;
  				root.on('in', {
  					'@': msg['#'],
  					how: 'mem',
  					put: node,
  					$: gun
  				});
  				//if(0 < tmp){ return }
  				root.on('get', msg);
  			};
  		}());
  (function(){
  			Gun.chain.opt = function(opt){
  				opt = opt || {};
  				var gun = this, at = gun._, tmp = opt.peers || opt;
  				if(!obj_is(opt)){ opt = {}; }
  				if(!obj_is(at.opt)){ at.opt = opt; }
  				if(text_is(tmp)){ tmp = [tmp]; }
  				if(list_is(tmp)){
  					tmp = obj_map(tmp, function(url, i, map){
  						map(url, {url: url});
  					});
  					if(!obj_is(at.opt.peers)){ at.opt.peers = {};}
  					at.opt.peers = obj_to(tmp, at.opt.peers);
  				}
  				at.opt.peers = at.opt.peers || {};
  				obj_to(opt, at.opt); // copies options on to `at.opt` only if not already taken.
  				Gun.on('opt', at);
  				at.opt.uuid = at.opt.uuid || function(){ return state_lex() + text_rand(12) };
  				return gun;
  			};
  		}());

  		var list_is = Gun.list.is;
  		var text = Gun.text, text_is = text.is, text_rand = text.random;
  		var obj = Gun.obj, obj_is = obj.is, obj_has = obj.has, obj_to = obj.to, obj_map = obj.map, obj_copy = obj.copy;
  		var state_lex = Gun.state.lex, _soul = Gun.val.link._, _has = '.', node_ = Gun.node._, rel_is = Gun.val.link.is;
  		var empty = {}, u;

  		console.debug = function(i, s){ return (console.debug.i && i === console.debug.i && console.debug.i++) && (console.log.apply(console, arguments) || s) };

  		Gun.log = function(){ return (!Gun.log.off && console.log.apply(console, arguments)), [].slice.call(arguments).join(' ') };
  		Gun.log.once = function(w,s,o){ return (o = Gun.log.once)[w] = o[w] || 0, o[w]++ || Gun.log(s) }

  		;		Gun.log.once("welcome", "Hello wonderful person! :) Thanks for using GUN, feel free to ask for help on https://gitter.im/amark/gun and ask StackOverflow questions tagged with 'gun'!");

  		if(typeof window !== "undefined"){ (window.GUN = window.Gun = Gun).window = window; }
  		try{ if(typeof common !== "undefined"){ common.exports = Gun; } }catch(e){}
  		module.exports = Gun;

  		/*Gun.on('opt', function(ctx){ // FOR TESTING PURPOSES
  			this.to.next(ctx);
  			if(ctx.once){ return }
  			ctx.on('node', function(msg){
  				var to = this.to;
  				//Gun.node.is(msg.put, function(v,k){ msg.put[k] = v + v });
  				setTimeout(function(){
  					to.next(msg);
  				},1);
  			});
  		});*/
  	})(USE, './root');
  USE(function(module){
  		var Gun = USE('./root');
  		Gun.chain.back = function(n, opt){ var tmp;
  			n = n || 1;
  			if(-1 === n || Infinity === n){
  				return this._.root.$;
  			} else
  			if(1 === n){
  				return (this._.back || this._).$;
  			}
  			var gun = this, at = gun._;
  			if(typeof n === 'string'){
  				n = n.split('.');
  			}
  			if(n instanceof Array){
  				var i = 0, l = n.length, tmp = at;
  				for(i; i < l; i++){
  					tmp = (tmp||empty)[n[i]];
  				}
  				if(u !== tmp){
  					return opt? gun : tmp;
  				} else
  				if((tmp = at.back)){
  					return tmp.$.back(n, opt);
  				}
  				return;
  			}
  			if(n instanceof Function){
  				var yes, tmp = {back: at};
  				while((tmp = tmp.back)
  				&& u === (yes = n(tmp, opt))){}
  				return yes;
  			}
  			if(Gun.num.is(n)){
  				return (at.back || at).$.back(n - 1);
  			}
  			return this;
  		};
  		var empty = {}, u;
  	})(USE, './back');
  USE(function(module){
  		// WARNING: GUN is very simple, but the JavaScript chaining API around GUN
  		// is complicated and was extremely hard to build. If you port GUN to another
  		// language, consider implementing an easier API to build.
  		var Gun = USE('./root');
  		Gun.chain.chain = function(sub){
  			var gun = this, at = gun._, chain = new (sub || gun).constructor(gun), cat = chain._, root;
  			cat.root = root = at.root;
  			cat.id = ++root.once;
  			cat.back = gun._;
  			cat.on = Gun.on;
  			cat.on('in', input, cat); // For 'in' if I add my own listeners to each then I MUST do it before in gets called. If I listen globally for all incoming data instead though, regardless of individual listeners, I can transform the data there and then as well.
  			cat.on('out', output, cat); // However for output, there isn't really the global option. I must listen by adding my own listener individually BEFORE this one is ever called.
  			return chain;
  		};

  		function output(msg){
  			var put, get, at = this.as, back = at.back, root = at.root, tmp;
  			if(!msg.$){ msg.$ = at.$; }
  			this.to.next(msg);
  			if(get = msg.get){
  				/*if(u !== at.put){
  					at.on('in', at);
  					return;
  				}*/
  				if(at.lex){ msg.get = obj_to(at.lex, msg.get); }
  				if(get['#'] || at.soul){
  					get['#'] = get['#'] || at.soul;
  					msg['#'] || (msg['#'] = text_rand(9));
  					back = (root.$.get(get['#'])._);
  					if(!(get = get['.'])){
  						tmp = back.ack;
  						if(!tmp){ back.ack = -1; }
  						if(obj_has(back, 'put')){
  							back.on('in', back);
  						}
  						if(tmp){ return }
  						msg.$ = back.$;
  					} else
  					if(obj_has(back.put, get)){ // TODO: support #LEX !
  						put = (back.$.get(get)._);
  						if(!(tmp = put.ack)){ put.ack = -1; }
  						back.on('in', {
  							$: back.$,
  							put: Gun.state.to(back.put, get),
  							get: back.get
  						});
  						if(tmp){ return }
  					} else
  					if('string' != typeof get){
  						var put = {}, meta = (back.put||{})._;
  						Gun.obj.map(back.put, function(v,k){
  							if(!Gun.text.match(k, get)){ return }
  							put[k] = v;
  						});
  						if(!Gun.obj.empty(put)){
  							put._ = meta;
  							back.on('in', {$: back.$, put: put, get: back.get});
  						}
  					}
  					root.ask(ack, msg);
  					return root.on('in', msg);
  				}
  				if(root.now){ root.now[at.id] = root.now[at.id] || true; at.pass = {}; }
  				if(get['.']){
  					if(at.get){
  						msg = {get: {'.': at.get}, $: at.$};
  						//if(back.ask || (back.ask = {})[at.get]){ return }
  						(back.ask || (back.ask = {}));
  						back.ask[at.get] = msg.$._; // TODO: PERFORMANCE? More elegant way?
  						return back.on('out', msg);
  					}
  					msg = {get: {}, $: at.$};
  					return back.on('out', msg);
  				}
  				at.ack = at.ack || -1;
  				if(at.get){
  					msg.$ = at.$;
  					get['.'] = at.get;
  					(back.ask || (back.ask = {}))[at.get] = msg.$._; // TODO: PERFORMANCE? More elegant way?
  					return back.on('out', msg);
  				}
  			}
  			return back.on('out', msg);
  		}

  		function input(msg){
  			var eve = this, cat = eve.as, root = cat.root, gun = msg.$, at = (gun||empty)._ || empty, change = msg.put, rel, tmp;
  			if(cat.get && msg.get !== cat.get){
  				msg = obj_to(msg, {get: cat.get});
  			}
  			if(cat.has && at !== cat){
  				msg = obj_to(msg, {$: cat.$});
  				if(at.ack){
  					cat.ack = at.ack;
  					//cat.ack = cat.ack || at.ack;
  				}
  			}
  			if(u === change){
  				tmp = at.put;
  				eve.to.next(msg);
  				if(cat.soul){ return } // TODO: BUG, I believee the fresh input refactor caught an edge case that a `gun.get('soul').get('key')` that points to a soul that doesn't exist will not trigger val/get etc.
  				if(u === tmp && u !== at.put){ return }
  				echo(cat, msg);
  				if(cat.has){
  					not(cat, msg);
  				}
  				obj_del(at.echo, cat.id);
  				obj_del(cat.map, at.id);
  				return;
  			}
  			if(cat.soul){
  				eve.to.next(msg);
  				echo(cat, msg);
  				if(cat.next){ obj_map(change, map, {msg: msg, cat: cat}); }
  				return;
  			}
  			if(!(rel = Gun.val.link.is(change))){
  				if(Gun.val.is(change)){
  					if(cat.has || cat.soul){
  						not(cat, msg);
  					} else
  					if(at.has || at.soul){
  						(at.echo || (at.echo = {}))[cat.id] = at.echo[at.id] || cat;
  						(cat.map || (cat.map = {}))[at.id] = cat.map[at.id] || {at: at};
  						//if(u === at.put){ return } // Not necessary but improves performance. If we have it but at does not, that means we got things out of order and at will get it. Once at gets it, it will tell us again.
  					}
  					eve.to.next(msg);
  					echo(cat, msg);
  					return;
  				}
  				if(cat.has && at !== cat && obj_has(at, 'put')){
  					cat.put = at.put;
  				}				if((rel = Gun.node.soul(change)) && at.has){
  					at.put = (cat.root.$.get(rel)._).put;
  				}
  				tmp = (root.stop || {})[at.id];
  				//if(tmp && tmp[cat.id]){ } else {
  					eve.to.next(msg);
  				//}
  				relate(cat, msg, at, rel);
  				echo(cat, msg);
  				if(cat.next){ obj_map(change, map, {msg: msg, cat: cat}); }
  				return;
  			}
  			var was = root.stop;
  			tmp = root.stop || {};
  			tmp = tmp[at.id] || (tmp[at.id] = {});
  			//if(tmp[cat.id]){ return }
  			tmp.is = tmp.is || at.put;
  			tmp[cat.id] = at.put || true;
  			//if(root.stop){
  				eve.to.next(msg);
  			//}
  			relate(cat, msg, at, rel);
  			echo(cat, msg);
  		}

  		function relate(at, msg, from, rel){
  			if(!rel || node_ === at.get){ return }
  			var tmp = (at.root.$.get(rel)._);
  			if(at.has){
  				from = tmp;
  			} else
  			if(from.has){
  				relate(from, msg, from, rel);
  			}
  			if(from === at){ return }
  			if(!from.$){ from = {}; }
  			(from.echo || (from.echo = {}))[at.id] = from.echo[at.id] || at;
  			if(at.has && !(at.map||empty)[from.id]){ // if we haven't seen this before.
  				not(at, msg);
  			}
  			tmp = from.id? ((at.map || (at.map = {}))[from.id] = at.map[from.id] || {at: from}) : {};
  			if(rel === tmp.link){
  				if(!(tmp.pass || at.pass)){
  					return;
  				}
  			}
  			if(at.pass){
  				Gun.obj.map(at.map, function(tmp){ tmp.pass = true; });
  				obj_del(at, 'pass');
  			}
  			if(tmp.pass){ obj_del(tmp, 'pass'); }
  			if(at.has){ at.link = rel; }
  			ask(at, tmp.link = rel);
  		}
  		function echo(at, msg, ev){
  			if(!at.echo){ return } // || node_ === at.get ?
  			//if(at.has){ msg = obj_to(msg, {event: ev}) }
  			obj_map(at.echo, reverb, msg);
  		}
  		function reverb(to){
  			if(!to || !to.on){ return }
  			to.on('in', this);
  		}
  		function map(data, key){ // Map over only the changes on every update.
  			var cat = this.cat, next = cat.next || empty, via = this.msg, chain, at, tmp;
  			if(node_ === key && !next[key]){ return }
  			if(!(at = next[key])){
  				return;
  			}
  			//if(data && data[_soul] && (tmp = Gun.val.link.is(data)) && (tmp = (cat.root.$.get(tmp)._)) && obj_has(tmp, 'put')){
  			//	data = tmp.put;
  			//}
  			if(at.has){
  				//if(!(data && data[_soul] && Gun.val.link.is(data) === Gun.node.soul(at.put))){
  				if(u === at.put || !Gun.val.link.is(data)){
  					at.put = data;
  				}
  				chain = at.$;
  			} else
  			if(tmp = via.$){
  				tmp = (chain = via.$.get(key))._;
  				if(u === tmp.put || !Gun.val.link.is(data)){
  					tmp.put = data;
  				}
  			}
  			at.on('in', {
  				put: data,
  				get: key,
  				$: chain,
  				via: via
  			});
  		}
  		function not(at, msg){
  			if(!(at.has || at.soul)){ return }
  			var tmp = at.map, root = at.root;
  			at.map = null;
  			if(at.has){
  				if(at.dub && at.root.stop){ at.dub = null; }
  				at.link = null;
  			}
  			//if(!root.now || !root.now[at.id]){
  			if(!at.pass){
  				if((!msg['@']) && null === tmp){ return }
  				//obj_del(at, 'pass');
  			}
  			if(u === tmp && Gun.val.link.is(at.put)){ return } // This prevents the very first call of a thing from triggering a "clean up" call. // TODO: link.is(at.put) || !val.is(at.put) ?
  			obj_map(tmp, function(proxy){
  				if(!(proxy = proxy.at)){ return }
  				obj_del(proxy.echo, at.id);
  			});
  			tmp = at.put;
  			obj_map(at.next, function(neat, key){
  				if(u === tmp && u !== at.put){ return true }
  				neat.put = u;
  				if(neat.ack){
  					neat.ack = -1;
  				}
  				neat.on('in', {
  					get: key,
  					$: neat.$,
  					put: u
  				});
  			});
  		}
  		function ask(at, soul){
  			var tmp = (at.root.$.get(soul)._), lex = at.lex;
  			if(at.ack || lex){
  				(lex = lex||{})['#'] = soul;
  				tmp.on('out', {get: lex});
  				if(!at.ask){ return } // TODO: PERFORMANCE? More elegant way?
  			}
  			tmp = at.ask; Gun.obj.del(at, 'ask');
  			obj_map(tmp || at.next, function(neat, key){
  				var lex = neat.lex || {}; lex['#'] = soul; lex['.'] = lex['.'] || key;
  				neat.on('out', {get: lex});
  			});
  			Gun.obj.del(at, 'ask'); // TODO: PERFORMANCE? More elegant way?
  		}
  		function ack(msg, ev){
  			var as = this.as, get = as.get || empty, at = as.$._, tmp = (msg.put||empty)[get['#']];
  			if(at.ack){ at.ack = (at.ack + 1) || 1; }
  			if(!msg.put || ('string' == typeof get['.'] && !obj_has(tmp, at.get))){
  				if(at.put !== u){ return }
  				at.on('in', {
  					get: at.get,
  					put: at.put = u,
  					$: at.$,
  					'@': msg['@']
  				});
  				return;
  			}
  			if(node_ == get['.']){ // is this a security concern?
  				at.on('in', {get: at.get, put: Gun.val.link.ify(get['#']), $: at.$, '@': msg['@']});
  				return;
  			}
  			Gun.on.put(msg, at.root.$);
  		}
  		var empty = {}, u;
  		var obj = Gun.obj, obj_has = obj.has, obj_put = obj.put, obj_del = obj.del, obj_to = obj.to, obj_map = obj.map;
  		var text_rand = Gun.text.random;
  		var _soul = Gun.val.link._, node_ = Gun.node._;
  	})(USE, './chain');
  USE(function(module){
  		var Gun = USE('./root');
  		Gun.chain.get = function(key, cb, as){
  			var gun, tmp;
  			if(typeof key === 'string'){
  				var back = this, cat = back._;
  				var next = cat.next || empty;
  				if(!(gun = next[key])){
  					gun = cache(key, back);
  				}
  				gun = gun.$;
  			} else
  			if(key instanceof Function){
  				if(true === cb){ return soul(this, key, cb, as) }
  				gun = this;
  				var at = gun._, root = at.root, tmp = root.now, ev;
  				as = cb || {};
  				as.at = at;
  				as.use = key;
  				as.out = as.out || {};
  				as.out.get = as.out.get || {};
  				(ev = at.on('in', use, as)).rid = rid;
  				(root.now = {$:1})[as.now = at.id] = ev;
  				var mum = root.mum; root.mum = {};
  				at.on('out', as.out);
  				root.mum = mum;
  				root.now = tmp;
  				return gun;
  			} else
  			if(num_is(key)){
  				return this.get(''+key, cb, as);
  			} else
  			if(tmp = rel.is(key)){
  				return this.get(tmp, cb, as);
  			} else
  			if(obj.is(key)){
  				gun = this;
  				if(tmp = ((tmp = key['#'])||empty)['='] || tmp){ gun = gun.get(tmp); }
  				gun._.lex = key;
  				return gun;
  			} else {
  				(as = this.chain())._.err = {err: Gun.log('Invalid get request!', key)}; // CLEAN UP
  				if(cb){ cb.call(as, as._.err); }
  				return as;
  			}
  			if(tmp = this._.stun){ // TODO: Refactor?
  				gun._.stun = gun._.stun || tmp;
  			}
  			if(cb && cb instanceof Function){
  				gun.get(cb, as);
  			}
  			return gun;
  		};
  		function cache(key, back){
  			var cat = back._, next = cat.next, gun = back.chain(), at = gun._;
  			if(!next){ next = cat.next = {}; }
  			next[at.get = key] = at;
  			if(back === cat.root.$){
  				at.soul = key;
  			} else
  			if(cat.soul || cat.has){
  				at.has = key;
  				//if(obj_has(cat.put, key)){
  					//at.put = cat.put[key];
  				//}
  			}
  			return at;
  		}
  		function soul(gun, cb, opt, as){
  			var cat = gun._, acks = 0, tmp;
  			if(tmp = cat.soul || cat.link || cat.dub){ return cb(tmp, as, cat), gun }
  			gun.get(function(msg, ev){
  				if(u === msg.put && (tmp = (obj_map(cat.root.opt.peers, function(v,k,t){t(k);})||[]).length) && ++acks < tmp){
  					return;
  				}
  				ev.rid(msg);
  				var at = ((at = msg.$) && at._) || {};
  				tmp = at.link || at.soul || rel.is(msg.put) || node_soul(msg.put) || at.dub;
  				cb(tmp, as, msg, ev);
  			}, {out: {get: {'.':true}}});
  			return gun;
  		}
  		function use(msg){
  			var eve = this, as = eve.as, cat = as.at, root = cat.root, gun = msg.$, at = (gun||{})._ || {}, data = msg.put || at.put, tmp;
  			if((tmp = root.now) && eve !== tmp[as.now]){ return eve.to.next(msg) }
  			//console.log("USE:", cat.id, cat.soul, cat.has, cat.get, msg, root.mum);
  			//if(at.async && msg.root){ return }
  			//if(at.async === 1 && cat.async !== true){ return }
  			//if(root.stop && root.stop[at.id]){ return } root.stop && (root.stop[at.id] = true);
  			//if(!at.async && !cat.async && at.put && msg.put === at.put){ return }
  			//else if(!cat.async && msg.put !== at.put && root.stop && root.stop[at.id]){ return } root.stop && (root.stop[at.id] = true);


  			//root.stop && (root.stop.id = root.stop.id || Gun.text.random(2));
  			//if((tmp = root.stop) && (tmp = tmp[at.id] || (tmp[at.id] = {})) && tmp[cat.id]){ return } tmp && (tmp[cat.id] = true);
  			if(eve.seen && at.id && eve.seen[at.id]){ return eve.to.next(msg) }
  			//if((tmp = root.stop)){ if(tmp[at.id]){ return } tmp[at.id] = msg.root; } // temporary fix till a better solution?
  			if((tmp = data) && tmp[rel._] && (tmp = rel.is(tmp))){
  				tmp = ((msg.$$ = at.root.gun.get(tmp))._);
  				if(u !== tmp.put){
  					msg = obj_to(msg, {put: data = tmp.put});
  				}
  			}
  			if((tmp = root.mum) && at.id){ // TODO: can we delete mum entirely now?
  				var id = at.id + (eve.id || (eve.id = Gun.text.random(9)));
  				if(tmp[id]){ return }
  				if(u !== data && !rel.is(data)){ tmp[id] = true; }
  			}
  			as.use(msg, eve);
  			if(eve.stun){
  				eve.stun = null;
  				return;
  			}
  			eve.to.next(msg);
  		}
  		function rid(at){
  			var cat = this.on;
  			if(!at || cat.soul || cat.has){ return this.off() }
  			if(!(at = (at = (at = at.$ || at)._ || at).id)){ return }
  			var map = cat.map, tmp, seen;
  			//if(!map || !(tmp = map[at]) || !(tmp = tmp.at)){ return }
  			if(tmp = (seen = this.seen || (this.seen = {}))[at]){ return true }
  			seen[at] = true;
  			return;
  			//tmp.echo[cat.id] = {}; // TODO: Warning: This unsubscribes ALL of this chain's listeners from this link, not just the one callback event.
  			//obj.del(map, at); // TODO: Warning: This unsubscribes ALL of this chain's listeners from this link, not just the one callback event.
  			return;
  		}
  		var obj = Gun.obj, obj_map = obj.map, obj_has = obj.has, obj_to = Gun.obj.to;
  		var num_is = Gun.num.is;
  		var rel = Gun.val.link, node_soul = Gun.node.soul, node_ = Gun.node._;
  		var empty = {}, u;
  	})(USE, './get');
  USE(function(module){
  		var Gun = USE('./root');
  		Gun.chain.put = function(data, cb, as){
  			// #soul.has=value>state
  			// ~who#where.where=what>when@was
  			// TODO: BUG! Put probably cannot handle plural chains!
  			var gun = this, at = (gun._), root = at.root.$, ctx = root._, M = 100, tmp;
  			if(!ctx.puta){ if(tmp = ctx.puts){ if(tmp > M){ // without this, when synchronous, writes to a 'not found' pile up, when 'not found' resolves it recursively calls `put` which incrementally resolves each write. Stack overflow limits can be as low as 10K, so this limit is hardcoded to 1% of 10K.
  				(ctx.stack || (ctx.stack = [])).push([gun, data, cb, as]);
  				if(ctx.puto){ return }
  				ctx.puto = setTimeout(function drain(){
  					var d = ctx.stack.splice(0,M), i = 0, at; ctx.puta = true;
  					while(at = d[i++]){ at[0].put(at[1], at[2], at[3]); } delete ctx.puta;
  					if(ctx.stack.length){ return ctx.puto = setTimeout(drain, 0) }
  					ctx.stack = ctx.puts = ctx.puto = null;
  				}, 0);
  				return gun;
  			} ++ctx.puts; } else { ctx.puts = 1; } }
  			as = as || {};
  			as.data = data;
  			as.via = as.$ = as.via || as.$ || gun;
  			if(typeof cb === 'string'){
  				as.soul = cb;
  			} else {
  				as.ack = as.ack || cb;
  			}
  			if(at.soul){
  				as.soul = at.soul;
  			}
  			if(as.soul || root === gun){
  				if(!obj_is(as.data)){
  					(as.ack||noop).call(as, as.out = {err: Gun.log("Data saved to the root level of the graph must be a node (an object), not a", (typeof as.data), 'of "' + as.data + '"!')});
  					if(as.res){ as.res(); }
  					return gun;
  				}
  				as.soul = as.soul || (as.not = Gun.node.soul(as.data) || (as.via.back('opt.uuid') || Gun.text.random)());
  				if(!as.soul){ // polyfill async uuid for SEA
  					as.via.back('opt.uuid')(function(err, soul){ // TODO: improve perf without anonymous callback
  						if(err){ return Gun.log(err) } // TODO: Handle error!
  						(as.ref||as.$).put(as.data, as.soul = soul, as);
  					});
  					return gun;
  				}
  				as.$ = root.get(as.soul);
  				as.ref = as.$;
  				ify(as);
  				return gun;
  			}
  			if(Gun.is(data)){
  				data.get(function(soul, o, msg){
  					if(!soul){
  						return Gun.log("The reference you are saving is a", typeof msg.put, '"'+ msg.put +'", not a node (object)!');
  					}
  					gun.put(Gun.val.link.ify(soul), cb, as);
  				}, true);
  				return gun;
  			}
  			if(at.has && (tmp = Gun.val.link.is(data))){ at.dub = tmp; }
  			as.ref = as.ref || (root._ === (tmp = at.back))? gun : tmp.$;
  			if(as.ref._.soul && Gun.val.is(as.data) && at.get){
  				as.data = obj_put({}, at.get, as.data);
  				as.ref.put(as.data, as.soul, as);
  				return gun;
  			}
  			as.ref.get(any, true, {as: as});
  			if(!as.out){
  				// TODO: Perf idea! Make a global lock, that blocks everything while it is on, but if it is on the lock it does the expensive lookup to see if it is a dependent write or not and if not then it proceeds full speed. Meh? For write heavy async apps that would be terrible.
  				as.res = as.res || stun; // Gun.on.stun(as.ref); // TODO: BUG! Deal with locking?
  				as.$._.stun = as.ref._.stun;
  			}
  			return gun;
  		};

  		function ify(as){
  			as.batch = batch;
  			var opt = as.opt||{}, env = as.env = Gun.state.map(map, opt.state);
  			env.soul = as.soul;
  			as.graph = Gun.graph.ify(as.data, env, as);
  			if(env.err){
  				(as.ack||noop).call(as, as.out = {err: Gun.log(env.err)});
  				if(as.res){ as.res(); }
  				return;
  			}
  			as.batch();
  		}

  		function stun(cb){
  			if(cb){ cb(); }
  			return;
  			var as = this;
  			if(!as.ref){ return }
  			if(cb){
  				as.after = as.ref._.tag;
  				as.now = as.ref._.tag = {};
  				cb();
  				return;
  			}
  			if(as.after){
  				as.ref._.tag = as.after;
  			}
  		}

  		function batch(){ var as = this;
  			if(!as.graph || obj_map(as.stun, no)){ return }
  			as.res = as.res || function(cb){ if(cb){ cb(); } };
  			as.res(function(){
  				var cat = (as.$.back(-1)._), ask = cat.ask(function(ack){
  					cat.root.on('ack', ack);
  					if(ack.err){ Gun.log(ack); }
  					if(!ack.lack){ this.off(); } // One response is good enough for us currently. Later we may want to adjust this.
  					if(!as.ack){ return }
  					as.ack(ack, this);
  					//--C;
  				}, as.opt);
  				//C++;
  				// NOW is a hack to get synchronous replies to correctly call.
  				// and STOP is a hack to get async behavior to correctly call.
  				// neither of these are ideal, need to be fixed without hacks,
  				// but for now, this works for current tests. :/
  				var tmp = cat.root.now; obj.del(cat.root, 'now');
  				var mum = cat.root.mum; cat.root.mum = {};
  				(as.ref._).on('out', {
  					$: as.ref, put: as.out = as.env.graph, opt: as.opt, '#': ask
  				});
  				cat.root.mum = mum? obj.to(mum, cat.root.mum) : mum;
  				cat.root.now = tmp;
  			}, as);
  			if(as.res){ as.res(); }
  		} function no(v,k){ if(v){ return true } }
  		//console.debug(999,1); var C = 0; setInterval(function(){ try{ debug.innerHTML = C }catch(e){console.log(e)} }, 500);

  		function map(v,k,n, at){ var as = this;
  			var is = Gun.is(v);
  			if(k || !at.path.length){ return }
  			(as.res||iife)(function(){
  				var path = at.path, ref = as.ref, opt = as.opt;
  				var i = 0, l = path.length;
  				for(i; i < l; i++){
  					ref = ref.get(path[i]);
  				}
  				if(is){ ref = v; }
  				var id = (ref._).dub;
  				if(id || (id = Gun.node.soul(at.obj))){
  					ref.back(-1).get(id);
  					at.soul(id);
  					return;
  				}
  				(as.stun = as.stun || {})[path] = true;
  				ref.get(soul, true, {as: {at: at, as: as, p:path}});
  			}, {as: as, at: at});
  			//if(is){ return {} }
  		}

  		function soul(id, as, msg, eve){
  			var as = as.as, cat = as.at; as = as.as;
  			var at = ((msg || {}).$ || {})._ || {};
  			id = at.dub = at.dub || id || Gun.node.soul(cat.obj) || Gun.node.soul(msg.put || at.put) || Gun.val.link.is(msg.put || at.put) || (as.via.back('opt.uuid') || Gun.text.random)(); // TODO: BUG!? Do we really want the soul of the object given to us? Could that be dangerous?
  			if(eve){ eve.stun = true; }
  			if(!id){ // polyfill async uuid for SEA
  				at.via.back('opt.uuid')(function(err, id){ // TODO: improve perf without anonymous callback
  					if(err){ return Gun.log(err) } // TODO: Handle error.
  					solve(at, at.dub = at.dub || id, cat, as);
  				});
  				return;
  			}
  			solve(at, at.dub = id, cat, as);
  		}

  		function solve(at, id, cat, as){
  			at.$.back(-1).get(id);
  			cat.soul(id);
  			as.stun[cat.path] = false;
  			as.batch();
  		}

  		function any(soul, as, msg, eve){
  			as = as.as;
  			if(!msg.$ || !msg.$._){ return } // TODO: Handle
  			if(msg.err){ // TODO: Handle
  				console.log("Please report this as an issue! Put.any.err");
  				return;
  			}
  			var at = (msg.$._), data = at.put, opt = as.opt||{}, tmp;
  			if((tmp = as.ref) && tmp._.now){ return }
  			if(eve){ eve.stun = true; }
  			if(as.ref !== as.$){
  				tmp = (as.$._).get || at.get;
  				if(!tmp){ // TODO: Handle
  					console.log("Please report this as an issue! Put.no.get"); // TODO: BUG!??
  					return;
  				}
  				as.data = obj_put({}, tmp, as.data);
  				tmp = null;
  			}
  			if(u === data){
  				if(!at.get){ return } // TODO: Handle
  				if(!soul){
  					tmp = at.$.back(function(at){
  						if(at.link || at.soul){ return at.link || at.soul }
  						as.data = obj_put({}, at.get, as.data);
  					});
  				}
  				tmp = tmp || at.soul || at.link || at.dub;// || at.get;
  				at = tmp? (at.root.$.get(tmp)._) : at;
  				as.soul = tmp;
  				data = as.data;
  			}
  			if(!as.not && !(as.soul = as.soul || soul)){
  				if(as.path && obj_is(as.data)){
  					as.soul = (opt.uuid || as.via.back('opt.uuid') || Gun.text.random)();
  				} else {
  					//as.data = obj_put({}, as.$._.get, as.data);
  					if(node_ == at.get){
  						as.soul = (at.put||empty)['#'] || at.dub;
  					}
  					as.soul = as.soul || at.soul || at.link || (opt.uuid || as.via.back('opt.uuid') || Gun.text.random)();
  				}
  				if(!as.soul){ // polyfill async uuid for SEA
  					as.via.back('opt.uuid')(function(err, soul){ // TODO: improve perf without anonymous callback
  						if(err){ return Gun.log(err) } // Handle error.
  						as.ref.put(as.data, as.soul = soul, as);
  					});
  					return;
  				}
  			}
  			as.ref.put(as.data, as.soul, as);
  		}
  		var obj = Gun.obj, obj_is = obj.is, obj_put = obj.put, obj_map = obj.map;
  		var u, empty = {}, noop = function(){}, iife = function(fn,as){fn.call(as||empty);};
  		var node_ = Gun.node._;
  	})(USE, './put');
  USE(function(module){
  		var Gun = USE('./root');
  		USE('./chain');
  		USE('./back');
  		USE('./put');
  		USE('./get');
  		module.exports = Gun;
  	})(USE, './index');
  USE(function(module){
  		var Gun = USE('./index');
  		Gun.chain.on = function(tag, arg, eas, as){
  			var gun = this, at = gun._, act;
  			if(typeof tag === 'string'){
  				if(!arg){ return at.on(tag) }
  				act = at.on(tag, arg, eas || at, as);
  				if(eas && eas.$){
  					(eas.subs || (eas.subs = [])).push(act);
  				}
  				return gun;
  			}
  			var opt = arg;
  			opt = (true === opt)? {change: true} : opt || {};
  			opt.at = at;
  			opt.ok = tag;
  			//opt.last = {};
  			gun.get(ok, opt); // TODO: PERF! Event listener leak!!!?
  			return gun;
  		};

  		function ok(msg, ev){ var opt = this;
  			var gun = msg.$, at = (gun||{})._ || {}, data = at.put || msg.put, cat = opt.at, tmp;
  			if(u === data){
  				return;
  			}
  			if(tmp = msg.$$){
  				tmp = (msg.$$._);
  				if(u === tmp.put){
  					return;
  				}
  				data = tmp.put;
  			}
  			if(opt.change){ // TODO: BUG? Move above the undef checks?
  				data = msg.put;
  			}
  			// DEDUPLICATE // TODO: NEEDS WORK! BAD PROTOTYPE
  			//if(tmp.put === data && tmp.get === id && !Gun.node.soul(data)){ return }
  			//tmp.put = data;
  			//tmp.get = id;
  			// DEDUPLICATE // TODO: NEEDS WORK! BAD PROTOTYPE
  			//at.last = data;
  			if(opt.as){
  				opt.ok.call(opt.as, msg, ev);
  			} else {
  				opt.ok.call(gun, data, msg.get, msg, ev);
  			}
  		}

  		Gun.chain.val = function(cb, opt){
  			Gun.log.once("onceval", "Future Breaking API Change: .val -> .once, apologies unexpected.");
  			return this.once(cb, opt);
  		};
  		Gun.chain.once = function(cb, opt){
  			var gun = this, at = gun._, data = at.put;
  			if(0 < at.ack && u !== data){
  				(cb || noop).call(gun, data, at.get);
  				return gun;
  			}
  			if(cb){
  				(opt = opt || {}).ok = cb;
  				opt.at = at;
  				opt.out = {'#': Gun.text.random(9)};
  				gun.get(val, {as: opt});
  				opt.async = true; //opt.async = at.stun? 1 : true;
  			} else {
  				Gun.log.once("valonce", "Chainable val is experimental, its behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.");
  				var chain = gun.chain();
  				chain._.nix = gun.once(function(){
  					chain._.on('in', gun._);
  				});
  				return chain;
  			}
  			return gun;
  		};

  		function val(msg, eve, to){
  			if(!msg.$){ eve.off(); return }
  			var opt = this.as, cat = opt.at, gun = msg.$, at = gun._, data = at.put || msg.put, link, tmp;
  			if(tmp = msg.$$){
  				link = tmp = (msg.$$._);
  				if(u !== link.put){
  					data = link.put;
  				}
  			}
  			if((tmp = eve.wait) && (tmp = tmp[at.id])){ clearTimeout(tmp); }
  			if((!to && (u === data || at.soul || at.link || (link && !(0 < link.ack))))
  			|| (u === data && (tmp = (obj_map(at.root.opt.peers, function(v,k,t){t(k);})||[]).length) && (!to && (link||at).ack <= tmp))){
  				tmp = (eve.wait = {})[at.id] = setTimeout(function(){
  					val.call({as:opt}, msg, eve, tmp || 1);
  				}, opt.wait || 99);
  				return;
  			}
  			if(link && u === link.put && (tmp = rel.is(data))){ data = Gun.node.ify({}, tmp); }
  			eve.rid(msg);
  			opt.ok.call(gun || opt.$, data, msg.get);
  		}

  		Gun.chain.off = function(){
  			// make off more aggressive. Warning, it might backfire!
  			var gun = this, at = gun._, tmp;
  			var cat = at.back;
  			if(!cat){ return }
  			if(tmp = cat.next){
  				if(tmp[at.get]){
  					obj_del(tmp, at.get);
  				}
  			}
  			if(tmp = cat.ask){
  				obj_del(tmp, at.get);
  			}
  			if(tmp = cat.put){
  				obj_del(tmp, at.get);
  			}
  			if(tmp = at.soul){
  				obj_del(cat.root.graph, tmp);
  			}
  			if(tmp = at.map){
  				obj_map(tmp, function(at){
  					if(at.link){
  						cat.root.$.get(at.link).off();
  					}
  				});
  			}
  			if(tmp = at.next){
  				obj_map(tmp, function(neat){
  					neat.$.off();
  				});
  			}
  			at.on('off', {});
  			return gun;
  		};
  		var obj = Gun.obj, obj_map = obj.map, obj_has = obj.has, obj_del = obj.del, obj_to = obj.to;
  		var rel = Gun.val.link;
  		var noop = function(){}, u;
  	})(USE, './on');
  USE(function(module){
  		var Gun = USE('./index');
  		Gun.chain.map = function(cb, opt, t){
  			var gun = this, cat = gun._, chain;
  			if(!cb){
  				if(chain = cat.each){ return chain }
  				cat.each = chain = gun.chain();
  				chain._.nix = gun.back('nix');
  				gun.on('in', map, chain._);
  				return chain;
  			}
  			Gun.log.once("mapfn", "Map functions are experimental, their behavior and API may change moving forward. Please play with it and report bugs and ideas on how to improve it.");
  			chain = gun.chain();
  			gun.map().on(function(data, key, at, ev){
  				var next = (cb||noop).call(this, data, key, at, ev);
  				if(u === next){ return }
  				if(data === next){ return chain._.on('in', at) }
  				if(Gun.is(next)){ return chain._.on('in', next._) }
  				chain._.on('in', {get: key, put: next});
  			});
  			return chain;
  		};
  		function map(msg){
  			if(!msg.put || Gun.val.is(msg.put)){ return this.to.next(msg) }
  			if(this.as.nix){ this.off(); } // TODO: Ugly hack!
  			obj_map(msg.put, each, {at: this.as, msg: msg});
  			this.to.next(msg);
  		}
  		function each(v,k){
  			if(n_ === k){ return }
  			var msg = this.msg, gun = msg.$, at = gun._, cat = this.at, tmp = at.lex;
  			if(tmp && !Gun.text.match(k, tmp['.'] || tmp['#'] || tmp)){ return } // review?
  			((tmp = gun.get(k)._).echo || (tmp.echo = {}))[cat.id] = tmp.echo[cat.id] || cat;
  		}
  		var obj_map = Gun.obj.map, noop = function(){}, n_ = Gun.node._, u;
  	})(USE, './map');
  USE(function(module){
  		var Gun = USE('./index');
  		Gun.chain.set = function(item, cb, opt){
  			var gun = this, soul;
  			cb = cb || function(){};
  			opt = opt || {}; opt.item = opt.item || item;
  			if(soul = Gun.node.soul(item)){ item = Gun.obj.put({}, soul, Gun.val.link.ify(soul)); }
  			if(!Gun.is(item)){
  				if(Gun.obj.is(item)){					item = gun.back(-1).get(soul = soul || Gun.node.soul(item) || gun.back('opt.uuid')()).put(item);
  				}
  				return gun.get(soul || (Gun.state.lex() + Gun.text.random(7))).put(item, cb, opt);
  			}
  			item.get(function(soul, o, msg){
  				if(!soul){ return cb.call(gun, {err: Gun.log('Only a node can be linked! Not "' + msg.put + '"!')}) }
  				gun.put(Gun.obj.put({}, soul, Gun.val.link.ify(soul)), cb, opt);
  			},true);
  			return item;
  		};
  	})(USE, './set');
  USE(function(module){
  		if(typeof Gun === 'undefined'){ return } // TODO: localStorage is Browser only. But it would be nice if it could somehow plugin into NodeJS compatible localStorage APIs?

  		var noop = function(){}, store;
  		try{store = (Gun.window||noop).localStorage;}catch(e){}
  		if(!store){
  			console.log("Warning: No localStorage exists to persist data to!");
  			store = {setItem: function(k,v){this[k]=v;}, removeItem: function(k){delete this[k];}, getItem: function(k){return this[k]}};
  		}
  		/*
  			NOTE: Both `lib/file.js` and `lib/memdisk.js` are based on this design!
  			If you update anything here, consider updating the other adapters as well.
  		*/

  		Gun.on('create', function(root){
  			// This code is used to queue offline writes for resync.
  			// See the next 'opt' code below for actual saving of data.
  			var ev = this.to, opt = root.opt;
  			if(root.once){ return ev.next(root) }
  			//if(false === opt.localStorage){ return ev.next(root) } // we want offline resynce queue regardless!
  			opt.prefix = opt.file || 'gun/';
  			var gap = Gun.obj.ify(store.getItem('gap/'+opt.prefix)) || {};
  			var empty = Gun.obj.empty, id, to;
  			// add re-sync command.
  			if(!empty(gap)){
  				var disk = Gun.obj.ify(store.getItem(opt.prefix)) || {}, send = {};
  				Gun.obj.map(gap, function(node, soul){
  					Gun.obj.map(node, function(val, key){
  						send[soul] = Gun.state.to(disk[soul], key, send[soul]);
  					});
  				});
  				setTimeout(function(){
  					root.on('out', {put: send, '#': root.ask(ack)});
  				},1);
  			}

  			root.on('out', function(msg){
  				if(msg.lS){ return }
  				if(Gun.is(msg.$) && msg.put && !msg['@'] && !empty(opt.peers)){
  					id = msg['#'];
  					Gun.graph.is(msg.put, null, map);
  					if(!to){ to = setTimeout(flush, opt.wait || 1); }
  				}
  				this.to.next(msg);
  			});
  			root.on('ack', ack);

  			function ack(ack){ // TODO: This is experimental, not sure if we should keep this type of event hook.
  				if(ack.err || !ack.ok){ return }
  				var id = ack['@'];
  				setTimeout(function(){
  					Gun.obj.map(gap, function(node, soul){
  						Gun.obj.map(node, function(val, key){
  							if(id !== val){ return }
  							delete node[key];
  						});
  						if(empty(node)){
  							delete gap[soul];
  						}
  					});
  					flush();
  				}, opt.wait || 1);
  			}			ev.next(root);

  			var map = function(val, key, node, soul){
  				(gap[soul] || (gap[soul] = {}))[key] = id;
  			};
  			var flush = function(){
  				clearTimeout(to);
  				to = false;
  				try{store.setItem('gap/'+opt.prefix, JSON.stringify(gap));
  				}catch(e){ Gun.log(err = e || "localStorage failure"); }
  			};
  		});

  		Gun.on('create', function(root){
  			this.to.next(root);
  			var opt = root.opt;
  			if(root.once){ return }
  			if(false === opt.localStorage){ return }
  			opt.prefix = opt.file || 'gun/';
  			var graph = root.graph, acks = {}, count = 0, to;
  			var disk = Gun.obj.ify(store.getItem(opt.prefix)) || {};
  			root.on('localStorage', disk); // NON-STANDARD EVENT!

  			root.on('put', function(at){
  				this.to.next(at);
  				Gun.graph.is(at.put, null, map);
  				if(!at['@']){ acks[at['#']] = true; } // only ack non-acks.
  				count += 1;
  				if(count >= (opt.batch || 1000)){
  					return flush();
  				}
  				if(to){ return }
  				to = setTimeout(flush, opt.wait || 1);
  			});

  			root.on('get', function(msg){
  				this.to.next(msg);
  				var lex = msg.get, soul, data, u;
  				function to(){
  				if(!lex || !(soul = lex['#'])){ return }
  				//if(0 >= msg.cap){ return }
  				var has = lex['.'];
  				data = disk[soul] || u;
  				if(data && has){
  					data = Gun.state.to(data, has);
  				}
  				if(!data && !Gun.obj.empty(opt.peers)){ // if data not found, don't ack if there are peers.
  					return; // Hmm, what if we have peers but we are disconnected?
  				}
  				//console.log("lS get", lex, data);
  				root.on('in', {'@': msg['#'], put: Gun.graph.node(data), how: 'lS', lS: msg.$ || root.$});
  				}				Gun.debug? setTimeout(to,1) : to();
  			});

  			var map = function(val, key, node, soul){
  				disk[soul] = Gun.state.to(node, key, disk[soul]);
  			};

  			var flush = function(data){
  				var err;
  				count = 0;
  				clearTimeout(to);
  				to = false;
  				var ack = acks;
  				acks = {};
  				if(data){ disk = data; }
  				try{store.setItem(opt.prefix, JSON.stringify(disk));
  				}catch(e){
  					Gun.log(err = (e || "localStorage failure") + " Consider using GUN's IndexedDB plugin for RAD for more storage space, temporary example at https://github.com/amark/gun/blob/master/test/tmp/indexedDB.html .");
  					root.on('localStorage:error', {err: err, file: opt.prefix, flush: disk, retry: flush});
  				}
  				if(!err && !Gun.obj.empty(opt.peers)){ return } // only ack if there are no peers.
  				Gun.obj.map(ack, function(yes, id){
  					root.on('in', {
  						'@': id,
  						err: err,
  						ok: 0 // localStorage isn't reliable, so make its `ok` code be a low number.
  					});
  				});
  			};
  		});
  	})(USE, './adapters/localStorage');
  USE(function(module){
  		var Gun = USE('../index');
  		var Type = USE('../type');

  		function Mesh(ctx){
  			var mesh = function(){};
  			var opt = ctx.opt || {};
  			opt.log = opt.log || console.log;
  			opt.gap = opt.gap || opt.wait || 1;
  			opt.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.

  			mesh.out = function(msg){ var tmp;
  				if(this.to){ this.to.next(msg); }
  				//if(mesh.last != msg['#']){ return mesh.last = msg['#'], this.to.next(msg) }
  				if((tmp = msg['@'])
  				&& (tmp = ctx.dup.s[tmp])
  				&& (tmp = tmp.it)
  				&& tmp._){
  					mesh.say(msg, (tmp._).via, 1);
  					tmp['##'] = msg['##'];
  					return;
  				}
  				// add hook for AXE?
  				if (Gun.AXE) { Gun.AXE.say(msg, mesh.say, this); return; }
  				mesh.say(msg);
  			};

  			ctx.on('create', function(root){
  				root.opt.pid = root.opt.pid || Type.text.random(9);
  				this.to.next(root);
  				ctx.on('out', mesh.out);
  			});

  			mesh.hear = function(raw, peer){
  				if(!raw){ return }
  				var dup = ctx.dup, id, hash, msg, tmp = raw[0];
  				if(opt.pack <= raw.length){ return mesh.say({dam: '!', err: "Message too big!"}, peer) }
  				if('{' === tmp){
  					try{msg = JSON.parse(raw);}catch(e){opt.log('DAM JSON parse error', e);}
  					if(!msg){ return }
  					if(dup.check(id = msg['#'])){ return }
  					dup.track(id, true).it = msg; // GUN core also dedups, so `true` is needed.
  					if((tmp = msg['@']) && msg.put){
  						hash = msg['##'] || (msg['##'] = mesh.hash(msg));
  						if((tmp = tmp + hash) != id){
  							if(dup.check(tmp)){ return }
  							(tmp = dup.s)[hash] = tmp[id];
  						}
  					}
  					(msg._ = function(){}).via = peer;
  					if((tmp = msg['><'])){
  						(msg._).to = Type.obj.map(tmp.split(','), tomap);
  					}
  					if(msg.dam){
  						if(tmp = mesh.hear[msg.dam]){
  							tmp(msg, peer, ctx);
  						}
  						return;
  					}
  					ctx.on('in', msg);

  					return;
  				} else
  				if('[' === tmp){
  					try{msg = JSON.parse(raw);}catch(e){opt.log('DAM JSON parse error', e);}
  					if(!msg){ return }
  					var i = 0, m;
  					while(m = msg[i++]){
  						mesh.hear(m, peer);
  					}

  					return;
  				}
  			};
  			var tomap = function(k,i,m){m(k,true);};
  (function(){
  				mesh.say = function(msg, peer, o){
  					/*
  						TODO: Plenty of performance optimizations
  						that can be made just based off of ordering,
  						and reducing function calls for cached writes.
  					*/
  					if(!peer){
  						Type.obj.map(opt.peers, function(peer){
  							mesh.say(msg, peer);
  						});
  						return;
  					}
  					var tmp, wire = peer.wire || ((opt.wire) && opt.wire(peer)), msh, raw;// || open(peer, ctx); // TODO: Reopen!
  					if(!wire){ return }
  					msh = (msg._) || empty;
  					if(peer === msh.via){ return }
  					if(!(raw = msh.raw)){ raw = mesh.raw(msg); }
  					if((tmp = msg['@'])
  					&& (tmp = ctx.dup.s[tmp])
  					&& (tmp = tmp.it)){
  						if(tmp.get && tmp['##'] && tmp['##'] === msg['##']){ // PERF: move this condition outside say?
  							return; // TODO: this still needs to be tested in the browser!
  						}
  					}
  					if((tmp = msh.to) && (tmp[peer.url] || tmp[peer.id]) && !o){ return } // TODO: still needs to be tested
  					if(peer.batch){
  						peer.tail = (peer.tail || 0) + raw.length;
  						if(peer.tail <= opt.pack){
  							peer.batch.push(raw);
  							return;
  						}
  						flush(peer);
  					}
  					peer.batch = [];
  					setTimeout(function(){flush(peer);}, opt.gap);
  					send(raw, peer);
  				};
  				function flush(peer){
  					var tmp = peer.batch;
  					if(!tmp){ return }
  					peer.batch = peer.tail = null;
  					if(!tmp.length){ return }
  					try{send(JSON.stringify(tmp), peer);
  					}catch(e){opt.log('DAM JSON stringify error', e);}
  				}
  				function send(raw, peer){
  					var wire = peer.wire;
  					try{
  						if(peer.say){
  							peer.say(raw);
  						} else
  						if(wire.send){
  							wire.send(raw);
  						}
  					}catch(e){
  						(peer.queue = peer.queue || []).push(raw);
  					}
  				}

  			}());
  (function(){

  				mesh.raw = function(msg){
  					if(!msg){ return '' }
  					var dup = ctx.dup, msh = (msg._) || {}, put, hash, tmp;
  					if(tmp = msh.raw){ return tmp }
  					if(typeof msg === 'string'){ return msg }
  					if(msg['@'] && (tmp = msg.put)){
  						if(!(hash = msg['##'])){
  							put = $(tmp, sort) || '';
  							hash = mesh.hash(msg, put);
  							msg['##'] = hash;
  						}
  						(tmp = dup.s)[hash = msg['@']+hash] = tmp[msg['#']];
  						msg['#'] = hash || msg['#'];
  						if(put){ (msg = Type.obj.to(msg)).put = _; }
  					}
  					var i = 0, to = []; Type.obj.map(opt.peers, function(p){
  						to.push(p.url || p.id); if(++i > 9){ return true } // limit server, fast fix, improve later!
  					}); msg['><'] = to.join();
  					var raw = $(msg);
  					if(u !== put){
  						tmp = raw.indexOf(_, raw.indexOf('put'));
  						raw = raw.slice(0, tmp-1) + put + raw.slice(tmp + _.length + 1);
  						//raw = raw.replace('"'+ _ +'"', put); // https://github.com/amark/gun/wiki/@$$ Heisenbug
  					}
  					if(msh){
  						msh.raw = raw;
  					}
  					return raw;
  				};

  				mesh.hash = function(msg, hash){
  					return Mesh.hash(hash || $(msg.put, sort) || '') || msg['#'] || Type.text.random(9);
  				};

  				function sort(k, v){ var tmp;
  					if(!(v instanceof Object)){ return v }
  					Type.obj.map(Object.keys(v).sort(), map, {to: tmp = {}, on: v});
  					return tmp;
  				}

  				function map(k){
  					this.to[k] = this.on[k];
  				}
  				var $ = JSON.stringify, _ = ':])([:';

  			}());

  			mesh.hi = function(peer){
  				var tmp = peer.wire || {};
  				if(peer.id || peer.url){
  					opt.peers[peer.url || peer.id] = peer;
  					Type.obj.del(opt.peers, tmp.id);
  				} else {
  					tmp = tmp.id = tmp.id || Type.text.random(9);
  					mesh.say({dam: '?'}, opt.peers[tmp] = peer);
  				}
  				if(!tmp.hied){ ctx.on(tmp.hied = 'hi', peer); }
  				// @rogowski I need this here by default for now to fix go1dfish's bug
  				tmp = peer.queue; peer.queue = [];
  				Type.obj.map(tmp, function(msg){
  					mesh.say(msg, peer);
  				});
  			};
  			mesh.bye = function(peer){
  				Type.obj.del(opt.peers, peer.id); // assume if peer.url then reconnect
  				ctx.on('bye', peer);
  			};
  			mesh.hear['!'] = function(msg, peer){ opt.log('Error:', msg.err); };
  			mesh.hear['?'] = function(msg, peer){
  				if(!msg.pid){
  					mesh.say({dam: '?', pid: opt.pid, '@': msg['#']}, peer);
  					// @rogowski I want to re-enable this AXE logic with some fix/merge later.
  					// var tmp = peer.queue; peer.queue = [];
  					// Type.obj.map(tmp, function(msg){
  					//	mesh.say(msg, peer);
  					// });
  					return;
  				}
  				peer.id = peer.id || msg.pid;
  				mesh.hi(peer);
  			};
  			return mesh;
  		}

  		Mesh.hash = function(s){ // via SO
  			if(typeof s !== 'string'){ return {err: 1} }
  	    var c = 0;
  	    if(!s.length){ return c }
  	    for(var i=0,l=s.length,n; i<l; ++i){
  	      n = s.charCodeAt(i);
  	      c = ((c<<5)-c)+n;
  	      c |= 0;
  	    }
  	    return c; // Math.abs(c);
  	  };

  	  var empty = {}, u;
  	  Object.keys = Object.keys || function(o){ return map(o, function(v,k,t){t(k);}) };

  	  try{ module.exports = Mesh; }catch(e){}

  	})(USE, './adapters/mesh');
  USE(function(module){
  		var Gun = USE('../index');
  		Gun.Mesh = USE('./mesh');

  		Gun.on('opt', function(root){
  			this.to.next(root);
  			var opt = root.opt;
  			if(root.once){ return }
  			if(false === opt.WebSocket){ return }

  			var env;
  			if(typeof window !== "undefined"){ env = window; }
  			if(typeof commonjsGlobal !== "undefined"){ env = commonjsGlobal; }
  			env = env || {};

  			var websocket = opt.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket;
  			if(!websocket){ return }
  			opt.WebSocket = websocket;

  			var mesh = opt.mesh = opt.mesh || Gun.Mesh(root);

  			var wire = opt.wire;
  			opt.wire = open;
  			function open(peer){ try{
  				if(!peer || !peer.url){ return wire && wire(peer) }
  				var url = peer.url.replace('http', 'ws');
  				var wire = peer.wire = new opt.WebSocket(url);
  				wire.onclose = function(){
  					opt.mesh.bye(peer);
  					reconnect(peer);
  				};
  				wire.onerror = function(error){
  					reconnect(peer); // placement?
  					if(!error){ return }
  					if(error.code === 'ECONNREFUSED'){
  						//reconnect(peer, as);
  					}
  				};
  				wire.onopen = function(){
  					opt.mesh.hi(peer);
  				};
  				wire.onmessage = function(msg){
  					if(!msg){ return }
  					opt.mesh.hear(msg.data || msg, peer);
  				};
  				return wire;
  			}catch(e){}}

  			function reconnect(peer){
  				clearTimeout(peer.defer);
  				peer.defer = setTimeout(function(){
  					open(peer);
  				}, 2 * 1000);
  			}
  		});
  	})(USE, './adapters/websocket');

  }());
  });

  var __dirname = '/home/dev/snapgraph/node_modules/gun/lib';

  var require$$2 = {};

  // Copyright Joyent, Inc. and other Node contributors.
  //
  // Permission is hereby granted, free of charge, to any person obtaining a
  // copy of this software and associated documentation files (the
  // "Software"), to deal in the Software without restriction, including
  // without limitation the rights to use, copy, modify, merge, publish,
  // distribute, sublicense, and/or sell copies of the Software, and to permit
  // persons to whom the Software is furnished to do so, subject to the
  // following conditions:
  //
  // The above copyright notice and this permission notice shall be included
  // in all copies or substantial portions of the Software.
  //
  // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
  // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
  // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
  // USE OR OTHER DEALINGS IN THE SOFTWARE.

  // resolves . and .. elements in a path array with directory names there
  // must be no slashes, empty elements, or device names (c:\) in the array
  // (so also no leading and trailing slashes - it does not distinguish
  // relative and absolute paths)
  function normalizeArray(parts, allowAboveRoot) {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (; up--; up) {
        parts.unshift('..');
      }
    }

    return parts;
  }

  // Split a filename into [root, dir, basename, ext], unix version
  // 'root' is just a slash, or nothing.
  var splitPathRe =
      /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
  var splitPath = function(filename) {
    return splitPathRe.exec(filename).slice(1);
  };

  // path.resolve([from ...], to)
  // posix version
  function resolve() {
    var resolvedPath = '',
        resolvedAbsolute = false;

    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = (i >= 0) ? arguments[i] : '/';

      // Skip empty and invalid entries
      if (typeof path !== 'string') {
        throw new TypeError('Arguments to path.resolve must be strings');
      } else if (!path) {
        continue;
      }

      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charAt(0) === '/';
    }

    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)

    // Normalize the path
    resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
      return !!p;
    }), !resolvedAbsolute).join('/');

    return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
  }
  // path.normalize(path)
  // posix version
  function normalize(path) {
    var isPathAbsolute = isAbsolute(path),
        trailingSlash = substr(path, -1) === '/';

    // Normalize the path
    path = normalizeArray(filter(path.split('/'), function(p) {
      return !!p;
    }), !isPathAbsolute).join('/');

    if (!path && !isPathAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }

    return (isPathAbsolute ? '/' : '') + path;
  }
  // posix version
  function isAbsolute(path) {
    return path.charAt(0) === '/';
  }

  // posix version
  function join() {
    var paths = Array.prototype.slice.call(arguments, 0);
    return normalize(filter(paths, function(p, index) {
      if (typeof p !== 'string') {
        throw new TypeError('Arguments to path.join must be strings');
      }
      return p;
    }).join('/'));
  }


  // path.relative(from, to)
  // posix version
  function relative(from, to) {
    from = resolve(from).substr(1);
    to = resolve(to).substr(1);

    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== '') break;
      }

      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== '') break;
      }

      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }

    var fromParts = trim(from.split('/'));
    var toParts = trim(to.split('/'));

    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }

    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push('..');
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join('/');
  }

  var sep = '/';
  var delimiter$1 = ':';

  function dirname(path) {
    var result = splitPath(path),
        root = result[0],
        dir = result[1];

    if (!root && !dir) {
      // No dirname whatsoever
      return '.';
    }

    if (dir) {
      // It has a dirname, strip trailing slash
      dir = dir.substr(0, dir.length - 1);
    }

    return root + dir;
  }

  function basename(path, ext) {
    var f = splitPath(path)[2];
    // TODO: make this comparison case-insensitive on windows?
    if (ext && f.substr(-1 * ext.length) === ext) {
      f = f.substr(0, f.length - ext.length);
    }
    return f;
  }


  function extname(path) {
    return splitPath(path)[3];
  }
  var require$$3 = {
    extname: extname,
    basename: basename,
    dirname: dirname,
    sep: sep,
    delimiter: delimiter$1,
    relative: relative,
    join: join,
    isAbsolute: isAbsolute,
    normalize: normalize,
    resolve: resolve
  };
  function filter (xs, f) {
      if (xs.filter) return xs.filter(f);
      var res = [];
      for (var i = 0; i < xs.length; i++) {
          if (f(xs[i], i, xs)) res.push(xs[i]);
      }
      return res;
  }

  // String.prototype.substr - negative index don't work in IE8
  var substr = 'ab'.substr(-1) === 'b' ?
      function (str, start, len) { return str.substr(start, len) } :
      function (str, start, len) {
          if (start < 0) start = str.length + start;
          return str.substr(start, len);
      }
  ;

  var dot = /\.\.+/g;
  var slash = /\/\/+/g;

  function CDN(dir){
  	return function(req, res){
  		req.url = (req.url||'').replace(dot,'').replace(slash,'/');
  		if(serve(req, res)){ return } // filters GUN requests!
  		require$$2.createReadStream(require$$3.join(dir, req.url)).on('error',function(tmp){ // static files!
  			try{ tmp = require$$2.readFileSync(require$$3.join(dir, 'index.html')); }catch(e){}
  			res.writeHead(200, {'Content-Type': 'text/html'});
  			res.end(tmp+''); // or default to index
  		}).pipe(res); // stream
  	}
  }

  function serve(req, res, next){
  	if(typeof req === 'string'){ return CDN(req) }
  	if(!req || !res){ return false }
  	next = next || serve;
  	if(!req.url){ return next() }
  	if(0 <= req.url.indexOf('gun.js')){
  		res.writeHead(200, {'Content-Type': 'text/javascript'});
  		res.end(serve.js = serve.js || require$$2.readFileSync(__dirname + '/../gun.js'));
  		return true;
  	}
  	if(0 <= req.url.indexOf('gun/')){
  		res.writeHead(200, {'Content-Type': 'text/javascript'});
  		var path = __dirname + '/../' + req.url.split('/').slice(2).join('/'), file;
  		try{file = require$$2.readFileSync(path);}catch(e){}
  		if(file){
  			res.end(file);
  			return true;
  		}
  	}
  	return next();
  }

  var serve_1 = serve;

  (function(){
  	// NOTE: While the algorithm is P2P,
  	// the current implementation is one sided,
  	// only browsers self-modify, servers do not.
  	// Need to fix this! Since WebRTC is now working.
  	var env;
  	if(typeof commonjsGlobal !== "undefined"){ env = commonjsGlobal; }
  	if(typeof window !== "undefined"){ var Gun = (env = window).Gun; }
  	else {
  	if(typeof commonjsRequire !== "undefined"){ var Gun = gun$1; }
  	}

  	Gun.on('opt', function(ctx){
  		this.to.next(ctx);
  		if(ctx.once){ return }
  		ctx.on('in', function(at){
  			if(!at.nts && !at.NTS){
  				return this.to.next(at);
  			}
  			if(at['@']){
  				(ask[at['@']]||noop)(at);
  				return;
  			}
  			if(env.window){
  				return this.to.next(at);
  			}
  			this.to.next({'@': at['#'], nts: Gun.time.is()});
  		});
  		var ask = {}, noop = function(){};
  		if(!env.window){ return }

  		Gun.state.drift = Gun.state.drift || 0;
  		setTimeout(function ping(){
  			var NTS = {}, ack = Gun.text.random(), msg = {'#': ack, nts: true};
  			NTS.start = Gun.state();
  			ask[ack] = function(at){
  				NTS.end = Gun.state();
  				Gun.obj.del(ask, ack);
  				NTS.latency = (NTS.end - NTS.start)/2;
  				if(!at.nts && !at.NTS){ return }
  				NTS.calc = NTS.latency + (at.NTS || at.nts);
  				Gun.state.drift -= (NTS.end - NTS.calc)/2;
  				setTimeout(ping, 1000);
  			};
  			ctx.on('out', msg);
  		}, 1);
  	});
  	// test by opening up examples/game/nts.html on devices that aren't NTP synced.
  }());

  var radix = createCommonjsModule(function (module) {
  (function(){

  	function Radix(){
  		var radix = function(key, val, t){
  			key = ''+key;
  			if(!t && u !== val){ 
  				radix.last = (key < radix.last)? radix.last : key;
  				delete (radix.$||{})[_];
  			}
  			t = t || radix.$ || (radix.$ = {});
  			if(!key && Object.keys(t).length){ return t }
  			var i = 0, l = key.length-1, k = key[i], at, tmp;
  			while(!(at = t[k]) && i < l){
  				k += key[++i];
  			}
  			if(!at){
  				if(!map(t, function(r, s){
  					var ii = 0, kk = '';
  					if((s||'').length){ while(s[ii] == key[ii]){
  						kk += s[ii++];
  					} }
  					if(kk){
  						if(u === val){
  							if(ii <= l){ return }
  							return (tmp || (tmp = {}))[s.slice(ii)] = r;
  						}
  						var __ = {};
  						__[s.slice(ii)] = r;
  						ii = key.slice(ii);
  						('' === ii)? (__[''] = val) : ((__[ii] = {})[''] = val);
  						t[kk] = __;
  						delete t[s];
  						return true;
  					}
  				})){
  					if(u === val){ return; }
  					(t[k] || (t[k] = {}))[''] = val;
  				}
  				if(u === val){
  					return tmp;
  				}
  			} else 
  			if(i == l){
  				if(u === val){ return (u === (tmp = at['']))? at : tmp }
  				at[''] = val;
  			} else {
  				if(u !== val){ delete at[_]; }
  				return radix(key.slice(++i), val, at || (at = {}));
  			}
  		};
  		return radix;
  	}
  	Radix.map = function map(radix, cb, opt, pre){ pre = pre || [];
  		var t = ('function' == typeof radix)? radix.$ || {} : radix;
  		if(!t){ return }
  		var keys = (t[_]||no).sort || (t[_] = function $(){ $.sort = Object.keys(t).sort(); return $ }()).sort;
  		//var keys = Object.keys(t).sort();
  		opt = (true === opt)? {branch: true} : (opt || {});
  		if(opt.reverse){ keys = keys.slice().reverse(); }
  		var start = opt.start, end = opt.end;
  		var i = 0, l = keys.length;
  		for(;i < l; i++){ var key = keys[i], tree = t[key], tmp, p, pt;
  			if(!tree || '' === key || _ === key){ continue }
  			p = pre.slice(); p.push(key);
  			pt = p.join('');
  			if(u !== start && pt < (start||'').slice(0,pt.length)){ continue }
  			if(u !== end && (end || '\uffff') < pt){ continue }
  			if(u !== (tmp = tree[''])){
  				tmp = cb(tmp, pt, key, pre);
  				if(u !== tmp){ return tmp }
  			} else
  			if(opt.branch){
  				tmp = cb(u, pt, key, pre);
  				if(u !== tmp){ return tmp }
  			}
  			pre = p;
  			tmp = map(tree, cb, opt, pre);
  			if(u !== tmp){ return tmp }
  			pre.pop();
  		}
  	};

  	Object.keys = Object.keys || function(o){ return map(o, function(v,k,t){t(k);}) };

  	if(typeof window !== "undefined"){
  	  var Gun = window.Gun;
  	  window.Radix = Radix;
  	} else { 
  	  var Gun = gun$1;
  		try{ module.exports = Radix; }catch(e){}
  	}
  	
  	var map = Gun.obj.map, no = {}, u;
  	var _ = String.fromCharCode(24);
  	
  }());
  });

  var radisk = createCommonjsModule(function (module) {
  (function(){

  	function Radisk(opt){

  		opt = opt || {};
  		opt.log = opt.log || console.log;
  		opt.file = String(opt.file || 'radata');
  		var has = (Radisk.has || (Radisk.has = {}))[opt.file];
  		if(has){ return has }

  		opt.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
  		opt.until = opt.until || opt.wait || 250;
  		opt.batch = opt.batch || (10 * 1000);
  		opt.chunk = opt.chunk || (1024 * 1024 * 10); // 10MB
  		opt.code = opt.code || {};
  		opt.code.from = opt.code.from || '!';
  		//opt.jsonify = true; // TODO: REMOVE!!!!

  		function ename(t){ return encodeURIComponent(t).replace(/\*/g, '%2A') }
  		function atomic(v){ return u !== v && (!v || 'object' != typeof v) }
  		var map = Gun.obj.map;
  		var LOG = false;

  		if(!opt.store){
  			return opt.log("ERROR: Radisk needs `opt.store` interface with `{get: fn, put: fn (, list: fn)}`!");
  		}
  		if(!opt.store.put){
  			return opt.log("ERROR: Radisk needs `store.put` interface with `(file, data, cb)`!");
  		}
  		if(!opt.store.get){
  			return opt.log("ERROR: Radisk needs `store.get` interface with `(file, cb)`!");
  		}
  		if(!opt.store.list);

  		/*
  			Any and all storage adapters should...
  			1. Because writing to disk takes time, we should batch data to disk. This improves performance, and reduces potential disk corruption.
  			2. If a batch exceeds a certain number of writes, we should immediately write to disk when physically possible. This caps total performance, but reduces potential loss.
  		*/
  		var r = function(key, val, cb){
  			key = ''+key;
  			if(val instanceof Function){
  				var o = cb || {};
  				cb = val;
  				val = r.batch(key);
  				if(u !== val){
  					cb(u, r.range(val, o), o);
  					if(atomic(val)){ return }
  					// if a node is requested and some of it is cached... the other parts might not be.
  				}
  				if(r.thrash.at){
  					val = r.thrash.at(key);
  					if(u !== val){
  						cb(u, r.range(val, o), o);
  						if(atomic(val)){ cb(u, val, o); return }
  						// if a node is requested and some of it is cached... the other parts might not be.
  					}
  				}
  				return r.read(key, cb, o);
  			}
  			r.batch(key, val);
  			if(cb){ r.batch.acks.push(cb); }
  			if(++r.batch.ed >= opt.batch){ return r.thrash() } // (2)
  			if(r.batch.to){ return }
  			//clearTimeout(r.batch.to); // (1) // THIS LINE IS EVIL! NEVER USE IT! ALSO NEVER DELETE THIS SO WE NEVER MAKE THE SAME MISTAKE AGAIN!
  			r.batch.to = setTimeout(r.thrash, opt.until || 1);
  		};

  		r.batch = Radix();
  		r.batch.acks = [];
  		r.batch.ed = 0;

  		r.thrash = function(){
  			var thrash = r.thrash;
  			if(thrash.ing){ return thrash.more = true }
  			thrash.more = false;
  			thrash.ing = true;
  			var batch = thrash.at = r.batch, i = 0;
  			clearTimeout(r.batch.to);
  			r.batch = null;
  			r.batch = Radix();
  			r.batch.acks = [];
  			r.batch.ed = 0;
  			//var id = Gun.text.random(2), S = (+new Date); console.log("<<<<<<<<<<<<", id);
  			r.save(batch, function(err, ok){
  				if(++i > 1){ opt.log('RAD ERR: Radisk has callbacked multiple times, please report this as a BUG at github.com/amark/gun/issues ! ' + i); return }
  				if(err){ opt.log('err', err); }
  				//console.log(">>>>>>>>>>>>", id, ((+new Date) - S), batch.acks.length);
  				map(batch.acks, function(cb){ cb(err, ok); });
  				thrash.at = null;
  				thrash.ing = false;
  				if(thrash.more){ thrash(); }
  			});
  		};

  		/*
  			1. Find the first radix item in memory.
  			2. Use that as the starting index in the directory of files.
  			3. Find the first file that is lexically larger than it,
  			4. Read the previous file to that into memory
  			5. Scan through the in memory radix for all values lexically less than the limit.
  			6. Merge and write all of those to the in-memory file and back to disk.
  			7. If file too large, split. More details needed here.
  		*/
  		r.save = function(rad, cb){
  			var s = function Span(){};
  			s.find = function(tree, key){
  				if(key < s.start){ return }
  				s.start = key;
  				r.list(s.lex);
  				return true;
  			};
  			s.lex = function(file){
  				file = (u === file)? u : decodeURIComponent(file);
  				if(!file || file > s.start){
  					s.mix(s.file || opt.code.from, s.start, s.end = file);
  					return true;
  				}
  				s.file = file;
  			};
  			s.mix = function(file, start, end){
  				s.start = s.end = s.file = u;
  				r.parse(file, function(err, disk){
  					if(err){ return cb(err) }
  					disk = disk || Radix();
  					Radix.map(rad, function(val, key){
  						if(key < start){ return }
  						if(end && end < key){ return s.start = key }
  						// PLUGIN: consider adding HAM as an extra layer of protection
  						disk(key, val); // merge batch[key] -> disk[key]
  					});
  					r.write(file, disk, s.next);
  				});
  			};
  			s.next = function(err, ok){
  				if(s.err = err){ return cb(err) }
  				if(s.start){ return Radix.map(rad, s.find) }
  				cb(err, ok);
  			};
  			Radix.map(rad, s.find);
  		};

  		/*
  			Any storage engine at some point will have to do a read in order to write.
  			This is true of even systems that use an append only log, if they support updates.
  			Therefore it is unavoidable that a read will have to happen,
  			the question is just how long you delay it.
  		*/
  		r.write = function(file, rad, cb, o){
  			o = ('object' == typeof o)? o : {force: o};
  			var f = function Fractal(){};
  			f.text = '';
  			f.count = 0;
  			f.file = file;
  			f.each = function(val, key, k, pre){
  				//console.log("RAD:::", JSON.stringify([val, key, k, pre]));
  				if(u !== val){ f.count++; }
  				if(opt.pack <= (val||'').length){ return cb("Record too big!"), true }
  				var enc = Radisk.encode(pre.length) +'#'+ Radisk.encode(k) + (u === val? '' : ':'+ Radisk.encode(val)) +'\n';
  				if((opt.chunk < f.text.length + enc.length) && (1 < f.count) && !o.force){
  					f.text = '';
  					f.limit = Math.ceil(f.count/2);
  					f.count = 0;
  					f.sub = Radix();
  					Radix.map(rad, f.slice);
  					return true;
  				}
  				f.text += enc;
  			};
  			f.write = function(){
  				var tmp = ename(file);
  				opt.store.put(tmp, f.text, function(err){
  					if(err){ return cb(err) }
  					r.list.add(tmp, cb);
  				});
  			};
  			f.slice = function(val, key){
  				if(key < f.file){ return }
  				if(f.limit < (++f.count)){
  					var name = f.file;
  					f.file = key;
  					f.count = 0;
  					r.write(name, f.sub, f.next, o);
  					return true;
  				}
  				f.sub(key, val);
  			};
  			f.next = function(err){
  				if(err){ return cb(err) }
  				f.sub = Radix();
  				if(!Radix.map(rad, f.slice)){
  					r.write(f.file, f.sub, cb, o);
  				}
  			};
  			if(opt.jsonify){ return r.write.jsonify(f, file, rad, cb, o) } // temporary testing idea
  			if(!Radix.map(rad, f.each, true)){ f.write(); }
  		};

  		r.write.jsonify = function(f, file, rad, cb, o){
  			var raw;
  			try{raw = JSON.stringify(rad.$);
  			}catch(e){ return cb("Record too big!") }
  			if(opt.chunk < raw.length && !o.force){
  				if(Radix.map(rad, f.each, true)){ return }
  			}
  			f.text = raw;
  			f.write();
  		};

  		r.range = function(tree, o){
  			if(!tree || !o){ return }
  			if(u === o.start && u === o.end){ return tree }
  			if(atomic(tree)){ return tree }
  			var sub = Radix();
  			Radix.map(tree, function(v,k){
  				sub(k,v);
  			}, o);
  			return sub('');
  		}

  		;(function(){
  			var Q = {};
  			r.read = function(key, cb, o){
  				o = o || {};
  				if(RAD && !o.next){ // cache
  					var val = RAD(key);
  					//if(u !== val){
  						//cb(u, val, o);
  						if(atomic(val)){ cb(u, val, o); return }
  						// if a node is requested and some of it is cached... the other parts might not be.
  					//}
  				}
  				o.span = (u !== o.start) || (u !== o.end);
  				var g = function Get(){};
  				g.lex = function(file){ var tmp;
  					file = (u === file)? u : decodeURIComponent(file);
  					tmp = o.next || key || (o.reverse? o.end || '\uffff' : o.start || '');
  					if(!file || (o.reverse? file < tmp : file > tmp)){
  						if(o.next || o.reverse){ g.file = file; }
  						if(tmp = Q[g.file]){
  							tmp.push({key: key, ack: cb, file: g.file, opt: o});
  							return true;
  						}
  						Q[g.file] = [{key: key, ack: cb, file: g.file, opt: o}];
  						if(!g.file){
  							g.it(null, u, {});
  							return true; 
  						}
  						r.parse(g.file, g.it);
  						return true;
  					}
  					g.file = file;
  				};
  				g.it = function(err, disk, info){
  					if(g.err = err){ opt.log('err', err); }
  					g.info = info;
  					if(disk){ RAD = g.disk = disk; }
  					disk = Q[g.file]; delete Q[g.file];
  					map(disk, g.ack);
  				};
  				g.ack = function(as){
  					if(!as.ack){ return }
  					var tmp = as.key, o = as.opt, info = g.info, rad = g.disk || noop, data = r.range(rad(tmp), o), last = rad.last;
  					o.parsed = (o.parsed || 0) + (info.parsed||0);
  					o.chunks = (o.chunks || 0) + 1;
  					if(!o.some){ o.some = (u !== data); }
  					if(u !== data){ as.ack(g.err, data, o); }
  					else if(!as.file){ !o.some && as.ack(g.err, u, o); return }
  					if(!o.span){
  						if(/*!last || */last === tmp){ !o.some && as.ack(g.err, u, o); return }
  						if(last && last > tmp && 0 != last.indexOf(tmp)){ !o.some && as.ack(g.err, u, o); return }
  					}
  					if(o.some && o.parsed >= o.limit){ return }
  					o.next = as.file;
  					r.read(tmp, as.ack, o);
  				};
  				if(o.reverse){ g.lex.reverse = true; }
  				r.list(g.lex);
  			};
  		}());
  (function(){
  			/*
  				Let us start by assuming we are the only process that is
  				changing the directory or bucket. Not because we do not want
  				to be multi-process/machine, but because we want to experiment
  				with how much performance and scale we can get out of only one.
  				Then we can work on the harder problem of being multi-process.
  			*/
  			var Q = {}, s = String.fromCharCode(31);
  			r.parse = function(file, cb, raw){ var q;
  				if(q = Q[file]){ return q.push(cb) } q = Q[file] = [cb];
  				var p = function Parse(){}, info = {};
  				p.disk = Radix();
  				p.read = function(err, data){ var tmp;
  					delete Q[file];
  					if((p.err = err) || (p.not = !data)){
  						return map(q, p.ack);
  					}
  					if(typeof data !== 'string'){
  						try{
  							if(opt.pack <= data.length){
  								p.err = "Chunk too big!";
  							} else {
  								data = data.toString(); // If it crashes, it crashes here. How!?? We check size first!
  							}
  						}catch(e){ p.err = e; }
  						if(p.err){ return map(q, p.ack) }
  					}
  					info.parsed = data.length;

  					var start;					if(opt.jsonify){ // temporary testing idea
  						try{
  							var json = JSON.parse(data);
  							p.disk.$ = json;
  							LOG && console.log('parsed JSON in', (+new Date) - start); // keep this commented out in production!
  							map(q, p.ack);
  							return;
  						}catch(e){ tmp = e; }
  						if('{' === data[0]){
  							p.err = tmp || "JSON error!";
  							return map(q, p.ack);
  						}
  					}
  					var start;					var tmp = p.split(data), pre = [], i, k, v;
  					if(!tmp || 0 !== tmp[1]){
  						p.err = "File '"+file+"' does not have root radix! ";
  						return map(q, p.ack);
  					}
  					while(tmp){
  						k = v = u;
  						i = tmp[1];
  						tmp = p.split(tmp[2])||'';
  						if('#' == tmp[0]){
  							k = tmp[1];
  							pre = pre.slice(0,i);
  							if(i <= pre.length){
  								pre.push(k);
  							}
  						}
  						tmp = p.split(tmp[2])||'';
  						if('\n' == tmp[0]){ continue }
  						if('=' == tmp[0] || ':' == tmp[0]){ v = tmp[1]; }
  						if(u !== k && u !== v){ p.disk(pre.join(''), v); }
  						tmp = p.split(tmp[2]);
  					}
  					//cb(err, p.disk);
  					map(q, p.ack);
  				};
  				p.split = function(t){
  					if(!t){ return }
  					var l = [], o = {}, i = -1, a = '', b;
  					i = t.indexOf(s);
  					if(!t[i]){ return }
  					a = t.slice(0, i);
  					l[0] = a;
  					l[1] = b = Radisk.decode(t.slice(i), o);
  					l[2] = t.slice(i + o.i);
  					return l;
  				};
  				p.ack = function(cb){ 
  					if(!cb){ return }
  					if(p.err || p.not){ return cb(p.err, u, info) }
  					cb(u, p.disk, info);
  				};
  				if(raw){ return p.read(null, raw) }
  				opt.store.get(ename(file), p.read);
  			};
  		}());
  (function(){
  			var dir, q, f = String.fromCharCode(28), ef = ename(f);
  			r.list = function(cb){
  				if(dir){
  					var tmp = {reverse: (cb.reverse)? 1 : 0};
  					Radix.map(dir, function(val, key){
  						return cb(key);
  					}, tmp) || cb();
  					return;
  				}
  				if(q){ return q.push(cb) } q = [cb];
  				r.parse(f, r.list.init);
  			};
  			r.list.add = function(file, cb){
  				var has = dir(file);
  				if(has || file === ef){
  					return cb(u, 1);
  				}
  				dir(file, true);
  				cb.listed = (cb.listed || 0) + 1;
  				r.write(f, dir, function(err, ok){
  					if(err){ return cb(err) }
  					cb.listed = (cb.listed || 0) - 1;
  					if(cb.listed !== 0){ return }
  					cb(u, 1);
  				}, true);
  			};
  			r.list.init = function(err, disk){
  				if(err){
  					opt.log('list', err);
  					setTimeout(function(){ r.parse(f, r.list.init); }, 1000);
  					return;
  				}
  				if(disk){
  					r.list.drain(disk);
  					return;
  				}
  				if(!opt.store.list){
  					r.list.drain(Radix());
  					return;
  				}
  				// import directory.
  				opt.store.list(function(file){
  					dir = dir || Radix();
  					if(!file){ return r.list.drain(dir) }
  					r.list.add(file, noop);
  				});
  			};
  			r.list.drain = function(rad, tmp){
  				r.list.dir = dir = rad;
  				tmp = q; q = null;
  				Gun.list.map(tmp, function(cb){
  					r.list(cb);
  				});
  			};
  		}());

  		var noop = function(){}, RAD, u;
  		Radisk.has[opt.file] = r;
  		return r;
  	}
  (function(){
  		var _ = String.fromCharCode(31);
  		Radisk.encode = function(d, o, s){ s = s || _;
  			var t = s, tmp;
  			if(typeof d == 'string'){
  				var i = d.indexOf(s);
  				while(i != -1){ t += s; i = d.indexOf(s, i+1); }
  				return t + '"' + d + s;
  			} else
  			if(d && d['#'] && (tmp = Gun.val.link.is(d))){
  				return t + '#' + tmp + t;
  			} else
  			if(Gun.num.is(d)){
  				return t + '+' + (d||0) + t;
  			} else
  			if(null === d){
  				return t + ' ' + t;
  			} else
  			if(true === d){
  				return t + '+' + t;
  			} else
  			if(false === d){
  				return t + '-' + t;
  			}// else
  			//if(binary){}
  		};
  		Radisk.decode = function(t, o, s){ s = s || _;
  			var d = '', i = -1, n = 0, c, p;
  			if(s !== t[0]){ return }
  			while(s === t[++i]){ ++n; }
  			p = t[c = n] || true;
  			while(--n >= 0){ i = t.indexOf(s, i+1); }
  			if(i == -1){ i = t.length; }
  			d = t.slice(c+1, i);
  			if(o){ o.i = i+1; }
  			if('"' === p){
  				return d;
  			} else
  			if('#' === p){
  				return Gun.val.link.ify(d);
  			} else
  			if('+' === p){
  				if(0 === d.length){
  					return true;
  				}
  				return parseFloat(d);
  			} else
  			if(' ' === p){
  				return null;
  			} else
  			if('-' === p){
  				return false;
  			}
  		};
  	}());

  	if(typeof window !== "undefined"){
  	  var Gun = window.Gun;
  	  var Radix = window.Radix;
  	  window.Radisk = Radisk;
  	} else { 
  	  var Gun = gun$1;
  		var Radix = radix;
  		try{ module.exports = Radisk; }catch(e){}
  	}

  	Radisk.Radix = Radix;

  }());
  });

  function Store(opt){
  	opt = opt || {};
  	opt.log = opt.log || console.log;
  	opt.file = String(opt.file || 'radata');
  	var fs = require$$2;

  	var store = function Store(){};
  	if(Store[opt.file]){
  		console.log("Warning: reusing same fs store and options as 1st.");
  		return Store[opt.file];
  	}
  	Store[opt.file] = store;

  	store.put = function(file, data, cb){
  		var random = Math.random().toString(36).slice(-3);
  		var tmp = opt.file+'-'+file+'-'+random+'.tmp';
  		fs.writeFile(tmp, data, function(err, ok){
  			if(err){ return cb(err) }
  			move(tmp, opt.file+'/'+file, cb);
  		});
  	};
  	store.get = function(file, cb){
  		fs.readFile(opt.file+'/'+file, function(err, data){
  			if(err){
  				if('ENOENT' === (err.code||'').toUpperCase()){
  					return cb(null);
  				}
  				opt.log("ERROR:", err);
  			}
  			cb(err, data);
  		});
  	};

  	if(!fs.existsSync(opt.file)){ fs.mkdirSync(opt.file); }

  	function move(oldPath, newPath, cb) {
  		fs.rename(oldPath, newPath, function (err) {
  			if (err) {
  				if (err.code === 'EXDEV') {
  					var readStream = fs.createReadStream(oldPath);
  					var writeStream = fs.createWriteStream(newPath);

  					readStream.on('error', cb);
  					writeStream.on('error', cb);

  					readStream.on('close', function () {
  						fs.unlink(oldPath, cb);
  					});

  					readStream.pipe(writeStream);
  				} else {
  					cb(err);
  				}
  			} else {
  				cb();
  			}
  		});
  	}	
  	return store;
  }

  var rfs = Store;

  var Gun$1 = (typeof window !== "undefined")? window.Gun : gun$1;
   
  Gun$1.on('create', function(root){
      if(Gun$1.TESTING){ root.opt.file = 'radatatest'; }
      this.to.next(root);
      var opt = root.opt, u;
      if(false === opt.radisk){ return }
      var Radisk = (Gun$1.window && Gun$1.window.Radisk) || radisk;
      var Radix = Radisk.Radix;
   
      opt.store = opt.store || (!Gun$1.window && rfs(opt));
      var rad = Radisk(opt), esc = String.fromCharCode(27);
   
      root.on('put', function(msg){
          this.to.next(msg);
          var id = msg['#'] || Gun$1.text.random(3), track = !msg['@'], acks = track? 0 : u; // only ack non-acks.
          if(msg.rad && !track){ return } // don't save our own acks
          Gun$1.graph.is(msg.put, null, function(val, key, node, soul){
              if(track){ ++acks; }
              //console.log('put:', soul, key, val);
              val = Radisk.encode(val, null, esc)+'>'+Radisk.encode(Gun$1.state.is(node, key), null, esc);
              rad(soul+esc+key, val, (track? ack : u));
          });
          function ack(err, ok){
              acks--;
              if(ack.err){ return }
              if(ack.err = err){
                  root.on('in', {'@': id, err: err});
                  return;
              }
              if(acks){ return }
              //console.log("PAT!", id);
              root.on('in', {'@': id, ok: 1});
          }
      });
   
      root.on('get', function(msg){
          this.to.next(msg);
          var id = msg['#'], get = msg.get, soul = msg.get['#'], has = msg.get['.']||'', opt = {}, graph, key, tmp, force;
          if('string' == typeof soul){
              key = soul;
          } else 
          if(soul){
              if(u !== (tmp = soul['*'])){ opt.limit = force = 1; }
              if(u !== soul['>']){ opt.start = soul['>']; }
              if(u !== soul['<']){ opt.end = soul['<']; }
              key = force? (''+tmp) : tmp || soul['='];
              force = null;
          }
          if(key && !opt.limit){ // a soul.has must be on a soul, and not during soul*
              if('string' == typeof has){
                  key = key+esc+(opt.atom = has);
              } else 
              if(has){
                  if(u !== has['>']){ opt.start = has['>']; opt.limit = 1; }
                  if(u !== has['<']){ opt.end = has['<']; opt.limit = 1; }
                  if(u !== (tmp = has['*'])){ opt.limit = force = 1; }
                  if(key){ key = key+esc + (force? (''+(tmp||'')) : tmp || (opt.atom = has['='] || '')); }
              }
          }
          if((tmp = get['%']) || opt.limit){
              opt.limit = (tmp <= (opt.pack || (1000 * 100)))? tmp : 1;
          }
          if(has['-'] || (soul||{})['-']){ opt.reverse = true; }
          //console.log("RAD get:", key, opt);
          //var start = (+new Date); // console.log("GET!", id, JSON.stringify(key));
          rad(key||'', function(err, data, o){
              //console.log("RAD gat:", err, data, o);
              if(data){
                  if(typeof data !== 'string'){
                      if(opt.atom){
                          data = u;
                      } else {
                          Radix.map(data, each); 
                      }
                  }
                  if(!graph && data){ each(data, ''); }
              }
              //console.log("GOT!", id, JSON.stringify(key), ((+new Date) - start));
              root.on('in', {'@': id, put: graph, err: err? err : u, rad: Radix});
          }, opt);
          function each(val, has, a,b){
              if(!val){ return }
              has = (key+has).split(esc);
              var soul = has.slice(0,1)[0];
              has = has.slice(-1)[0];
              opt.count = (opt.count || 0) + val.length;
              tmp = val.lastIndexOf('>');
              var state = Radisk.decode(val.slice(tmp+1), null, esc);
              val = Radisk.decode(val.slice(0,tmp), null, esc);
              (graph = graph || {})[soul] = Gun$1.state.ify(graph[soul], has, state, val, soul);
              if(opt.limit && opt.limit <= opt.count){ return true }
          }
      });
  });

  var Radix = radisk.Radix;
  var AWS;

  gun$1.on('create', function(root){
  	this.to.next(root);
  	var opt = root.opt;
  	{ return }
  	opt.batch = opt.batch || (1000 * 10);
  	opt.until = opt.until || (1000 * 3);
  	opt.chunk = opt.chunk || (1024 * 1024 * 10); // 10MB

  	try{AWS = awsSdk;
  	}catch(e){
  		console.log("aws-sdk is no longer included by default, you must add it to your package.json! `npm install aws-sdk`.");
  	}

  	var opts = opt.s3 || (opt.s3 = {});
  	opts.bucket = opts.bucket || process.env.AWS_S3_BUCKET;
  	opts.region = opts.region || process.AWS_REGION || "us-east-1";
  	opts.accessKeyId = opts.key = opts.key || opts.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
  	opts.secretAccessKey = opts.secret = opts.secret || opts.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;

  	if(opt.fakes3 = opt.fakes3 || process.env.fakes3){
  		opts.endpoint = opt.fakes3;
  		opts.sslEnabled = false;
  		opts.bucket = opts.bucket.replace('.','p');
  	}

  	opts.config = new AWS.Config(opts);
  	opts.s3 = opts.s3 || new AWS.S3(opts.config);

  	opt.store = opt.store || Store$1(opt);
  });

  function Store$1(opt){
  	opt = opt || {};
  	opt.file = String(opt.file || 'radata');
  	var opts = opt.s3, s3 = opts.s3;
  	var c = {p: {}, g: {}, l: {}};
  	
  	var store = function Store(){};
  	if(Store$1[opt.file]){
  		console.log("Warning: reusing same S3 store and options as 1st.");
  		return Store$1[opt.file];
  	}
  	Store$1[opt.file] = store;

  	store.put = function(file, data, cb){
  		var params = {Bucket: opts.bucket, Key: file, Body: data};
  		//console.log("RS3 PUT ---->", (data||"").slice(0,20));
  		gun$1.obj.del(c.g, file);
  		gun$1.obj.del(c.l, 1);
      s3.putObject(params, cb);
  	};
  	store.get = function(file, cb){
  		if(c.g[file]){ return c.g[file].push(cb) }
  		var cbs = c.g[file] = [cb];
  		var params = {Bucket: opts.bucket, Key: file||''};
  		//console.log("RS3 GET ---->", file);
  		s3.getObject(params, function(err, ack){
  			//console.log("RS3 GOT <----", err, file, cbs.length, ((ack||{}).Body||'').toString().slice(0,20));
  			gun$1.obj.del(c.g, file);
  			var data, cbe = function(cb){
  				if(!ack){ cb(null); return; }
  				cb(err, data);
  			};
  			data = (ack||{}).Body; //if(data = (ack||{}).Body){ data = data.toString() }
  			gun$1.obj.map(cbs, cbe);
  		});
  	};
  	store.list = function(cb, match, params, cbs){
  		if(!cbs){
  			if(c.l[1]){ return c.l[1].push(cb) }
  			cbs = c.l[1] = [cb];
  		}
  		params = params || {Bucket: opts.bucket};
  		//console.log("RS3 LIST --->");
  		s3.listObjectsV2(params, function(err, data){
  			//console.log("RS3 LIST <---", err, data, cbs.length);
  			if(err){ return gun$1.log(err, err.stack) }
  			var IT = data.IsTruncated, cbe = function(cb){
  				if(cb.end){ return }
  				if(gun$1.obj.map(data.Contents, function(content){
  					return cb(content.Key);
  				})){ cb.end = true; return }
  				if(IT){ return }
  				// Stream interface requires a final call to know when to be done.
  				cb.end = true; cb();
  			};
  			gun$1.obj.map(cbs, cbe);
  			if(!IT){ gun$1.obj.del(c.l, 1); return }
  	    params.ContinuationToken = data.NextContinuationToken;
  	  	store.list(cb, match, params, cbs);
      });
  	};
  	//store.list(function(){ return true });
  	return store;
  }

  /*
  	An Ad-Hoc Mesh-Network Daisy-Chain
  	should work even if humans are
  	communicating with each other blind.

  	To prevent infinite broadcast loops,
  	we use a deduplication process
  	based on the message's identifier.
  	This is currently implemented in core.

  	However, because this still creates a
  	N*2 (where N is the number of connections)
  	flood, it is not scalable for traditional
  	services that have a hub network topology.

  	Does this mean we have to abandon mesh
  	algorithms? No, we can simply layer more
  	efficient optimizations in based on constraints.
  	If these constraints exist, it automatically
  	upgrades, but if not, it falls back to the
  	brute-force mesh based robust algorithm.
  	A simple example is to limit peer connections
  	and rely upon daisy chaining to relay messages.

  	Another example, is if peers are willing to
  	identify themselves, then we can improve the
  	efficiency of the network by having each peer
  	include the names of peers it is connected in
  	each message. Then each subsequent peer will
  	not relay it to them, since it is unnecessary.
  	This should create N (where N is the number of
  	peers) messages (or possibly N+ if there is a
  	common peer of uncommon peers that receives it
  	and relays at exact latency timings), which is
  	optimal.

  	Since computer networks aren't actually blind,
  	we will implement the above method to improve
  	the performance of the ad-hoc mesh network.

  	But why not have every message contain the
  	whole history of peers that it relayed through?
  	Because in sufficiently large enough networks,
  	with extensive daisy chaining, this will cause
  	the message to become prohibitively slow and
  	increase indefinitely in size.

  */

  gun$1.on('opt', function(root){
  	var opt = root.opt;
  	if(false === opt.ws){
  		this.to.next(root);
  		return;
  	}	

  	var url = require$$0;
  	opt.WebSocket = opt.WebSocket || WebSocket;
  	var ws = opt.ws || {};
  	ws.server = ws.server || opt.web;

  	if(ws.server && !ws.web){

  		opt.mesh = opt.mesh || gun$1.Mesh(root);
  		ws.path = ws.path || '/gun';
  		ws.maxPayload = ws.maxPayload; // || opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3;
  		ws.web = new opt.WebSocket.Server(ws);
  		ws.web.on('connection', function(wire){ var peer;
  			wire.upgradeReq = wire.upgradeReq || {};
  			wire.url = url.parse(wire.upgradeReq.url||'', true);
  			opt.mesh.hi(peer = {wire: wire});
  			wire.on('message', function(msg){
  				opt.mesh.hear(msg.data || msg, peer);
  			});
  			wire.on('close', function(){
  				opt.mesh.bye(peer);
  			});
  			wire.on('error', function(e){});
  		});
  	}

  	this.to.next(root);
  });

  var sea = createCommonjsModule(function (module) {
  (function(){

    /* UNBUILD */
    var root;
    if(typeof window !== "undefined"){ root = window; }
    if(typeof commonjsGlobal !== "undefined"){ root = commonjsGlobal; }
    root = root || {};
    var console = root.console || {log: function(){}};
    function USE(arg, req){
      return req? commonjsRequire() : arg.slice? USE[R(arg)] : function(mod, path){
        arg(mod = {exports: {}});
        USE[R(path)] = mod.exports;
      }
      function R(p){
        return p.split('/').slice(-1).toString().replace('.js','');
      }
    }
    { var common = module; }
  USE(function(module){
      // Security, Encryption, and Authorization: SEA.js
      // MANDATORY READING: https://gun.eco/explainers/data/security.html
      // IT IS IMPLEMENTED IN A POLYFILL/SHIM APPROACH.
      // THIS IS AN EARLY ALPHA!

      if(typeof window !== "undefined"){ module.window = window; }

      var tmp = module.window || module;
      var SEA = tmp.SEA || {};

      if(SEA.window = module.window){ SEA.window.SEA = SEA; }

      try{ if(typeof common !== "undefined"){ common.exports = SEA; } }catch(e){}
      module.exports = SEA;
    })(USE, './root');
  USE(function(module){
      var SEA = USE('./root');
      try{ if(SEA.window){
        if(location.protocol.indexOf('s') < 0
        && location.host.indexOf('localhost') < 0
        && location.protocol.indexOf('file:') < 0){
          location.protocol = 'https:'; // WebCrypto does NOT work without HTTPS!
        }
      } }catch(e){}
    })(USE, './https');
  USE(function(module){
      // This is Array extended to have .toString(['utf8'|'hex'|'base64'])
      function SeaArray() {}
      Object.assign(SeaArray, { from: Array.from });
      SeaArray.prototype = Object.create(Array.prototype);
      SeaArray.prototype.toString = function(enc, start, end) { enc = enc || 'utf8'; start = start || 0;
        const length = this.length;
        if (enc === 'hex') {
          const buf = new Uint8Array(this);
          return [ ...Array(((end && (end + 1)) || length) - start).keys()]
          .map((i) => buf[ i + start ].toString(16).padStart(2, '0')).join('')
        }
        if (enc === 'utf8') {
          return Array.from(
            { length: (end || length) - start },
            (_, i) => String.fromCharCode(this[ i + start])
          ).join('')
        }
        if (enc === 'base64') {
          return btoa(this)
        }
      };
      module.exports = SeaArray;
    })(USE, './array');
  USE(function(module){
      // This is Buffer implementation used in SEA. Functionality is mostly
      // compatible with NodeJS 'safe-buffer' and is used for encoding conversions
      // between binary and 'hex' | 'utf8' | 'base64'
      // See documentation and validation for safe implementation in:
      // https://github.com/feross/safe-buffer#update
      var SeaArray = USE('./array');
      function SafeBuffer(...props) {
        console.warn('new SafeBuffer() is depreciated, please use SafeBuffer.from()');
        return SafeBuffer.from(...props)
      }
      SafeBuffer.prototype = Object.create(Array.prototype);
      Object.assign(SafeBuffer, {
        // (data, enc) where typeof data === 'string' then enc === 'utf8'|'hex'|'base64'
        from() {
          if (!Object.keys(arguments).length) {
            throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
          }
          const input = arguments[0];
          let buf;
          if (typeof input === 'string') {
            const enc = arguments[1] || 'utf8';
            if (enc === 'hex') {
              const bytes = input.match(/([\da-fA-F]{2})/g)
              .map((byte) => parseInt(byte, 16));
              if (!bytes || !bytes.length) {
                throw new TypeError('Invalid first argument for type \'hex\'.')
              }
              buf = SeaArray.from(bytes);
            } else if (enc === 'utf8') {
              const length = input.length;
              const words = new Uint16Array(length);
              buf = SeaArray.from(words);
            } else if (enc === 'base64') {
              const dec = atob(input);
              const length = dec.length;
              const bytes = new Uint8Array(length);
              buf = SeaArray.from(bytes);
            } else if (enc === 'binary') {
              buf = SeaArray.from(input);
            } else {
              console.info('SafeBuffer.from unknown encoding: '+enc);
            }
            return buf
          }
          const byteLength = input.byteLength; // what is going on here? FOR MARTTI
          const length = input.byteLength ? input.byteLength : input.length;
          if (length) {
            let buf;
            if (input instanceof ArrayBuffer) {
              buf = new Uint8Array(input);
            }
            return SeaArray.from(buf || input)
          }
        },
        // This is 'safe-buffer.alloc' sans encoding support
        alloc(length, fill = 0 /*, enc*/ ) {
          return SeaArray.from(new Uint8Array(Array.from({ length: length }, () => fill)))
        },
        // This is normal UNSAFE 'buffer.alloc' or 'new Buffer(length)' - don't use!
        allocUnsafe(length) {
          return SeaArray.from(new Uint8Array(Array.from({ length : length })))
        },
        // This puts together array of array like members
        concat(arr) { // octet array
          if (!Array.isArray(arr)) {
            throw new TypeError('First argument must be Array containing ArrayBuffer or Uint8Array instances.')
          }
          return SeaArray.from(arr.reduce((ret, item) => ret.concat(Array.from(item)), []))
        }
      });
      SafeBuffer.prototype.from = SafeBuffer.from;
      SafeBuffer.prototype.toString = SeaArray.prototype.toString;

      module.exports = SafeBuffer;
    })(USE, './buffer');
  USE(function(module){
      const SEA = USE('./root');
      const Buffer = USE('./buffer');
      const api = {Buffer: Buffer};
      var o = {};

      if(SEA.window){
        api.crypto = window.crypto || window.msCrypto;
        api.subtle = (api.crypto||o).subtle || (api.crypto||o).webkitSubtle;
        api.TextEncoder = window.TextEncoder;
        api.TextDecoder = window.TextDecoder;
        api.random = (len) => Buffer.from(api.crypto.getRandomValues(new Uint8Array(Buffer.alloc(len))));
      }
      if(!api.crypto){try{
        var crypto = USE('crypto', 1);
        const { TextEncoder, TextDecoder } = USE('text-encoding', 1);
        Object.assign(api, {
          crypto,
          //subtle,
          TextEncoder,
          TextDecoder,
          random: (len) => Buffer.from(crypto.randomBytes(len))
        });
        //try{
          const WebCrypto = USE('node-webcrypto-ossl', 1);
          api.ossl = api.subtle = new WebCrypto({directory: 'ossl'}).subtle; // ECDH
        //}catch(e){
          //console.log("node-webcrypto-ossl is optionally needed for ECDH, please install if needed.");
        //}
      }catch(e){
        console.log("node-webcrypto-ossl and text-encoding may not be included by default, please add it to your package.json!");
      }}

      module.exports = api;
    })(USE, './shim');
  USE(function(module){
      var SEA = USE('./root');
      var Buffer = USE('./buffer');
      var s = {};
      s.pbkdf2 = {hash: 'SHA-256', iter: 100000, ks: 64};
      s.ecdsa = {
        pair: {name: 'ECDSA', namedCurve: 'P-256'},
        sign: {name: 'ECDSA', hash: {name: 'SHA-256'}}
      };
      s.ecdh = {name: 'ECDH', namedCurve: 'P-256'};

      // This creates Web Cryptography API compliant JWK for sign/verify purposes
      s.jwk = function(pub, d){  // d === priv
        pub = pub.split('.');
        var x = pub[0], y = pub[1];
        var jwk = {kty: "EC", crv: "P-256", x: x, y: y, ext: true};
        jwk.key_ops = d ? ['sign'] : ['verify'];
        if(d){ jwk.d = d; }
        return jwk;
      };
      s.recall = {
        validity: 12 * 60 * 60, // internally in seconds : 12 hours
        hook: function(props){ return props } // { iat, exp, alias, remember } // or return new Promise((resolve, reject) => resolve(props)
      };

      s.check = function(t){ return (typeof t == 'string') && ('SEA{' === t.slice(0,4)) };
      s.parse = function p(t){ try {
        var yes = (typeof t == 'string');
        if(yes && 'SEA{' === t.slice(0,4)){ t = t.slice(3); }
        return yes ? JSON.parse(t) : t;
        } catch (e) {}
        return t;
      };

      SEA.opt = s;
      module.exports = s;
    })(USE, './settings');
  USE(function(module){
      var shim = USE('./shim');
      module.exports = async function(d, o){
        var t = (typeof d == 'string')? d : JSON.stringify(d);
        var hash = await shim.subtle.digest({name: o||'SHA-256'}, new shim.TextEncoder().encode(t));
        return shim.Buffer.from(hash);
      };
    })(USE, './sha256');
  USE(function(module){
      // This internal func returns SHA-1 hashed data for KeyID generation
      const __shim = USE('./shim');
      const subtle = __shim.subtle;
      const ossl = __shim.ossl ? __shim.ossl : subtle;
      const sha1hash = (b) => ossl.digest({name: 'SHA-1'}, new ArrayBuffer(b));
      module.exports = sha1hash;
    })(USE, './sha1');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');
      var sha = USE('./sha256');
      var u;

      SEA.work = SEA.work || (async (data, pair, cb, opt) => { try { // used to be named `proof`
        var salt = (pair||{}).epub || pair; // epub not recommended, salt should be random!
        var opt = opt || {};
        if(salt instanceof Function){
          cb = salt;
          salt = u;
        }
        salt = salt || shim.random(9);
        data = (typeof data == 'string')? data : JSON.stringify(data);
        if('sha' === (opt.name||'').toLowerCase().slice(0,3)){
          var rsha = shim.Buffer.from(await sha(data, opt.name), 'binary').toString(opt.encode || 'base64');
          if(cb){ try{ cb(rsha); }catch(e){console.log(e);} }
          return rsha;
        }
        var key = await (shim.ossl || shim.subtle).importKey('raw', new shim.TextEncoder().encode(data), {name: opt.name || 'PBKDF2'}, false, ['deriveBits']);
        var work = await (shim.ossl || shim.subtle).deriveBits({
          name: opt.name || 'PBKDF2',
          iterations: opt.iterations || S.pbkdf2.iter,
          salt: new shim.TextEncoder().encode(opt.salt || salt),
          hash: opt.hash || S.pbkdf2.hash,
        }, key, opt.length || (S.pbkdf2.ks * 8));
        data = shim.random(data.length);  // Erase data in case of passphrase
        var r = shim.Buffer.from(work, 'binary').toString(opt.encode || 'base64');
        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) { 
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      module.exports = SEA.work;
    })(USE, './work');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');

      SEA.name = SEA.name || (async (cb, opt) => { try {
        if(cb){ try{ cb(); }catch(e){console.log(e);} }
        return;
      } catch(e) {
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      //SEA.pair = async (data, proof, cb) => { try {
      SEA.pair = SEA.pair || (async (cb, opt) => { try {

        var ecdhSubtle = shim.ossl || shim.subtle;
        // First: ECDSA keys for signing/verifying...
        var sa = await shim.subtle.generateKey(S.ecdsa.pair, true, [ 'sign', 'verify' ])
        .then(async (keys) => {
          // privateKey scope doesn't leak out from here!
          //const { d: priv } = await shim.subtle.exportKey('jwk', keys.privateKey)
          var key = {};
          key.priv = (await shim.subtle.exportKey('jwk', keys.privateKey)).d;
          var pub = await shim.subtle.exportKey('jwk', keys.publicKey);
          //const pub = Buff.from([ x, y ].join(':')).toString('base64') // old
          key.pub = pub.x+'.'+pub.y; // new
          // x and y are already base64
          // pub is UTF8 but filename/URL safe (https://www.ietf.org/rfc/rfc3986.txt)
          // but split on a non-base64 letter.
          return key;
        });
        
        // To include PGPv4 kind of keyId:
        // const pubId = await SEA.keyid(keys.pub)
        // Next: ECDH keys for encryption/decryption...

        try{
        var dh = await ecdhSubtle.generateKey(S.ecdh, true, ['deriveKey'])
        .then(async (keys) => {
          // privateKey scope doesn't leak out from here!
          var key = {};
          key.epriv = (await ecdhSubtle.exportKey('jwk', keys.privateKey)).d;
          var pub = await ecdhSubtle.exportKey('jwk', keys.publicKey);
          //const epub = Buff.from([ ex, ey ].join(':')).toString('base64') // old
          key.epub = pub.x+'.'+pub.y; // new
          // ex and ey are already base64
          // epub is UTF8 but filename/URL safe (https://www.ietf.org/rfc/rfc3986.txt)
          // but split on a non-base64 letter.
          return key;
        });
        }catch(e){
          if(SEA.window){ throw e }
          if(e == 'Error: ECDH is not a supported algorithm'){ console.log('Ignoring ECDH...'); }
          else { throw e }
        } dh = dh || {};

        var r = { pub: sa.pub, priv: sa.priv, /* pubId, */ epub: dh.epub, epriv: dh.epriv };
        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) {
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      module.exports = SEA.pair;
    })(USE, './pair');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');
      var sha = USE('./sha256');
      var u;

      SEA.sign = SEA.sign || (async (data, pair, cb, opt) => { try {
        opt = opt || {};
        if(!(pair||opt).priv){
          pair = await SEA.I(null, {what: data, how: 'sign', why: opt.why});
        }
        if(u === data){ throw '`undefined` not allowed.' }
        var json = S.parse(data);
        var check = opt.check = opt.check || json;
        if(SEA.verify && (SEA.opt.check(check) || (check && check.s && check.m))
        && u !== await SEA.verify(check, pair)){ // don't sign if we already signed it.
          var r = S.parse(check);
          if(!opt.raw){ r = 'SEA'+JSON.stringify(r); }
          if(cb){ try{ cb(r); }catch(e){console.log(e);} }
          return r;
        }
        var pub = pair.pub;
        var priv = pair.priv;
        var jwk = S.jwk(pub, priv);
        var hash = await sha(json);
        var sig = await (shim.ossl || shim.subtle).importKey('jwk', jwk, S.ecdsa.pair, false, ['sign'])
        .then((key) => (shim.ossl || shim.subtle).sign(S.ecdsa.sign, key, new Uint8Array(hash))); // privateKey scope doesn't leak out from here!
        var r = {m: json, s: shim.Buffer.from(sig, 'binary').toString(opt.encode || 'base64')};
        if(!opt.raw){ r = 'SEA'+JSON.stringify(r); }

        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) {
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      module.exports = SEA.sign;
    })(USE, './sign');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');
      var sha = USE('./sha256');
      var u;

      SEA.verify = SEA.verify || (async (data, pair, cb, opt) => { try {
        var json = S.parse(data);
        if(false === pair){ // don't verify!
          var raw = S.parse(json.m);
          if(cb){ try{ cb(raw); }catch(e){console.log(e);} }
          return raw;
        }
        opt = opt || {};
        // SEA.I // verify is free! Requires no user permission.
        var pub = pair.pub || pair;
        var key = SEA.opt.slow_leak? await SEA.opt.slow_leak(pub) : await (shim.ossl || shim.subtle).importKey('jwk', jwk, S.ecdsa.pair, false, ['verify']);
        var hash = await sha(json.m);
        var buf, sig, check, tmp; try{
          buf = shim.Buffer.from(json.s, opt.encode || 'base64'); // NEW DEFAULT!
          sig = new Uint8Array(buf);
          check = await (shim.ossl || shim.subtle).verify(S.ecdsa.sign, key, sig, new Uint8Array(hash));
          if(!check){ throw "Signature did not match." }
        }catch(e){
          if(SEA.opt.fallback){
            return await SEA.opt.fall_verify(data, pair, cb, opt);
          }
        }
        var r = check? S.parse(json.m) : u;

        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) {
        console.log(e); // mismatched owner FOR MARTTI
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      module.exports = SEA.verify;
      // legacy & ossl leak mitigation:

      var knownKeys = {};
      var keyForPair = SEA.opt.slow_leak = pair => {
        if (knownKeys[pair]) return knownKeys[pair];
        var jwk = S.jwk(pair);
        knownKeys[pair] = (shim.ossl || shim.subtle).importKey("jwk", jwk, S.ecdsa.pair, false, ["verify"]);
        return knownKeys[pair];
      };


      SEA.opt.fall_verify = async function(data, pair, cb, opt, f){
        if(f === SEA.opt.fallback){ throw "Signature did not match" } f = f || 1;
        var json = S.parse(data), pub = pair.pub || pair, key = await SEA.opt.slow_leak(pub);
        var hash = (f <= SEA.opt.fallback)? shim.Buffer.from(await shim.subtle.digest({name: 'SHA-256'}, new shim.TextEncoder().encode(S.parse(json.m)))) : await sha(json.m); // this line is old bad buggy code but necessary for old compatibility.
        var buf; var sig; var check; try{
          buf = shim.Buffer.from(json.s, opt.encode || 'base64'); // NEW DEFAULT!
          sig = new Uint8Array(buf);
          check = await (shim.ossl || shim.subtle).verify(S.ecdsa.sign, key, sig, new Uint8Array(hash));
          if(!check){ throw "Signature did not match." }
        }catch(e){
          buf = shim.Buffer.from(json.s, 'utf8'); // AUTO BACKWARD OLD UTF8 DATA!
          sig = new Uint8Array(buf);
          check = await (shim.ossl || shim.subtle).verify(S.ecdsa.sign, key, sig, new Uint8Array(hash));
          if(!check){ throw "Signature did not match." }
        }
        var r = check? S.parse(json.m) : u;
        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      };
      SEA.opt.fallback = 2;

    })(USE, './verify');
  USE(function(module){
      var shim = USE('./shim');
      var sha256hash = USE('./sha256');

      const importGen = async (key, salt, opt) => {
        //const combo = shim.Buffer.concat([shim.Buffer.from(key, 'utf8'), salt || shim.random(8)]).toString('utf8') // old
        var opt = opt || {};
        const combo = key + (salt || shim.random(8)).toString('utf8'); // new
        const hash = shim.Buffer.from(await sha256hash(combo), 'binary');
        return await shim.subtle.importKey('raw', new Uint8Array(hash), opt.name || 'AES-GCM', false, ['encrypt', 'decrypt'])
      };
      module.exports = importGen;
    })(USE, './aeskey');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');
      var aeskey = USE('./aeskey');
      var u;

      SEA.encrypt = SEA.encrypt || (async (data, pair, cb, opt) => { try {
        opt = opt || {};
        var key = (pair||opt).epriv || pair;
        if(u === data){ throw '`undefined` not allowed.' }
        if(!key){
          pair = await SEA.I(null, {what: data, how: 'encrypt', why: opt.why});
          key = pair.epriv || pair;
        }
        var msg = (typeof data == 'string')? data : JSON.stringify(data);
        var rand = {s: shim.random(9), iv: shim.random(15)}; // consider making this 9 and 15 or 18 or 12 to reduce == padding.
        var ct = await aeskey(key, rand.s, opt).then((aes) => (/*shim.ossl ||*/ shim.subtle).encrypt({ // Keeping the AES key scope as private as possible...
          name: opt.name || 'AES-GCM', iv: new Uint8Array(rand.iv)
        }, aes, new shim.TextEncoder().encode(msg)));
        var r = {
          ct: shim.Buffer.from(ct, 'binary').toString(opt.encode || 'base64'),
          iv: rand.iv.toString(opt.encode || 'base64'),
          s: rand.s.toString(opt.encode || 'base64')
        };
        if(!opt.raw){ r = 'SEA'+JSON.stringify(r); }

        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) { 
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      module.exports = SEA.encrypt;
    })(USE, './encrypt');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');
      var aeskey = USE('./aeskey');

      SEA.decrypt = SEA.decrypt || (async (data, pair, cb, opt) => { try {
        opt = opt || {};
        var key = (pair||opt).epriv || pair;
        if(!key){
          pair = await SEA.I(null, {what: data, how: 'decrypt', why: opt.why});
          key = pair.epriv || pair;
        }
        var json = S.parse(data);
        var buf, bufiv, bufct; try{
          buf = shim.Buffer.from(json.s, opt.encode || 'base64');
          bufiv = shim.Buffer.from(json.iv, opt.encode || 'base64');
          bufct = shim.Buffer.from(json.ct, opt.encode || 'base64');
          var ct = await aeskey(key, buf, opt).then((aes) => (/*shim.ossl ||*/ shim.subtle).decrypt({  // Keeping aesKey scope as private as possible...
            name: opt.name || 'AES-GCM', iv: new Uint8Array(bufiv)
          }, aes, new Uint8Array(bufct)));
        }catch(e){
          if('utf8' === opt.encode){ throw "Could not decrypt" }
          if(SEA.opt.fallback){
            opt.encode = 'utf8';
            return await SEA.decrypt(data, pair, cb, opt);
          }
        }
        var r = S.parse(new shim.TextDecoder('utf8').decode(ct));
        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) { 
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      module.exports = SEA.decrypt;
    })(USE, './decrypt');
  USE(function(module){
      var SEA = USE('./root');
      var shim = USE('./shim');
      var S = USE('./settings');
      // Derive shared secret from other's pub and my epub/epriv 
      SEA.secret = SEA.secret || (async (key, pair, cb, opt) => { try {
        opt = opt || {};
        if(!pair || !pair.epriv || !pair.epub){
          pair = await SEA.I(null, {what: key, how: 'secret', why: opt.why});
        }
        var pub = key.epub || key;
        var epub = pair.epub;
        var epriv = pair.epriv;
        var ecdhSubtle = shim.ossl || shim.subtle;
        var pubKeyData = keysToEcdhJwk(pub);
        var props = Object.assign(S.ecdh, { public: await ecdhSubtle.importKey(...pubKeyData, true, []) });
        var privKeyData = keysToEcdhJwk(epub, epriv);
        var derived = await ecdhSubtle.importKey(...privKeyData, false, ['deriveKey']).then(async (privKey) => {
          // privateKey scope doesn't leak out from here!
          var derivedKey = await ecdhSubtle.deriveKey(props, privKey, { name: 'AES-GCM', length: 256 }, true, [ 'encrypt', 'decrypt' ]);
          return ecdhSubtle.exportKey('jwk', derivedKey).then(({ k }) => k);
        });
        var r = derived;
        if(cb){ try{ cb(r); }catch(e){console.log(e);} }
        return r;
      } catch(e) {
        console.log(e);
        SEA.err = e;
        if(SEA.throw){ throw e }
        if(cb){ cb(); }
        return;
      }});

      // can this be replaced with settings.jwk?
      var keysToEcdhJwk = (pub, d) => { // d === priv
        //var [ x, y ] = Buffer.from(pub, 'base64').toString('utf8').split(':') // old
        var [ x, y ] = pub.split('.'); // new
        var jwk = d ? { d: d } : {};
        return [  // Use with spread returned value...
          'jwk',
          Object.assign(
            jwk,
            { x: x, y: y, kty: 'EC', crv: 'P-256', ext: true }
          ), // ??? refactor
          S.ecdh
        ]
      };

      module.exports = SEA.secret;
    })(USE, './secret');
  USE(function(module){
      var shim = USE('./shim');
      // Practical examples about usage found from ./test/common.js
      var SEA = USE('./root');
      SEA.work = USE('./work');
      SEA.sign = USE('./sign');
      SEA.verify = USE('./verify');
      SEA.encrypt = USE('./encrypt');
      SEA.decrypt = USE('./decrypt');

      SEA.random = SEA.random || shim.random;

      // This is Buffer used in SEA and usable from Gun/SEA application also.
      // For documentation see https://nodejs.org/api/buffer.html
      SEA.Buffer = SEA.Buffer || USE('./buffer');

      // These SEA functions support now ony Promises or
      // async/await (compatible) code, use those like Promises.
      //
      // Creates a wrapper library around Web Crypto API
      // for various AES, ECDSA, PBKDF2 functions we called above.
      // Calculate public key KeyID aka PGPv4 (result: 8 bytes as hex string)
      SEA.keyid = SEA.keyid || (async (pub) => {
        try {
          // base64('base64(x):base64(y)') => Buffer(xy)
          const pb = Buffer.concat(
            pub.replace(/-/g, '+').replace(/_/g, '/').split('.')
            .map((t) => Buffer.from(t, 'base64'))
          );
          // id is PGPv4 compliant raw key
          const id = Buffer.concat([
            Buffer.from([0x99, pb.length / 0x100, pb.length % 0x100]), pb
          ]);
          const sha1 = await sha1hash(id);
          const hash = Buffer.from(sha1, 'binary');
          return hash.toString('hex', hash.length - 8)  // 16-bit ID as hex
        } catch (e) {
          console.log(e);
          throw e
        }
      });
      // all done!
      // Obviously it is missing MANY necessary features. This is only an alpha release.
      // Please experiment with it, audit what I've done so far, and complain about what needs to be added.
      // SEA should be a full suite that is easy and seamless to use.
      // Again, scroll naer the top, where I provide an EXAMPLE of how to create a user and sign in.
      // Once logged in, the rest of the code you just read handled automatically signing/validating data.
      // But all other behavior needs to be equally easy, like opinionated ways of
      // Adding friends (trusted public keys), sending private messages, etc.
      // Cheers! Tell me what you think.
      var Gun = (SEA.window||{}).Gun || USE('./gun', 1);
      Gun.SEA = SEA;
      SEA.GUN = SEA.Gun = Gun;

      module.exports = SEA;
    })(USE, './sea');
  USE(function(module){
      var Gun = USE('./sea').Gun;
      Gun.chain.then = function(cb){
        var gun = this, p = (new Promise(function(res, rej){
          gun.once(res);
        }));
        return cb? p.then(cb) : p;
      };
    })(USE, './then');
  USE(function(module){
      var SEA = USE('./sea');
      var Gun = SEA.Gun;
      var then = USE('./then');

      function User(root){ 
        this._ = {$: this};
      }
      User.prototype = (function(){ function F(){} F.prototype = Gun.chain; return new F() }()); // Object.create polyfill
      User.prototype.constructor = User;

      // let's extend the gun chain with a `user` function.
      // only one user can be logged in at a time, per gun instance.
      Gun.chain.user = function(pub){
        var gun = this, root = gun.back(-1), user;
        if(pub){ return root.get('~'+pub) }
        if(user = root.back('user')){ return user }
        var root = (root._), at = root, uuid = at.opt.uuid || Gun.state.lex;
        (at = (user = at.user = gun.chain(new User))._).opt = {};
        at.opt.uuid = function(cb){
          var id = uuid(), pub = root.user;
          if(!pub || !(pub = pub.is) || !(pub = pub.pub)){ return id }
          id = id + '~' + pub + '.';
          if(cb && cb.call){ cb(null, id); }
          return id;
        };
        return user;
      };
      Gun.User = User;
      module.exports = User;
    })(USE, './user');
  USE(function(module){
      // TODO: This needs to be split into all separate functions.
      // Not just everything thrown into 'create'.

      var SEA = USE('./sea');
      var User = USE('./user');
      var authsettings = USE('./settings');
      var Gun = SEA.Gun;

      var noop = function(){};

      // Well first we have to actually create a user. That is what this function does.
      User.prototype.create = function(alias, pass, cb, opt){
        var gun = this, cat = (gun._), root = gun.back(-1);
        cb = cb || noop;
        if(cat.ing){
          cb({err: Gun.log("User is already being created or authenticated!"), wait: true});
          return gun;
        }
        cat.ing = true;
        opt = opt || {};
        var act = {};
        act.a = function(pubs){
          act.pubs = pubs;
          if(pubs && !opt.already){
            // If we can enforce that a user name is already taken, it might be nice to try, but this is not guaranteed.
            var ack = {err: Gun.log('User already created!')};
            cat.ing = false;
            cb(ack);
            gun.leave();
            return;
          }
          act.salt = Gun.text.random(64); // pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it.
          SEA.work(pass, act.salt, act.b); // this will take some short amount of time to produce a proof, which slows brute force attacks.
        };
        act.b = function(proof){
          act.proof = proof;
          SEA.pair(act.c); // now we have generated a brand new ECDSA key pair for the user account.
        };
        act.c = function(pair){ var tmp;
          act.pair = pair || {};
          if(tmp = cat.root.user){
            tmp._.sea = pair;
            tmp.is = {pub: pair.pub, epub: pair.epub, alias: alias};
          }
          // the user's public key doesn't need to be signed. But everything else needs to be signed with it! // we have now automated it! clean up these extra steps now!
          act.data = {pub: pair.pub};
          act.d();
        };
        act.d = function(){
          act.data.alias = alias;
          act.e();
        };
        act.e = function(){
          act.data.epub = act.pair.epub; 
          SEA.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, act.proof, act.f, {raw:1}); // to keep the private key safe, we AES encrypt it with the proof of work!
        };
        act.f = function(auth){
          act.data.auth = JSON.stringify({ek: auth, s: act.salt}); 
          act.g(act.data.auth);
        };
        act.g = function(auth){ var tmp;
          act.data.auth = act.data.auth || auth;
          root.get(tmp = '~'+act.pair.pub).put(act.data); // awesome, now we can actually save the user with their public key as their ID.
          root.get('~@'+alias).put(Gun.obj.put({}, tmp, Gun.val.link.ify(tmp))); // next up, we want to associate the alias with the public key. So we add it to the alias list.
          setTimeout(function(){ // we should be able to delete this now, right?
          cat.ing = false;
          cb({ok: 0, pub: act.pair.pub}); // callback that the user has been created. (Note: ok = 0 because we didn't wait for disk to ack)
          if(noop === cb){ gun.auth(alias, pass); } // if no callback is passed, auto-login after signing up.
          },10);
        };
        root.get('~@'+alias).once(act.a);
        return gun;
      };
      // now that we have created a user, we want to authenticate them!
      User.prototype.auth = function(alias, pass, cb, opt){
        var gun = this, cat = (gun._), root = gun.back(-1);
        cb = cb || function(){};
        if(cat.ing){
          cb({err: Gun.log("User is already being created or authenticated!"), wait: true});
          return gun;
        }
        cat.ing = true;
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
          if(act.name){ return act.f(data) }
          act.c((act.data = data).auth);
        };
        act.b = function(list){
          var get = (act.list = (act.list||[]).concat(list||[])).shift();
          if(u === get){
            if(act.name){ return act.err('Your user account is not published for dApps to access, please consider syncing it online, or allowing local access by adding your device as a peer.') }
            return act.err('Wrong user or password.') 
          }
          root.get(get).once(act.a);
        };
        act.c = function(auth){
          if(u === auth){ return act.b() }
          if(Gun.text.is(auth)){ return act.c(Gun.obj.ify(auth)) } // in case of legacy
          SEA.work(pass, (act.auth = auth).s, act.d, act.enc); // the proof of work is evidence that we've spent some time/effort trying to log in, this slows brute force.
        };
        act.d = function(proof){
          SEA.decrypt(act.auth.ek, proof, act.e, act.enc);
        };
        act.e = function(half){
          if(u === half){
            if(!act.enc){ // try old format
              act.enc = {encode: 'utf8'};
              return act.c(act.auth);
            } act.enc = null; // end backwards
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
          var user = (root._).user, at = (user._);
          var tmp = at.tag;
          var upt = at.opt;
          at = user._ = root.get('~'+pair.pub)._;
          at.opt = upt;
          // add our credentials in-memory only to our root user instance
          user.is = {pub: pair.pub, epub: pair.epub, alias: alias};
          at.sea = act.pair;
          cat.ing = false;
          try{if(pass && !Gun.obj.has(Gun.obj.ify(cat.root.graph['~'+pair.pub].auth), ':')){ opt.shuffle = opt.change = pass; } }catch(e){} // migrate UTF8 & Shuffle!
          opt.change? act.z() : cb(at);
          if(SEA.window && ((gun.back('user')._).opt||opt).remember){
            // TODO: this needs to be modular.
            try{var sS = {};
            sS = window.sessionStorage;
            sS.recall = true;
            sS.alias = alias;
            sS.tmp = pass;
            }catch(e){}
          }
          try{
            (root._).on('auth', at); // TODO: Deprecate this, emit on user instead! Update docs when you do.
            //at.on('auth', at) // Arrgh, this doesn't work without event "merge" code, but "merge" code causes stack overflow and crashes after logging in & trying to write data.
          }catch(e){
            Gun.log("Your 'auth' callback crashed with:", e);
          }
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
          if(opt.shuffle){ // delete in future!
            console.log('migrate core account from UTF8 & shuffle');
            var tmp = Gun.obj.to(act.data);
            Gun.obj.del(tmp, '_');
            tmp.auth = auth;
            root.get('~'+act.pair.pub).put(tmp);
          } // end delete
          root.get('~'+act.pair.pub).get('auth').put(auth, cb);
        };
        act.err = function(e){
          var ack = {err: Gun.log(e || 'User cannot be found!')};
          cat.ing = false;
          cb(ack);
        };
        act.plugin = function(name){
          if(!(act.name = name)){ return act.err() }
          var tmp = [name];
          if('~' !== name[0]){
            tmp[1] = '~'+name;
            tmp[2] = '~@'+name;
          }
          act.b(tmp);
        };
        if(pair){
          act.g(pair);
        } else
        if(alias){
          root.get('~@'+alias).once(act.a);
        } else
        if(!alias && !pass){
          SEA.name(act.plugin);
        }
        return gun;
      };
      User.prototype.pair = function(){
        console.log("user.pair() IS DEPRECATED AND WILL BE DELETED!!!");
        var user = this;
        if(!user.is){ return false }
        return user._.sea;
      };
      User.prototype.leave = function(opt, cb){
        var gun = this, user = (gun.back(-1)._).user;
        if(user){
          delete user.is;
          delete user._.is;
          delete user._.sea;
        }
        if(SEA.window){
          try{var sS = {};
          sS = window.sessionStorage;
          delete sS.alias;
          delete sS.tmp;
          delete sS.recall;
          }catch(e){}      }
        return gun;
      };
      // If authenticated user wants to delete his/her account, let's support it!
      User.prototype.delete = async function(alias, pass, cb){
        var gun = this, root = gun.back(-1), user = gun.back('user');
        try {
          user.auth(alias, pass, function(ack){
            var pub = (user.is||{}).pub;
            // Delete user data
            user.map().once(function(){ this.put(null); });
            // Wipe user data from memory
            user.leave();
            (cb || noop)({ok: 0});
          });
        } catch (e) {
          Gun.log('User.delete failed! Error:', e);
        }
        return gun;
      };
      User.prototype.recall = function(opt, cb){
        var gun = this, root = gun.back(-1);
        opt = opt || {};
        if(opt && opt.sessionStorage){
          if(SEA.window){
            try{var sS = {};
            sS = window.sessionStorage;
            if(sS){
              (root._).opt.remember = true;
              ((gun.back('user')._).opt||opt).remember = true;
              if(sS.recall || (sS.alias && sS.tmp)){
                root.user().auth(sS.alias, sS.tmp, cb);
              }
            }
            }catch(e){}
          }
          return gun;
        }
        /*
          TODO: copy mhelander's expiry code back in.
          Although, we should check with community,
          should expiry be core or a plugin?
        */
        return gun;
      };
      User.prototype.alive = async function(){
        const gunRoot = this.back(-1);
        try {
          // All is good. Should we do something more with actual recalled data?
          await authRecall(gunRoot);
          return gunRoot._.user._
        } catch (e) {
          const err = 'No session!';
          Gun.log(err);
          throw { err }
        }
      };
      User.prototype.trust = async function(user){
        // TODO: BUG!!! SEA `node` read listener needs to be async, which means core needs to be async too.
        //gun.get('alice').get('age').trust(bob);
        if (Gun.is(user)) {
          user.get('pub').get((ctx, ev) => {
            console.log(ctx, ev);
          });
        }
      };
      User.prototype.grant = function(to, cb){
        console.log("`.grant` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!");
        var gun = this, user = gun.back(-1).user(), pair = user.pair(), path = '';
        gun.back(function(at){ if(at.is){ return } path += (at.get||''); });
        (async function(){
        var enc, sec = await user.get('trust').get(pair.pub).get(path).then();
        sec = await SEA.decrypt(sec, pair);
        if(!sec){
          sec = SEA.random(16).toString();
          enc = await SEA.encrypt(sec, pair);
          user.get('trust').get(pair.pub).get(path).put(enc);
        }
        var pub = to.get('pub').then();
        var epub = to.get('epub').then();
        pub = await pub; epub = await epub;
        var dh = await SEA.secret(epub, pair);
        enc = await SEA.encrypt(sec, dh);
        user.get('trust').get(pub).get(path).put(enc, cb);
        }());
        return gun;
      };
      User.prototype.secret = function(data, cb){
        console.log("`.secret` API MAY BE DELETED OR CHANGED OR RENAMED, DO NOT USE!");
        var gun = this, user = gun.back(-1).user(), pair = user.pair(), path = '';
        gun.back(function(at){ if(at.is){ return } path += (at.get||''); });
        (async function(){
        var enc, sec = await user.get('trust').get(pair.pub).get(path).then();
        sec = await SEA.decrypt(sec, pair);
        if(!sec){
          sec = SEA.random(16).toString();
          enc = await SEA.encrypt(sec, pair);
          user.get('trust').get(pair.pub).get(path).put(enc);
        }
        enc = await SEA.encrypt(data, sec);
        gun.put(enc, cb);
        }());
        return gun;
      };
      module.exports = User;
    })(USE, './create');
  USE(function(module){
      const SEA = USE('./sea');
      const Gun = SEA.Gun;
      // After we have a GUN extension to make user registration/login easy, we then need to handle everything else.

      // We do this with a GUN adapter, we first listen to when a gun instance is created (and when its options change)
      Gun.on('opt', function(at){
        if(!at.sea){ // only add SEA once per instance, on the "at" context.
          at.sea = {own: {}};
          at.on('in', security, at); // now listen to all input data, acting as a firewall.
          at.on('out', signature, at); // and output listeners, to encrypt outgoing data.
          at.on('node', each, at);
        }
        this.to.next(at); // make sure to call the "next" middleware adapter.
      });

      // Alright, this next adapter gets run at the per node level in the graph database.
      // This will let us verify that every property on a node has a value signed by a public key we trust.
      // If the signature does not match, the data is just `undefined` so it doesn't get passed on.
      // If it does match, then we transform the in-memory "view" of the data into its plain value (without the signature).
      // Now NOTE! Some data is "system" data, not user data. Example: List of public keys, aliases, etc.
      // This data is self-enforced (the value can only match its ID), but that is handled in the `security` function.
      // From the self-enforced data, we can see all the edges in the graph that belong to a public key.
      // Example: ~ASDF is the ID of a node with ASDF as its public key, signed alias and salt, and
      // its encrypted private key, but it might also have other signed values on it like `profile = <ID>` edge.
      // Using that directed edge's ID, we can then track (in memory) which IDs belong to which keys.
      // Here is a problem: Multiple public keys can "claim" any node's ID, so this is dangerous!
      // This means we should ONLY trust our "friends" (our key ring) public keys, not any ones.
      // I have not yet added that to SEA yet in this alpha release. That is coming soon, but beware in the meanwhile!
      function each(msg){ // TODO: Warning: Need to switch to `gun.on('node')`! Do not use `Gun.on('node'` in your apps!
        // NOTE: THE SECURITY FUNCTION HAS ALREADY VERIFIED THE DATA!!!
        // WE DO NOT NEED TO RE-VERIFY AGAIN, JUST TRANSFORM IT TO PLAINTEXT.
        var to = this.to, vertex = (msg.$._).put, c = 0, d;
        Gun.node.is(msg.put, function(val, key, node){
          // only process if SEA formatted?
          var tmp = Gun.obj.ify(val) || noop;
          if(u !== tmp[':']){
            node[key] = SEA.opt.unpack(tmp);
            return;
          }
          if(!SEA.opt.check(val)){ return }
          c++; // for each property on the node
          SEA.verify(val, false, function(data){ c--; // false just extracts the plain data.
            node[key] = SEA.opt.unpack(data, key, node);          if(d && !c && (c = -1)){ to.next(msg); }
          });
        });
        if((d = true) && !c){ to.next(msg); }
      }

      // signature handles data output, it is a proxy to the security function.
      function signature(msg){
        if((msg._||noop).user){
          return this.to.next(msg);
        }
        var ctx = this.as;
        (msg._||(msg._=function(){})).user = ctx.user;
        security.call(this, msg);
      }

      // okay! The security function handles all the heavy lifting.
      // It needs to deal read and write of input and output of system data, account/public key data, and regular data.
      // This is broken down into some pretty clear edge cases, let's go over them:
      function security(msg){
        var at = this.as, sea = at.sea, to = this.to;
        if(msg.get){
          // if there is a request to read data from us, then...
          var soul = msg.get['#'];
          if(soul){ // for now, only allow direct IDs to be read.
            if(typeof soul !== 'string'){ return to.next(msg) } // do not handle lexical cursors.
            if('alias' === soul){ // Allow reading the list of usernames/aliases in the system?
              return to.next(msg); // yes.
            } else
            if('~@' === soul.slice(0,2)){ // Allow reading the list of public keys associated with an alias?
              return to.next(msg); // yes.
            } else { // Allow reading everything?
              return to.next(msg); // yes // TODO: No! Make this a callback/event that people can filter on.
            }
          }
        }
        if(msg.put){
          // potentially parallel async operations!!!
          var check = {}, each = {}, u;
          each.node = function(node, soul){
            if(Gun.obj.empty(node, '_')){ return check['node'+soul] = 0 } // ignore empty updates, don't reject them.
            Gun.obj.map(node, each.way, {soul: soul, node: node});
          };
          each.way = function(val, key){
            var soul = this.soul, node = this.node, tmp;
            if('_' === key){ return } // ignore meta data
            if('~@' === soul){  // special case for shared system data, the list of aliases.
              each.alias(val, key, node, soul); return;
            }
            if('~@' === soul.slice(0,2)){ // special case for shared system data, the list of public keys for an alias.
              each.pubs(val, key, node, soul); return;
            }
            if('~' === soul.slice(0,1) && 2 === (tmp = soul.slice(1)).split('.').length){ // special case, account data for a public key.
              each.pub(val, key, node, soul, tmp, (msg._||noop).user); return;
            }
            each.any(val, key, node, soul, (msg._||noop).user); return;
            return each.end({err: "No other data allowed!"});
          };
          each.alias = function(val, key, node, soul){ // Example: {_:#~@, ~@alice: {#~@alice}}
            if(!val){ return each.end({err: "Data must exist!"}) } // data MUST exist
            if('~@'+key === Gun.val.link.is(val)){ return check['alias'+key] = 0 } // in fact, it must be EXACTLY equal to itself
            each.end({err: "Mismatching alias."}); // if it isn't, reject.
          };
          each.pubs = function(val, key, node, soul){ // Example: {_:#~@alice, ~asdf: {#~asdf}}
            if(!val){ return each.end({err: "Alias must exist!"}) } // data MUST exist
            if(key === Gun.val.link.is(val)){ return check['pubs'+soul+key] = 0 } // and the ID must be EXACTLY equal to its property
            each.end({err: "Alias must match!"}); // that way nobody can tamper with the list of public keys.
          };
          each.pub = function(val, key, node, soul, pub, user){ var tmp; // Example: {_:#~asdf, hello:'world'~fdsa}}
            if('pub' === key){
              if(val === pub){ return (check['pub'+soul+key] = 0) } // the account MUST match `pub` property that equals the ID of the public key.
              return each.end({err: "Account must match!"});
            }
            check['user'+soul+key] = 1;
            if(Gun.is(msg.$) && user && user.is && pub === user.is.pub){
              SEA.sign(SEA.opt.prep(tmp = SEA.opt.parse(val), key, node, soul), (user._).sea, function(data){ var rel;
                if(u === data){ return each.end({err: SEA.err || 'Pub signature fail.'}) }
                if(rel = Gun.val.link.is(val)){
                  (at.sea.own[rel] = at.sea.own[rel] || {})[pub] = true;
                }
                node[key] = JSON.stringify({':': SEA.opt.unpack(data.m), '~': data.s});
                check['user'+soul+key] = 0;
                each.end({ok: 1});
              }, {check: SEA.opt.pack(tmp, key, node, soul), raw: 1});
              return;
            }
            SEA.verify(SEA.opt.pack(val,key,node,soul), pub, function(data){ var rel;
              data = SEA.opt.unpack(data, key, node);
              if(u === data){ // make sure the signature matches the account it claims to be on.
                return each.end({err: "Unverified data."}); // reject any updates that are signed with a mismatched account.
              }
              if((rel = Gun.val.link.is(data)) && pub === SEA.opt.pub(rel)){
                (at.sea.own[rel] = at.sea.own[rel] || {})[pub] = true;
              }
              check['user'+soul+key] = 0;
              each.end({ok: 1});
            });
          };
          each.any = function(val, key, node, soul, user){ var tmp, pub;
            if(!(pub = SEA.opt.pub(soul))){
              if(at.opt.secure){
                each.end({err: "Soul is missing public key at '" + key + "'."});
                return;
              }
              // TODO: Ask community if should auto-sign non user-graph data.
              check['any'+soul+key] = 1;
              at.on('secure', function(msg){ this.off();
                check['any'+soul+key] = 0;
                if(at.opt.secure){ msg = null; }
                each.end(msg || {err: "Data cannot be modified."});
              }).on.on('secure', msg);
              //each.end({err: "Data cannot be modified."});
              return;
            }
            if(Gun.is(msg.$) && user && user.is && pub === user.is.pub){
              /*var other = Gun.obj.map(at.sea.own[soul], function(v, p){
                if((user.is||{}).pub !== p){ return p }
              });
              if(other){
                each.any(val, key, node, soul);
                return;
              }*/
              check['any'+soul+key] = 1;
              SEA.sign(SEA.opt.prep(tmp = SEA.opt.parse(val), key, node, soul), (user._).sea, function(data){
                if(u === data){ return each.end({err: 'My signature fail.'}) }
                node[key] = JSON.stringify({':': SEA.opt.unpack(data.m), '~': data.s});
                check['any'+soul+key] = 0;
                each.end({ok: 1});
              }, {check: SEA.opt.pack(tmp, key, node, soul), raw: 1});
              return;
            }
            check['any'+soul+key] = 1;
            SEA.verify(SEA.opt.pack(val,key,node,soul), pub, function(data){ var rel;
              data = SEA.opt.unpack(data, key, node);
              if(u === data){ return each.end({err: "Mismatched owner on '" + key + "'."}) } // thanks @rogowski !
              if((rel = Gun.val.link.is(data)) && pub === SEA.opt.pub(rel)){
                (at.sea.own[rel] = at.sea.own[rel] || {})[pub] = true;
              }
              check['any'+soul+key] = 0;
              each.end({ok: 1});
            });
          };
          each.end = function(ctx){ // TODO: Can't you just switch this to each.end = cb?
            if(each.err){ return }
            if((each.err = ctx.err) || ctx.no){
              console.log('NO!', each.err, msg.put); // 451 mistmached data FOR MARTTI
              return;
            }
            if(!each.end.ed){ return }
            if(Gun.obj.map(check, function(no){
              if(no){ return true }
            })){ return }
            (msg._||{}).user = at.user || security; // already been through firewall, does not need to again on out.
            to.next(msg);
          };
          Gun.obj.map(msg.put, each.node);
          each.end({end: each.end.ed = true});
          return; // need to manually call next after async.
        }
        to.next(msg); // pass forward any data we do not know how to handle or process (this allows custom security protocols).
      }
      SEA.opt.pub = function(s){
        if(!s){ return }
        s = s.split('~');
        if(!s || !(s = s[1])){ return }
        s = s.split('.');
        if(!s || 2 > s.length){ return }
        s = s.slice(0,2).join('.');
        return s;
      };
      SEA.opt.prep = function(d,k, n,s){ // prep for signing
        return {'#':s,'.':k,':':SEA.opt.parse(d),'>':Gun.state.is(n, k)};
      };
      SEA.opt.pack = function(d,k, n,s){ // pack for verifying
        if(SEA.opt.check(d)){ return d }
        var meta = (Gun.obj.ify(d)||noop), sig = meta['~'];
        return sig? {m: {'#':s,'.':k,':':meta[':'],'>':Gun.state.is(n, k)}, s: sig} : d;
      };
      SEA.opt.unpack = function(d, k, n){ var tmp;
        if(u === d){ return }
        if(d && (u !== (tmp = d[':']))){ return tmp }
        if(!k || !n){ return }
        if(d === n[k]){ return d }
        if(!SEA.opt.check(n[k])){ return d }
        var soul = Gun.node.soul(n), s = Gun.state.is(n, k);
        if(d && 4 === d.length && soul === d[0] && k === d[1] && fl(s) === fl(d[3])){
          return d[2];
        }
        if(s < SEA.opt.shuffle_attack){
          return d;
        }
      };
      SEA.opt.shuffle_attack = 1546329600000; // Jan 1, 2019
      var noop = function(){}, u;
      var fl = Math.floor; // TODO: Still need to fix inconsistent state issue.
      var rel_is = Gun.val.rel.is;
      // TODO: Potential bug? If pub/priv key starts with `-`? IDK how possible.

    })(USE, './index');
  }());
  });

  // This was written by the wonderful Forrest Tait
  // modified by Mark to be part of core for convenience
  // twas not designed for production use
  // only simple local development.



  gun$1.on('create', function(root){
  	this.to.next(root);
  	var opt = root.opt;
  	if(true !== opt.localStorage){ return }
  	if(false === opt.localStorage){ return }
  	//if(process.env.RAD_ENV){ return }
  	//if(process.env.AWS_S3_BUCKET){ return }
  	opt.file = String(opt.file || 'data.json');
  	var graph = root.graph, acks = {}, count = 0, to;
  	var disk = gun$1.obj.ify((require$$2.existsSync || require$$3.existsSync)(opt.file)? 
  		require$$2.readFileSync(opt.file).toString()
  	: null) || {};

  	gun$1.log.once(
  		'file-warning',
  		'WARNING! This `file.js` module for gun is ' +
  		'intended for local development testing only!'
  	);
  	
  	root.on('put', function(at){
  		this.to.next(at);
  		gun$1.graph.is(at.put, null, map);
  		if(!at['@']){ acks[at['#']] = true; } // only ack non-acks.
  		count += 1;
  		if(count >= (opt.batch || 10000)){
  			return flush();
  		}
  		if(to){ return }
  		to = setTimeout(flush, opt.wait || 1);
  	});

  	root.on('get', function(at){
  		this.to.next(at);
  		var lex = at.get, soul, data, u;
  		//setTimeout(function(){
  		if(!lex || !(soul = lex['#'])){ return }
  		//if(0 >= at.cap){ return }
  		if(gun$1.obj.is(soul)){ return match(at) }
  		var field = lex['.'];
  		data = disk[soul] || u;
  		if(data && field){
  			data = gun$1.state.to(data, field);
  		}
  		root.on('in', {'@': at['#'], put: gun$1.graph.node(data)});
  		//},11);
  	});

  	var map = function(val, key, node, soul){
  		disk[soul] = gun$1.state.to(node, key, disk[soul]);
  	};

  	var wait, u;
  	var flush = function(){
  		if(wait){ return }
  		clearTimeout(to);
  		to = false;
  		var ack = acks;
  		acks = {};
  		require$$2.writeFile(opt.file, JSON.stringify(disk), function(err, ok){
  			wait = false;
  			var tmp = count;
  			count = 0;
  			gun$1.obj.map(ack, function(yes, id){
  				root.on('in', {
  					'@': id,
  					err: err,
  					ok: err? u : 1
  				});
  			});
  			if(1 < tmp){ flush(); }
  		});
  	};

  	function match(at){
  		var rgx = at.get['#'], has = at.get['.'];
  		gun$1.obj.map(disk, function(node, soul, put){
  			if(!gun$1.text.match(soul, rgx)){ return }
  			if(has){ node = gun$1.state.to(node, has); }
  			(put = {})[soul] = node;
  			root.on('in', {put: put, '@': at['#']});
  		});
  	}
  });

  (function(){
  	var Gun = (typeof window !== "undefined")? window.Gun : gun$1;
  	var ev = {}, empty = {};
  	Gun.on('opt', function(root){
  		this.to.next(root);
  		if(root.once){ return }
  		if(typeof process == 'undefined'){ return }
  		var util = process.memoryUsage;
  		if(!util){ return }
  		
  		ev.max = parseFloat(root.opt.memory || process.env.WEB_MEMORY || 1399) * 0.8; // max_old_space_size defaults to 1400 MB. Note: old space !== memory space though.
  		
  		setInterval(check, 1000);
  		function check(){
  			var used = ev.used = util().rss / 1024 / 1024;
  			if(used < ev.max){ return }
  			setTimeout(GC, 1);
  		}
  		function GC(){
  			var souls = Object.keys(root.graph||empty);
  			var toss = Math.ceil(souls.length * 0.01);
  			//var start = Gun.state(), i = toss;
  			Gun.list.map(souls, function(soul){
  				if(--toss < 0){ return }
  				root.gun.get(soul).off();
  			});
  			//console.log("evicted", i, 'nodes in', ((Gun.state() - start)/1000).toFixed(2), 'sec.');
  		}
  		/*
  		root.on('in', function(msg){
  			this.to.next(msg);
  			if(msg.get){
  				return;
  			}
  			Gun.graph.is(msg, function(node, soul){
  				var meta = (root.next||empty)[soul];
  				if(!meta){ return }
  				Gun.node.is(node, function(data, key){

  				});
  			});
  		});
  		*/
  	});
  }());

  var Gun$2 = (typeof window !== "undefined")? window.Gun : gun$1;

  Gun$2.on('create', function(root){
  	this.to.next(root);
  	var opt = root.opt;
    if(false === opt.multicast){ return }
  	if(true !== opt.multicast){ return } // disable multicast by default for now.

    var udp = opt.multicast = opt.multicast || {};
    udp.address = udp.address || '233.255.255.255';
    udp.pack = udp.pack || 50000; // UDP messages limited to 65KB.
    udp.port  = udp.port || 23456;

    var noop = function(){}, port;

    var dgram = require$$2;
    var socket = dgram.createSocket({type: "udp4", reuseAddr: true});
    socket.bind(udp.port);

    socket.on("listening", function() {
      socket.addMembership(udp.address);
      udp.peer = {url: udp.address + ':' + udp.port, wire: socket};

      udp.peer.say = function(raw){
        var buf = Buffer.from(raw, 'utf8');
        if(udp.pack <= buf.length){ // message too big!!!
          return;
        }
        socket.send(buf, 0, buf.length, udp.port, udp.address, noop);
      };
      opt.mesh.hi(udp.peer);

      console.log('multicasting on', udp.peer.url);
      return; // below code only needed for when WebSocket connections desired!
      setInterval(function broadcast(){
        port = port || (opt.web && opt.web.address()||{}).port;
        if(!port){ return }
        udp.peer.say(JSON.stringify({id: opt.pid || (opt.pid = Math.random().toString(36).slice(2)), port: port}));
      }, 1000);
    });

    socket.on("message", function(raw, info) { try {
      if(!raw){ return }
      raw = raw.toString('utf8');
      opt.mesh.hear(raw, udp.peer);

      return; // below code only needed for when WebSocket connections desired!
      var message;
      message = JSON.parse(raw.toString('utf8'));

      if(opt.pid === message.id){ return } // ignore self

      var url = 'http://' + info.address + ':' + (port || (opt.web && opt.web.address()||{}).port) + '/gun';
      if(root.opt.peers[url]){ return }
    
      console.log('discovered', url, message, info);
      root.$.opt(url);

    } catch(e){
      console.log('multicast error', e, raw);
      return;
    } });

  });

  var __dirname$1 = '/home/dev/snapgraph/node_modules/gun/lib';

  /*
  The MIT License (MIT)

  Copyright (c) 2016 CoderPuppy

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

  */
  var _endianness;
  function endianness() {
    if (typeof _endianness === 'undefined') {
      var a = new ArrayBuffer(2);
      var b = new Uint8Array(a);
      var c = new Uint16Array(a);
      b[0] = 1;
      b[1] = 2;
      if (c[0] === 258) {
        _endianness = 'BE';
      } else if (c[0] === 513){
        _endianness = 'LE';
      } else {
        throw new Error('unable to figure out endianess');
      }
    }
    return _endianness;
  }

  function hostname() {
    if (typeof global$1.location !== 'undefined') {
      return global$1.location.hostname
    } else return '';
  }

  function loadavg() {
    return [];
  }

  function uptime$1() {
    return 0;
  }

  function freemem() {
    return Number.MAX_VALUE;
  }

  function totalmem() {
    return Number.MAX_VALUE;
  }

  function cpus() {
    return [];
  }

  function type() {
    return 'Browser';
  }

  function release$1 () {
    if (typeof global$1.navigator !== 'undefined') {
      return global$1.navigator.appVersion;
    }
    return '';
  }

  function networkInterfaces(){}
  function getNetworkInterfaces(){}

  function tmpDir() {
    return '/tmp';
  }
  var tmpdir = tmpDir;

  var EOL = '\n';
  var require$$1 = {
    EOL: EOL,
    tmpdir: tmpdir,
    tmpDir: tmpDir,
    networkInterfaces:networkInterfaces,
    getNetworkInterfaces: getNetworkInterfaces,
    release: release$1,
    type: type,
    cpus: cpus,
    totalmem: totalmem,
    freemem: freemem,
    uptime: uptime$1,
    loadavg: loadavg,
    hostname: hostname,
    endianness: endianness,
  };

  var Gun$3 = (typeof window !== "undefined")? window.Gun : gun$1;

  Gun$3.on('opt', function(root){
  	this.to.next(root);
  	if(root.once){ return }
  	if(typeof process === 'undefined'){ return }
  	if(typeof commonjsRequire === 'undefined'){ return }
  	var noop = function(){};
  	var os = require$$1 || {};
  	var fs = require$$2 || {};
  	fs.existsSync = fs.existsSync || require$$3.existsSync;
  	if(!fs.existsSync){ return }
  	if(!process){ return }
  	process.uptime = process.uptime || noop;
  	process.cpuUsage = process.cpuUsage || noop;
  	process.memoryUsage = process.memoryUsage || noop;
  	os.totalmem = os.totalmem || noop;
  	os.freemem = os.freemem || noop;
  	os.loadavg = os.loadavg || noop;
  	os.cpus = os.cpus || noop;
  	setTimeout(function(){
  		root.stats = Gun$3.obj.ify((fs.existsSync(__dirname$1+'/../stats.'+root.opt.file) && fs.readFileSync(__dirname$1+'/../stats.'+root.opt.file).toString())) || {};
  		root.stats.up = root.stats.up || {};
  		root.stats.up.start = root.stats.up.start || +(new Date);
  		root.stats.up.count = (root.stats.up.count || 0) + 1;
  	},1);
  	setInterval(function(){
  		if(!root.stats){ root.stats = {}; }
  		var stats = root.stats;
  		(stats.up||{}).time = process.uptime();
  		stats.memory = process.memoryUsage() || {};
  		stats.memory.totalmem = os.totalmem();
  		stats.memory.freemem = os.freemem();
  		stats.cpu = process.cpuUsage() || {};
  		stats.cpu.loadavg = os.loadavg();
  		stats.peers = {};
  		stats.peers.count = Object.keys(root.opt.peers||{}).length;
  		stats.node = {};
  		stats.node.count = Object.keys(root.graph||{}).length;
  		fs.writeFile(__dirname$1+'/../stats.'+root.opt.file, JSON.stringify(stats, null, 2), function(err){});
  	}, 1000 * 15);
  	Object.keys = Object.keys || function(o){ return Gun$3.obj.map(o, function(v,k,t){t(k);}) };
  });

  (function(){
  	{ return }

  	var db = {length: 0, hash: {}};

  	console.log("start :)");
  	commonjsGlobal.DEBUG = 1;
  	setInterval(function(){
  		var print = '', tmp;
  		var mem = process.memoryUsage();
  		var used = mem.rss / 1024 / 1024;
  		used = used.toFixed(1);
  		print += used +' MB rss. ';
  		var used = mem.heapTotal / 1024 / 1024;
  		used = used.toFixed(1);
  		print += used +' MB hT. ';
  		var used = mem.heapUsed / 1024 / 1024;
  		used = used.toFixed(1);
  		print += used +' MB hU. ';
  		if(db.root){
  			db.concurrency = Object.keys(db.peers||{}).length;
  			print += db.concurrency +' peers. ';
  			db.nodes = Object.keys(db.root.graph||{}).length;
  			print += db.nodes + ' nodes. ';
  			if(db.count){ print += db.count + ' msgs. ';}
  			if(tmp = db.root.msgsLength){
  				tmp = (tmp / 1024 / 1024).toFixed(2);
  				print += tmp + ' length MB. ';
  			}
  			if(db.last){ print += '\n' + JSON.stringify(db.last, null, 2); }
  			if(db.hash){ 
  				print += '\nSome 100 Fast Hash Counts: \n' + JSON.stringify(db.hash, null, 2);
  				var l = Object.keys(db.hash), i = l.length;
  				if(i > 100){
  					i = i - 100;
  					Gun.list.map(l, function(k){
  						if(--i <= 0){ return }
  						delete db.hash[k];
  					});
  				}
  			}

  		}
  		db.print = print;
  		print = print.split('\n')[0];
  		console.log(print);
  	}, 2500);

  	var Gun = gun$1;
  	Gun.on('opt', function(root){
  		this.to.next(root);
  		if(root.once){ return }
  		console.log(">>>>>>>>>", root);
  		root.debug = db;
  		db.root = root;
  		db.peers = root.opt.peers;

  		db.count = 0;
  		root.on('in', function(msg){
  			this.to.next(msg);
  			if(!msg.NTS){ db.last = msg; }
  			db.count++;
  			var tmp = msg['##'];
  			if(tmp && msg.put){
  				if(!db.hash[tmp]){ db.hash[tmp] = [0, '']; }
  				db.hash[tmp][0] = (db.hash[tmp][0] || 0) + 1;
  				var preview = Object.keys(msg.put||{});
  				db.hash[tmp][1] = preview.toString(', ').slice(0,500) + ' ...';
  			}
  		});
  	});

  }());

  var server = createCommonjsModule(function (module) {
  (function(){
  	var Gun = gun$1, u;
  	Gun.serve = serve_1;
  	//process.env.GUN_ENV = process.env.GUN_ENV || 'debug';
  	Gun.on('opt', function(root){
  		if(u === root.opt.super){
  			root.opt.super = true;
  		}
  		this.to.next(root);
  	});
  	module.exports = Gun;
  }());
  });

  var gun$2 = server;

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
              var ack = {err: gun$2.log('User already created!')};
              cat.ing = false;
              cb(ack);
              return;
          }
          act.pubs = pubs;
          act.salt = gun$2.text.random(64); // pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it.
          sea.work(pass, act.salt, act.b); // this will take some short amount of time to produce a proof, which slows brute force attacks.
      };
      act.b = function(proof){
          act.proof = proof;
          sea.pair(act.c); // now we have generated a brand new ECDSA key pair for the user account.
      };
      act.c = function(pair){ 
          let tmp = {};
          act.pair = pair || {};
          tmp.is = {pub: pair.pub, epub: pair.epub, alias: alias};
          // the user's public key doesn't need to be signed. But everything else needs to be signed with it! // we have now automated it! clean up these extra steps now!
          act.data = {pub: pair.pub};
          act.data.alias = alias;
          act.data.epub = act.pair.epub; 
          sea.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, act.proof, act.g, {raw:1}); // to keep the private key safe, we AES encrypt it with the proof of work!
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
      cb({err: gun$2.log("User is already being created or authenticated!"), wait: true});
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
              gun$2.node.is(data, function(v){ tmp.push(v); });
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
          sea.work(pass, (act.auth = auth).s, act.d, act.enc); // the proof of work is evidence that we've spent some time/effort trying to log in, this slows brute force.
      };
      act.d = function(proof){
          sea.decrypt(act.auth.ek, proof, act.e, act.enc);
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
          act.salt = gun$2.text.random(64); // pseudo-random
          sea.work(opt.change, act.salt, act.y);
      };
      act.y = function(proof){
          sea.encrypt({priv: act.pair.priv, epriv: act.pair.epriv}, proof, act.x, {raw:1});
      };
      act.x = function(auth){
          act.w(JSON.stringify({ek: auth, s: act.salt}));
      };
      act.w = function(auth){
          //root.get('~'+act.pair.pub).get('auth').put(auth, cb);
      };
      act.err = function(e){
          var ack = {err: gun$2.log(e || 'User cannot be found!')};
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
          sea.sign(msg,pair,cb);
      }
  }
  const verify = function(msg,pub,cb){
      sea.verify(msg,pub,cb);
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

  return Snap;

}));
