import { snapID } from "./util";
import EventEmitter from "eventemitter3";

export default function addListeners (root){
    root.event = new EventEmitter()
    root.event.on('in',function(msg){
        //msg = [req/res,msgType,msgID,payload,expire]
        if(!(msg[2] instanceof Buffer))msg[2] = Buffer.from(msg[2].buffer,msg[2].byteOffset,msg[2].byteLength)
        if(msg[1] !== 4)root.opt.debug('on.in',msg)
        switch (msg[0]) {
            case 0:root.event.emit('req',msg);break;
            case 1:root.event.emit(msg[2].toString('binary'),msg);break;//response, emit on msgID so things that sent this can handle response
        }
    })
    root.event.on('req',function(msg){
        switch (msg[1]) {//on type
            case 0: root.router.recv.challenge(msg);break
            case 4: root.router.recv.ping(msg);break
            
            case 16: return true //ask
            case 20: return true //say

            case 32://create
            case 34://update
            case 36://read
            case 38://delete
            case 40: root.sg.crudq(msg);break //query

            case 42: root.event.emit('change',msg);break//updated(state change, like a put to propagate changed values, *this is a subscription update or 'created'*)
        }
    })
    root.event.on('change',function(msg){//all new and changed things will show up here
        let changes = msg[3]
        for (const [key,value] of changes) {
            switch (key[0]) {
                case 24: return true //blk header, not really a 'change', but a new thing
                case 94: //node address value
                case 98: root.event.emit(key.toString('binary'),value);break //list node key value
            }
        }
    })

    root.event.on('auth',function(){
        root.mesh.auth()//can do this right away, as other requests here may need auth with other peers
        //find peer id under name
        //determine 'what' we are
        //determine what we own
        //determine what we have (browser)
        //send sync message to one or our DIRPs
        //once we have gotten all of our data up do data root.state.ready = true; root.event.emit('ready',true)
    })
    root.event.on('pairwise',function(peer){
        if(peer.cid === root.user.cid){
            peer.hasRoot = true
        }
    })
    root.event.on('signout',function(){
        delete root.sign
        delete root.user
        root.mesh.signout()//disconnect all peers, as this peer is no longer authorized to interact with them.
        //really need to force refresh the page
    })
    root.event.on('peerDisconnect',function(peer){
        console.warn('API NOT FINISHED')
        //IF CLIENT VVV
        //if this peer is supplying a resource that we are currently looking for (subscribed to)
        //then we need to see if we are still connected to it with another peer
        //or if we have additional peers specified 
        //this is something we should track in resources and let it handle this problem
    })

    let on = {}
    on.in = function(msg){
        let {m,s,r} = msg
        let temp
        if(!['ack','ping'].includes(m))root.opt.debug('incoming msg',{m,s,r})
        if(s && (temp = root.router.recv[m])){//incoming request
            temp(msg)
        }else if (r && (temp = root.router.pending.get(r))){//incoming response to a previously sent message
            if(m === 'ack'){
                temp.ee.emit('ack',msg.b)//ack body is a timestamp
            }else if(m === 'error'){
                temp.ee.emit('error',msg.b)
            }else{
                temp.ee.emit('reply',msg)//only send the body to the tracker?
            }
        }else if (r && m == 'ask'){//msg expired, but we can merge this to graph as an update??
            //maybe this is how subscrive vs retrieve works? NO, must specify an off message to stop updates (which should be 'put' not 'get')
            //WE COULD TREAT THIS AS A 'PUT' AND IT WOULD ACT LIKE A 'NEW' NODE WAS CREATED???
            //doesn't really matter, if retrieve fired cb, then won't do anything, if sub'd, just merge and emit?
        }else{
            root.opt.debug('Could not route:',msg)
        }
    }
}


