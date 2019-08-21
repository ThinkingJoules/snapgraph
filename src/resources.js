import { setValue, getValue, snapID } from "./util";


export default function ResourceManager(root){
    let self = this
    this.list = {} //{baseID: {pending,peers,connected}}


    this.findResource = function(baseID){
        //make id from base
        let ido = snapID({gos:true,b:baseID})
        root.getNode(ido.toStr(),function(node){
            self.processResourceNode(ido,node)
            self.subResource(ido.toStr())
        })
    }
    this.processResourceNode = function(ido,node){
        ido = (ido instanceof snapID)?ido:snapID(ido)
        //runs on ask and say that has cleared tests
        //changes peers 
        let {b} = ido
        for (const ip in node) {
            let resOwnerPub = node[ip].v || null
            setResourceOwner(b,resOwnerPub,ip)
        }
        function setResourceOwner(b,resOwnPub,ip){
            let asset = self.list[b] || (self.list[b] = new Asset(b))
            if(resOwnPub)asset.owners.add(resOwnPub)
            asset.peers.add(root.mesh.setPeerState(ip,{owns:{[b]:resOwnPub}}))//this is where the peer is probably added to the resource
            //if pub doesn't match, then it won't add, will create peer if not already created, returns
            //unless peer is already created, the ownership will always fail
            //ownership needs the ~*PUB> node, so unless we already saw that, it won't matter.
        }
    }
    this.subResource = function(ido){
        let id = (ido instanceof snapID)?ido.toStr():ido
        root.store.subNode(id,sub,Symbol())//we will unsub by nodeID not subID
        function sub(nodePartial){
            self.processResourceNode(ido,nodePartial)
        }
    }
    this.findPeerOwnership = function(pub){
        let ido = snapID({gos:true,pub,'>':true})
        root.getNode(ido.toStr(),function(node){
            self.processPeerOwnershipNode(ido,node)
            self.subPeerOwnership(ido.toStr())
        })
    }
    this.processPeerOwnershipNode = function(ido,node){
        ido = (ido instanceof snapID)?ido:snapID(ido)
        for (const ip in node) {
            let truthy = node[ip].v || null
            setIPOwner(ido.pub,ip,truthy)
        }
        function setIPOwner(peerOwnerPub,ip,current){
            root.mesh.setPeerState(ip,{pub:peerOwnerPub})
            for (const baseID in self.list) {
                let asset = self.list[baseID]
                let can = current && asset.owners.get(peerOwnerPub)//return with pub key if valid, or undefined
                asset.peers.add(root.mesh.setPeerState(ip,{pub:peerOwnerPub,owns:{[baseID]:can}}))//probably already in peer list, but a set should make sure no dup
                self.resolvePending(asset)//will send messages if it can
            }
        }
    }
    this.subPeerOwnership = function(ido){
        let id = (ido instanceof snapID)?ido.toStr():ido
        root.store.subNode(id,sub,Symbol())//we will unsub by nodeID not subID
        function sub(nodePartial){
            self.processPeerOwnershipNode(ido,nodePartial)
        }
    }
    this.resolvePending = function(asset){
        if(asset.pending.length){
            let [conn] = asset.state
            if(conn.length){
                for (const pendingTask of asset.pending) {
                    if(pendingTask instanceof Function){
                        pendingTask(conn)

                    }
                }
                asset.pending = []
            }
        }
    }

    this.getState = function(baseID){
        return (self.list[baseID] || {}).state || []
    }
    this.addPendingMsg = function(baseID,taskfn){
        let asset = self.list[baseID] || (self.list[baseID] = new Asset(baseID))
        asset.pending.push(taskfn)
    }
    
}
function Asset(baseID){
    this.id = baseID
    this.owners = new Set()//pubkeys of who's data
    this.peers = new Set()//ip's we can connect to
    this.pending = []
    Object.defineProperty(this,'state',{
        get(){
            //return [[peerObjs],[urls]]
            let peers = this.peers
            let response = []
            let ours = []
            let owns = []
            let conn = []
            let seen = []
            peers.forEach((peer)=>{
                if(!peer.connected || (peer.connected && !peer.verified)){seen.push(peer);return}
                if(peer.connected && !peer.verified){
                    //only connected and verified peers are connectable, this peer is in limbo, very rare state?
                    //basically there is an error on that peer, or that peer is unowned...
                    return
                }
                if(peer.isRoot)ours.push(peer)
                if(peer.owns.has(this.id))owns.push(peer)
                conn.push(peer)
                
            })
            response[1] = seen
            if(ours.length)response[0] = ours //prefer our own above others
            else if(owns.length)response[0] = owns //prefer the owner of the data's peers over others
            else if(conn.length) response[0] = conn //we are asking for the owners data from a source that requires us to check sigs
            else return false
            response[0].sort((a,b)=>a.ping-b.ping)//in case at somepoint we decide not to take all peers
            return response
        }
    })
}