import {Peer} from './wire'
import { setValue, signChallenge, getValue, buffUtil } from './util';
import WebSocket from 'ws'

export default function PeerManager(root){
    const mesh = this
    let opt = root.opt
    let env;
    if(root.peer.isPeer)env = global
    else env = window
    env = env || {};
    root.WebSocket = root.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket || WebSocket;
    
    mesh.state = {}
    mesh.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
    mesh.peers = new Map()
    mesh.auth = function(peer){
        if(peer){//we are already auth'd and we have a new connection, sign it directly
            signChallenge(root,peer)
            return
        }
        for (const peer of peers.values()) {//we just auth'd ourselves, sign and send existing challenges
            if(peer.theirChallenge){
                signChallenge(root,peer)
            }
        }
    }
    mesh.signout = function(){//NOT DONE YET
        for (const peer of peers.values()) {
            let isInitial = peer.initialPeer && peer.id
            peer.wire.close()
            peer.connected = false
            root.event.emit('peerDisconnect',peer)//need to setup subs at a new peer if we were relying on things from this peer
            if(isInitial){
                //want to reconnect so there are some peers
                setTimeout(()=>{
                    mesh.connect(peer.id)
                },2000)//let socket settle and close fully, could probably be less
            }
            //short of a page refresh, this is the best we can do
            //that way on reconnect we are no long auth'd
        }
    }
    mesh.connect = function(peer){
        let wait = 2 * 1000;
        let doc = 'undefined' !== typeof document && document;
        if(!peer){ return }
        let ipAddr = peer.address
        if(!ipAddr)return
        let url = ipAddr.replace('http', 'ws');
        let wire = new root.WebSocket(url);
        if(!(peer instanceof Peer)){root.opt.warn('must supply a peer object to make a connection');return}
        peer.wire = wire
        peer.weConnected = Date.now()
        peer.connects++
        if(!root.peer.isPeer)peer.wire.binaryType = 'arraybuffer'
        wire.onclose = function(){//if whoever we are connecting to closes
            root.opt.debug('connection lost to peer: ',peer.id)
            peer.onclose()
            root.event.emit('peerDisconnect',peer)
            reconnect(peer);
        };
        wire.onerror = function(error){
            root.opt.debug('wire.onerror',error)
            reconnect(peer);
        };
        wire.onopen = function(){
            peer.connected = true
            root.router.send.ping(peer)
            root.router.send.peerChallenge(peer)
        }
        wire.onmessage = function(raw){
            peer.recv((raw.data || raw),peer)
        };
        return wire
        function reconnect(peer){//move reconnect in to Peer object?
            if(root.peer.isPeer)return
            root.opt.debug('attempting reconnect')
            clearTimeout(peer.defer);
            if(doc && peer.retry <= 0){ return } 
            peer.retry = (peer.retry || opt.retry || 60) - 1;
            peer.defer = setTimeout(function to(){
                if(doc && doc.hidden){ return setTimeout(to,wait) }
                mesh.connect(peer.id);
            }, wait);
        }
    }
    mesh.putPeerProof = async function(proof,peer){
        if(typeof proof === 'string'){//this is something from initialized opts, this is just an IP address/url
            //we will end up here again once we get the proof from connecting
            mesh.connect(new Peer(root,proof))
            return
        }
        if(peer){//this is only from getting a proof from a peer we are connecting to
            if(await peer.addProof(proof)){
                if(peer.owner && !peer.ownerVerified)root.gossip.verifyPeerOwner(peer)
                return await addToMesh()
            }
        }
        peer = peer || new Peer(root,false)//we got this info from a 'putPeer' msg (this is either a new Peer Proof or an update to the state on the proof)
        if(peer){
            peer.addProof(proof)

        }
        if(!peer){
            if(await peer.addProof(proof)){}
        }else if(peer.sameProof(proof)) {

        }
        if(!await peer.addProof(proof)){root.opt.warn('Invalid peer Proof.');peer.disconnect();return}
        if(!peer.isPeer){
            addToMesh()
            return
        }
        if(peer.diffHit < (root.opt.minPeerWork || 24)){root.opt.warn('PID proof did not make the minimum work threshold.');peer.disconnect();return}
        let changed = await addToMesh()
        if(changed){
            //this is either new or changed
            //we must propogate the changes to... all those connected to us? Or just in the direction?
        }
        async function addToMesh(){
            let inMesh = mesh.get(peer.id.string)
            let added = true
            if(inMesh)return analyzePeer()
            if(peer.connected || mesh.state.peerCount < root.opt.peerCache || !peer.isPeer){//incoming connection (we are a peer) OR browser loading opt initial
                mesh.set(pidStr,peer)
            }else{//we don't need to add this, we are at the specified limit, and we are not connecting to this, so it is purely for caching
                if(mesh.state.closest > peer.dist)mesh.set(pidStr,peer)
                else if(mesh.state.gap)mesh.set(pidStr,peer)
                else added = false
            }
            //index mesh, get count of 'real' peers and find distribution put in root.state.peerCount
            let changed = await analyzePeer()
            if(added){
                analyzeMesh()
            }
            return changed
            async function analyzePeer(){
                if(!peer.saw)peer.saw = Date.now()
                if(peer.connected && !peer.met)peer.met = Date.now()
                if(peer.sameProof(proof)){//did it change?
                    return false
                }else{
                    return await peer.addProof(proof,work)
                }
            }
        }
        
        function analyzeMesh(){
            //if this is a new peer (either browser or first boot on nodejs) then we need to request a bunch more nodes so we can build routes
            let all = [...mesh.peers.values()].sort((a,b)=>a.peerDist - b.peerDist)        
            let allPeers = all.filter((x)=>x.isPeer)
            let allConn = all.filter((x)=>x.connected)
            let peerConn = allConn.filter((x)=>x.verified && x.isPeer)
            if(all.length < 9 || peerConn.length < 3)root.event.emit('morePeers',all[0])
            mesh.state.peerCount = allPeers.length
            mesh.state.totalConnections = allConn.length
            mesh.state.peersConnected = peerConn.length
            mesh.state.hop2 = peerConn.map((x)=>x.connectedTo.size).reduce((acc,cur)=>acc+=cur,0)
            mesh.state.closestPeer = all[0].peerDist
            all.sort((a,b)=>a.chainDist-b.chainDist)
            mesh.state.closestChain = all[0].chainDist

            mesh.state.map = mapDistr()
            mesh.state.gap = mesh.state.map.filter((x)=>x.actualCount<x.targetCount)
            if(all.length>root.opt.peerCache)pruneMesh(mesh.state.map)
            function mapDistr(){
                let dis = []
                let buckets = 9 //make variable??
                let keeping = root.opt.peerCache
                let halfTotal = keeping/2
                let range = 8192 - mesh.state.closest
                //9 buckets by distance
                //10th bucket 1/2 of total all distance > bucket9maxdist
                let j = 0
                for (let i = 1; i <= buckets; i++) {
                    dis.push(makeBucket(i))               
                }
                let bLast = makeBucket(buckets+1)
                bLast.minDist = bLast.maxDist
                bLast.maxDist = 8192
                bLast.targetCount = halfTotal
                dis.push(bLast)
                for (const peer of all) {
                    while (peer.dist>dis[j].maxDist && j < dis.length) {j++} //everything is sorted, so this should work
                    peer.bucket = j
                    dis[j].add(peer)
                    //score the peer?
                }
                return dis

                function makeBucket(bucketNum){
                    bucketNum = bucketNum || 1 //can't have a 0
                    let a = 1
                    let prevcdf = cdf(buckets,a,bucketNum-1)
                    let prevB = Math.round(prevcdf*halfTotal)
                    let thiscdf = cdf(buckets,a,bucketNum)
                    let thisCount = Math.round(thiscdf*halfTotal) - prevB
                    let minDist = mesh.state.closest + (cdf(buckets,a*2,bucketNum-1)*range)
                    let maxDist = mesh.state.closest + (cdf(buckets,a*2,bucketNum)*range)
                    return {
                        bucketNum,
                        targetCount:thisCount,
                        actualCount:0,
                        inBucket:[],
                        minDist,
                        maxDist,
                        add: function(peer){
                            this.inBucket.push(peer);
                            this.actualCount++
                        }
                    }
                    //need to calc the target distance? how do we know actual vs target?
                    //double curve? one for the # of peers in each bin, other for the % of total distance within the bucket??
                    
                }
                function cdf(l,a,num){
                    return 1-Math.pow(1+(num/l),-a)
                }
            }
        }
    }
    mesh.updateRT = function(peer,routingTable){//from 'rtu' message
        //someone (peer) is telling us who they have connected/disconnected from.
    }
    mesh.newPeer = async function(peer,proof){//from connection
        peer.isPeer = !!proof[1]
        if(!peer.isPeer){
            peer.id = Buffer.from(pid);
            root.mesh.peers.set(peer.id.toString('base64'),peer);
            return
        }
        let work = await root.monarch.verifyPID(...proof)
        if(!work){root.opt.warn('PID did not match specified');peer.wire&&peer.wire.close();return}
        root.opt.debug('Valid signature, peer authenticated!')
        peer.addProof(proof)
        peer.met = Date.now()
        peer.work = work
        let isNew = mesh.peers.has(peer.id.toString('base64'))
        root.mesh.peers.set(peer.id.toString('base64'),peer)
        if(root.peer.isPeer){
            //broadcast to neighbor peers? We want them to know who we are connected to
            //ask them for their routing table?
            //ask them for their cids?

            root.event.emit('peerState',proof,isNew,'connected')
            //do we need to prune some entries we arent connected to?
            //set 'write to disk' flag so it will dump all current peers to disk at some point
        }

    }
    this.setPeerState = function(proof,opts){
        //opts = {owns:{baseID:pubKey attemps adds, false removes},connected,pub,verified,hasRoot}
        let peer
        
        if(!(peer = mesh.all.get(ip))){
            peer = mesh.all.set(ip,new Peer(false,ip,false)).get(ip)
        }
        for (const opt in opts) {
            const value = opts[opt];
            if(opt === 'owns'){
                value = value || {}
                for (const baseID in value) {
                    if(peer.pub && peer.pub === value[baseID]){
                        peer.owns.add(b)
                    }else{
                        peer.owns.delete(baseID)
                    }
                }
            }else{
                peer[opt] = value
            }
        }
        return peer
    }
    this.getBestPeers = function(howMany){
        //used on gets
        howMany = howMany || 1
        let all = [...mesh.peers.values()]
        if(howMany > all.length)howMany = all.length
        return all.filter(x=>x.isPeer).sort((a,b)=>a.ping-b.ping).slice(0,howMany)//superpeers sorted by ping, these should have gossip info on them, treated equally
    }
    this.getNonClients = function(){
        //used on certain updates
        //gets all connected peers that are not clients
        return [...mesh.peers.values()].filter(x=>x.isPeer&&x.connected)
    }
    this.getConnectedNeedingUpdate = function(nodeID,pval){
        //updates on changes locally that need to be sent to others listening
        //need to make sure they didn't just send us the update? Probably not job of this fn
        let all = new Set() //set because we are going to have to use set operation to remove ones that sent us the update
        for (const {wants} of mesh.peers.values()) {
            let ps
            if(wants && (ps=wants[nodeID]) && ps.has(pval)){
                all.add(peer)
            }
        }
        return all
    } 
}
