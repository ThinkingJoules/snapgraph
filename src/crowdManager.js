import { setValue, signChallenge, getValue, buffUtil } from './util';

export default function Crowd(root){
    const crowd = this
    let opt = root.opt
    
    crowd.state = {}
    crowd.pack = opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3; // max_old_space_size defaults to 1400 MB.
    crowd.people = new Map()
    crowd.auth = function(peer){
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
    crowd.putStmt = async function(header,payload,peer){ //only for genesis block???
        if(!peer)peer = new Person(root,header)//we got this info from a 'putPeer' msg (this is either a new Peer Proof or an update to the state on the proof)
        if(!peer.isPeer){
            addToMesh()
            return
        }
        let work = await root.aeon.verifyPID(...header)
        if(!work){root.opt.warn('PID did not match specified');peer.disconnect();return}
        if(work.diffHit < (root.opt.minPeerWork || 24)){root.opt.warn('PID proof did not make the minimum work threshold.');peer.disconnect();return}
        
        let pidBuff = buffUtil(header[0])
        let changed = await addToMesh()
        if(changed){
            //this is either new or changed
            //we must propogate the changes to... all those connected to us? Or just in the direction?
        }
        async function addToMesh(){
            let pidStr = pidBuff.utilString()
            let inMesh = crowd.get(pidStr)
            let added = true
            if(inMesh)return analyzePeer()
            if(peer.connected || crowd.state.peerCount < root.opt.peerCache || !peer.isPeer){//incoming connection (we are a peer) OR browser loading opt initial
                crowd.set(pidStr,peer)
            }else{//we don't need to add this, we are at the specified limit, and we are not connecting to this, so it is purely for caching
                if(crowd.state.closest > peer.dist)crowd.set(pidStr,peer)
                else if(crowd.state.gap)crowd.set(pidStr,peer)
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
                if(peer.sameProof(header)){//did it change?
                    return false
                }else{
                    return await peer.addProof(header,work)
                }
            }
        }
        
        function analyzeMesh(){
            //if this is a new peer (either browser or first boot on nodejs) then we need to request a bunch more nodes so we can build routes
            let all = [...crowd.peers.values()].sort((a,b)=>a.dist - b.dist)        
            let allPeers = all.filter((x)=>x.isPeer)
            let allConn = all.filter((x)=>x.connected)
            let peerConn = allConn.filter((x)=>x.verified && x.isPeer)
            if(all.length < 9 || peerConn.length < 3)root.event.emit('morePeers',all[0])
            crowd.state.peerCount = allPeers.length
            crowd.state.totalConnections = allConn.length
            crowd.state.peersConnected = peerConn.length
            crowd.state.hop2 = peerConn.map((x)=>x.connectedTo.size).reduce((acc,cur)=>acc+=cur,0)
            crowd.state.closest = all[0].dist
            crowd.state.map = mapDistr()
            crowd.state.gap = crowd.state.map.filter((x)=>x.actualCount<x.targetCount)
            if(all.length>root.opt.peerCache)pruneMesh(crowd.state.map)
            function mapDistr(){
                let dis = []
                let buckets = 9 //make variable??
                let keeping = root.opt.peerCache
                let halfTotal = keeping/2
                let range = 8192 - crowd.state.closest
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
                    let minDist = crowd.state.closest + (prevcdf*range)
                    let maxDist = crowd.state.closest + (thiscdf*range)
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
    crowd.updateRT = function(peer,routingTable){//from 'rtu' message
        //someone (peer) is telling us who they have connected/disconnected from.
    } 
    function Stmt(header,body){
        let s = this
        s.cid = header[0]
        s.st = header[1]
        s.ts = header[2]
        s.pub = header[3]
        s.sig = header[4]
        s.hash = header[5]
        s.proof = header[6]
        s.body = body
        s.header = header
    }
}

function Person(root,cid,restore){
    let them = this

    restore = restore || []
    them.id = restore[0] || cid
    them.proof = restore[1] || null
    them.said = parseRestoreSet(2)
    them.tail = restore[3] || null
    them.wkns = parseRestoreSet(4)
    them.peers = parseRestoreSet(5)
    them.pin = restore[6] || false
    them.headersOnly = [null,undefined].includes(restore[7]) ? true : restore[7]
    let where = (root.peer.isPeer && root.peer.id) || root.state.anchor
    them.dist = restore[8] || (them.id && where) ? root.aeon.distance(where,this.id) : Infinity
    them.diffHit = restore[9] || 0
    them.work = restore[10] || 0
    function parseRestoreSet(el){
        return new Set((restore[el] && restore[el].length && restore[el].map((x)=>buffUtil(x).utilString()) || []))
    }
    them.verifyStmt = async function(proof,work){
        work = work || await root.aeon.verifyPID(...proof)
        if(work){
            them.diffHit = work.diffHit
            them.work = 1/work.chance
        }else return false
        them.id = proof[0]
        them.address = proof[6]
        let where = (root.peer.isPeer && root.peer.id) || root.state.anchor
        them.dist = (them.id && where) ? root.aeon.distance(where,this.id) : Infinity
        them.isPeer = !!proof[2]
        them.owner= proof[7]
        them.proof = proof
        return true
    }
    this.transform = function(){//pack it for disk
        return [
            this.proof,
            this.dist || null,
            this.diffHit || null,
            this.work || null,
            this.ourBytes || null,
            this.theirBytes || null,
            this.responseTime || null,
            this.disconnects || null,
            this.saw || null,
            this.bucket || null
        ]
    }
    this.score = function(lastBucket){
        
    }


    this.queueState = function(proof,connState){
        let pid = Buffer.from(pid).toString('binary')
        let inq = them.queue.get(pid)
        if(!inq || inq[0][7] < proof[7] || inq[1] !== connState){//new/updated
            them.queue.set(pid,[proof,connState])
            if(!them.qPend){
                them.qPend = true
                setTimeout(root.router.send.peerState,30000,them,them.queue)//30 seconds? maybe longer?
            }
        }
    }
    this.sameProof = function(incoming){
        //check the date? or check all of it? or just the sigs?
        //just the state sig, that should tell us if the other fields have changed
        return !Buffer.compare(buffUtil(this.proof && this.proof[4]),buffUtil(incoming[4]))
    }
    this.disconnect = function(){//if we disconnect, we want to cancel their disconnects counter increment
        them.disconnects--
        close()
    }
    this.onclose = function(){//this is when they break connection
        them.disconnects++
        close()
    }
    function close(){
        if(them.peer.wire && them.peer.wire.close)them.peer.wire.close()
        them.connected = false
        them.weConnected = false
        them.verified = false
    }
}