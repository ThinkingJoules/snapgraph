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
    on.peerDisconnect = function(peer){
        console.warn('API NOT FINISHED')
        //IF CLIENT VVV
        //if this peer is supplying a resource that we are currently looking for (subscribed to)
        //then we need to see if we are still connected to it with another peer
        //or if we have additional peers specified 
        //this is something we should track in resources and let it handle this problem
    }
}


