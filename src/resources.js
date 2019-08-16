import { setValue, getValue, snapID } from "./util";


export default function ResourceManager(root){
    let self = this
    this.list = {} //{baseID: {pending,peers,connected}}


    //tracks state of what baseID's we can reach
    //tracks pending requests that need a connection
    this.isConnectedTo = function(base){
        
    }
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
            asset.peers.add(root.mesh.setPeerState(ip,{owns:{[b]:resOwnPub}}))
            //if pub doesn't match, then it won't add, will create peer if not already created, returns
            //unless peer is already created, the ownership will always fail
            //ownership needs the ~*PUB> node, so unless we already saw that, it won't matter.
        }
    }
    this.subResource = function(ido){
        let id = (ido instanceof snapID)?ido.toStr():ido
        root.memStore.subNode(id,sub,Symbol())//we will unsub by nodeID not subID
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
                if(asset.owners.has(peerOwnerPub)){
                    asset.peers.add(root.mesh.setPeerState(ip,{owns:{[baseID]:current}}))
                }
            }
        }
    }
    this.subPeerOwnership = function(ido){
        let id = (ido instanceof snapID)?ido.toStr():ido
        root.memStore.subNode(id,sub,Symbol())//we will unsub by nodeID not subID
        function sub(nodePartial){
            self.processPeerOwnershipNode(ido,nodePartial)
        }
    }




    this.addPendingMsg = function(baseID,taskfn){
        let pend = getValue([baseID,'pending'],self.list)
        if(!pend)setValue([baseID,'pending'],[taskfn],self.list)
        else pend.push(taskfn)
    }
    
}
function Asset(baseID){
    this.id = baseID
    this.owners = new Set()//pubkeys of who's data
    this.peers = new Set()//ip's we can connect to
    Object.defineProperty(this,'state',{
        get(){
            //return [[peerObjs],[urls]]
            let peers = this.peers
            let response = []
            let ours = new Set()
            let owns = new Set()
            let conn = new Set()
            let seen = new Set()
            peers.forEach((peer)=>{
                if(!peer.connected){seen.add(peer);return}
                if(peer.isRoot)ours.add(peer)
                if(peer.owns.has(base))owns.add(peer)
                conn.add(peer)
                
            })
            response[1] = seen
            if(ours.size)response[0] = ours //prefer our own above others
            else if(owns.size)response[0] = owns //prefer the owner of the data's peers over others
            else if(conn.size) response[0] = conn //we are asking for the owners data from a source that requires us to check sigs
            else return false
            return response
        }
    })
}