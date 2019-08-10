import { on } from "./util";

const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz~!@#%^&*)-_=+}|]:.?/'

const noop = function(){}
export default function Router(root){
    //assume root has ws setup and bootstrap peers already listed/connected
    //we may need to connect additional peers
    this.root = root
    const router = this
    router.pending = new Map()
    const send = router.send = {}
    const recv = router.recv = {}
    send.intro = function(pid,opts){//sender generates
        opts = opts || {}
        let expireReq = opts.expire || (Date.now()+(1000*60*60*8))//must auth within 8 hrs??? Probably only browsers that will be waiting on human 
        let b = {challenge:0,isPeer:root.isNode}
        let msg = new SendMsg('intro',b,true,expireReq)
        msg.b.challenge = msg.s //challenge is signing this msgID, that way the know where to respond
        msg.to = [pid]
        track(msg,new TrackOpts(opts.acks,opts.replies,{},{onError: opts.onError,onDone:[onDone,opts.onDone],onReply:opts.onReply,onAck:[onAck,opts.onAck]}))
        let peer = root.peers.peers.get(pid)
        peer.challenge = msg.s
        if(!peer.met)peer.met = Date.now()
        root.opt.debug('sending intro',msg)
        sendMsgs(msg)
        function onAck(v,next){
            if(this.acks === 1){//only on first ack
                let n = Date.now()
                let peer = root.peers.getPeer(pid) || {}
                peer.ping = n-this.sent //round trip
            }
            next()
        }
        function onDone(value,next){//what to do with their response
            console.log('HAS SIG',value,this)
            let {auth,pub} = value
            root.verify(auth,pub,function(valid){
                if(valid){
                    root.opt.debug('Valid signature, now authenticated!')
                    peer.pub = pub
                    peer.challenge = false
                }else{
                    root.opt.log('Signature did not validate!')
                    //what to do? submit another challenge?
                    //send an error message?
                    //if these are two servers then no one will know this has failed
                }
            })
            next()
            //b should have auth, need to verify sig and compare to challenge
        }
    }
    recv.intro = function(msg){//this is what the receiver is going to do on getting it
        let {b} = msg
        let {challenge,isPeer} = b
        let peer = msg._.peer
        peer.theirChallenge = challenge
        peer.isPeer = isPeer
        root.on('intro',peer.id)//if auth'd will reply, if not, will wait for auth
    }
    send.ping = function(pid){
        let b = ''
        let msg = new SendMsg('ping',b,false,false,true)
        track(msg,new TrackOpts(1,0,0,false,onDone,function(v,n){n()}))
        msg.to = [pid]
        sendMsgs(msg)
        function onDone(value){
            let n = Date.now()
            let peer = root.peers.getPeer(pid) || {}
            peer.ping = n-this.sent //round trip
        }
    }
    send.error = function(pid,err){
        let b = err
        let msg = new SendMsg('error',b,false)
        msg.to = [pid]
        sendMsgs(msg)
    }





    function to(peers){
        let {msg} = this
        msg.to = (Array.isArray(peers)) ? peers : [peers]
        sendMsgs(msg)
    }
    function sendMsgs(msg){
        for (const pid of msg.to) {
            root.peers.sendTo(msg,pid)
        }
    }

    // m:msgType, s:originalMsgID, r:respondingToThisOrigID er:expectsResponse, b:body, e:expiration date to:message went/is going to
    function SendMsg(type,body,expectResponse,expire,ack){
        this.m = type
        this.s = root.util.rand(12,chars)
        if(expectResponse)this.er = expectResponse //if we expect a response, which type? (more for humans, we don't do anything with it? Could reject resp if != to)
        this.b = body
        if(expectResponse)this.e = expire ? expire : (Date.now()+(1000*30))//30 seconds as default?? Gun uses 9, but we can set dif/per msg type
        this.ack = !!ack //can ack a msg seperate from the reply, redundant when all you want is an ack
    }
    function RespMsg(type,respToMsgID,body){
        this.m = type
        this.r = respToMsgID
        this.b = body
    }
    function TrackOpts(acks,replies,initialValue,ons){
        //onError,Done,Reply will be an array of functions that run after snapsgraphs
        let missing = [undefined,false,null]
        this.acks = (!missing.includes(acks) && acks) || 0
        this.replies = (!missing.includes(replies) && replies) || 1
        this.initialValue = initialValue
        this.onAck = isArr(ons.onAck) || []
        this.onError = isArr(ons.onError) || [root.opt.log]
        this.onDone = isArr(ons.onDone) || []
        this.onReply = isArr(ons.onReply) || [function(newVal,next){this.value = newVal;next()}]//we should always pass one in for internal messages
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
        opts = opts || {}
        let expire = msg.e || (Date.now()+(1000*9)) //default will only be set if we are not expecting a response? which we aren't tracking these anyway.
        let tracker = new Tracker(msg,opts)
        tracker.on('ack',function(value,next){this.acks++;next()})
        tracker.on('ack',opts.onAck)
        tracker.on('ack',function(){
            this.test()
        })
        tracker.on('reply',function(newVal,next){this.replies++;next()})
        tracker.on('reply',opts.onReply)
        tracker.on('reply',function(){
            this.test()
        })//will always be last, no need for next
        tracker.on('error',opts.onError)
        tracker.on('error',function(){router.pending.delete(this.id)})
        tracker.on('done',opts.onDone)
        tracker.on('done',function(){router.pending.delete(this.id)})
        tracker.timer = setTimeout(tracker.on,(expire-Date.now()),'error','MESSAGE EXPIRED')
        tracker.sent = Date.now()
        router.pending.set(tracker.id,tracker)
        //root.opt.debug('tracking msg',tracker)

        function Tracker(msg,opts){
            opts = opts || {}
            let self = this
            this.on = on
            this.id = msg.s || msg.r
            this.acks = 0
            this.replies = 0
            this.value = opts.initialValue
            this.test = function(){
                let acksNeeded = opts.acks
                let repliesNeeded = opts.replies
                if(acksNeeded >= self.acks && repliesNeeded >= self.replies){
                    self.on('done',self.value)
                    clearTimeout(self.timer)
                }
            }
        }
    }
}

