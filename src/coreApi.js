import {Peer} from './wire'
import { snapID, isLink, isSub, notFound } from './util';
export default function coreApi(root){
    root.initGraph = function(cid){
        
    }
    root.getCell = function(nodeID,p,cb,raw,exact){
        //need to store all the params in the 
        // buffer should be //Map{nodeID: Map{p:[]}}
        let address = snapID(nodeID).toAddress(p)
        let cVal = (root.store.getProp(nodeID,p) || {}).v
        let from = address
        let r = root.router
        if(!exact){
            let res = root.store.getPropValue(nodeID,p)
            cVal = res[0]
            from = res[1]
        }
        if(cVal !== notFound){
            let ido = snapID(from)
            r.returnGetValue(ido.toNodeID(),ido.p,cVal,cb,raw)
            return cVal //for using getCell without cb, assuming data is in cache??
        }
        root.router.batch.getCell.add(address,[cb,raw,exact])
       
    }
    root.getNode = function(nodeID,cb,raw){
        //for getting full nodes only (unknown amount of keys)
        let cVal = root.store.getNode(nodeID)
        if(cVal !== undefined){
            //what does raw mean??
            cb(root.store.extractVals(cVal))
            return cVal //for assuming data is in cache??
        }
        //only runs the following when needing network request
        root.router.batch.getNode.add(nodeID,[cb,raw])
    }
    root.put = function(things,cb,opts){
        //cb if for err,done processing

        //are we a client or peer


        //if client, we just send a 'say' message to any peer listed on the gossip for this namespace
        //we must wait for a written to disk confirmation until we add it to in memory on our own instance
        //client does not have to ask/generate all index nodes, peer does that.
        //if client is offline we need to store offline messages for transmitting
        //if we are offline it is beneficial to generate our own index lists, so everything works locally?


        //peer must enforce permissions and deal with index enforcement (states, indices etc) and broadcast to other peers who have asked for this namespace

        //so a client would run this put fn and it would send it to the peer
        //then the peer, on receiving that message will run this same function
        //depending on the ID type (if gossip) things will be handled differently

        //owned data (enforce permissions)

        //gossip, varies by type
        //Might make a 'newUser' and 'newBase' special message, as I think they will need to be blockchained in some matter for syncronizing
        //basically all gossip is treated the same whether a say or ask, since we can't trust any one peer.
        //gossip is a lot like gun, where a get is responded to with a put, but since we differentiate, gossip puts will follow the gossip gets

        //basically only clients will ever 'get' gossip, or peers that aren't syncing?? all?? some?? of the gossip?












    }
    root.route = function(msg){
        let {m,s,r} = msg
        let temp
        root.opt.debug('incoming msg',{m,s,r})
        if(s && (temp = root.router.recv[m])){//incoming request
            root.router.recv[m](msg)
        }else if (r && (temp = root.router.pending.get(r))){//incoming response to a previously sent message
            if(m === 'ack'){
                temp.on('ack',msg.ack)//only send the body to the tracker?
            }else if(m === 'error'){
                temp.on('error',msg.b)
            }else{
                temp.on('reply',msg.b)//only send the body to the tracker?
            }
        }else if (r && m == 'someData'){//msg expired, but we can merge this to graph as an update??
            //maybe this is how subscrive vs retrieve works?
            //we don't expire messages that we are subscribing to, they just stream the results?
            //so if it is here it was a retrieve that had more data come in after expiration?
        }else{
            root.opt.debug('Could not route:',msg)
        }
        next()
    }
    root.connect = function(ipAddr,cb){
        let env
        if(root.isNode)env = global
        else env = window
        env = env || {};
        root.WebSocket =  root.WebSocket || env.WebSocket || env.webkitWebSocket || env.mozWebSocket
        let wait = 2 * 1000;
        let doc = 'undefined' !== typeof document && document;
        if(!ipAddr){ return }
        let url = ipAddr.replace('http', 'ws');
        let wire = new root.WebSocket(url);
        let peer = new Peer(wire,ipAddr)
        if(!root.isNode)peer.wire.binaryType = 'arraybuffer'
        peer.challenge = false
        peer.pub = false
        wire.onclose = function(){//if whoever we are connecting to closes
            //onDisConn(root,peer);
            reconnect(peer);
        };
        wire.onerror = function(error){
            root.opt.debug('wire.onerror',error)
            reconnect(peer);
        };
        wire.onopen = function(){
            root.peers.set(peer.id,peer)
            cb(peer)
        }
        wire.onmessage = function(raw){
            //onMsg((raw.data || raw),peer,root.route)
        };
        return wire
        function reconnect(peer){
            if(root.isNode)return
            root.opt.debug('attempting reconnect')
            clearTimeout(peer.defer);
            if(doc && peer.retry <= 0){ return } 
            peer.retry = (peer.retry || opt.retry || 60) - 1;
            peer.defer = setTimeout(function to(){
                if(doc && doc.hidden){ return setTimeout(to,wait) }
                root.connect(peer.id);
            }, wait);
        }
        
    }
}

function getCell(nodeID,p,cb,raw){
    //need to store all the params in the 
    // buffer should be //Map{nodeID: Map{p:[]}}
    let address = toAddress(nodeID,p)
    let cVal = cache.get(address)
    let from = address
    if(cVal !== undefined){
        while (isEnq(cVal)) {
            let lookup = isEnq(cVal)
            cVal = cache.get(lookup)
            from = lookup
        }
        if(cVal !== undefined){
            let [fromN,p] = removeP(from)
            //console.log('RETURNING GET CELL FROM CACHE:',cVal)
            returnGetValue(fromN,p,cVal,cb,raw)
            //console.log('getCell,cache in:',Date.now()-start)
            return cVal //for using getCell without cb, assuming data is in cache??
        }
    }

    //only runs the following when needing network request
    if(getBufferState){
        getBufferState = false
        setTimeout(batchedWireReq,1)
    }
    let args = [cb,raw]
    if(!getBuffer[nodeID]){
        getBuffer[nodeID] = new Map()
    }
    let argArr = getBuffer[nodeID].get(p)
    if(!argArr)getBuffer[nodeID].set(p,[args])
    else argArr.push(args)
}
function batchedWireReq(){//direct to super peer(s??)
    let b = Object.assign({},getBuffer)
    getBuffer = {}
    getBufferState = true
    let doneCBs = {} //{[addr:[[cb,raw]]]}
    let requests = {}

    for (const nodeID in b) {
        let pMap = b[nodeID]
        requests[nodeID] = []
        for (const [p,argArry] of pMap.entries()) {
            doneCBs[toAddress(nodeID,p)] = argArry
            requests[nodeID].push(p)
        }
    }
    //console.log('WIRE BATCH',requests,doneCBs)
    gun._.on('out', {
        getBatch: requests,
        '#': gun._.ask(function(msg){
            let sg = msg.subGraph
            for (const soul in sg) {
                const putObj = sg[soul];
                for (const prop in putObj) {
                    if(prop === '_')continue//these are valid gun nodes
                    const value = putObj[prop];
                    let addr = toAddress(soul,prop)
                    sendToCache(soul,prop,value)
                    let argsArr = doneCBs[addr]
                    let e
                    if(e = isEnq(value)){//send it for another round...
                        let [s,p] = removeP(e)
                        for (const args of argsArr) {
                            getCell(s,p,...args)
                        }
                    }else{
                        handleGetValue(soul,prop,value,argsArr)
                    }      
                }    
            }
        })
    })
}
function handleGetValue(nodeID,p,val,argsArr){
    //console.log("GET VALUE:",val,{nodeID,p})
    for (let i = 0,l = argsArr.length; i < l; i++) {
        const args = argsArr[i];
        returnGetValue(nodeID,p,val,...args)   
    }
}
function returnGetValue(fromSoul,fromP,val,cb,raw){
    let {b,t,r} = parseSoul(fromSoul)
    let {propType,dataType,format} = getValue(configPathFromChainPath(makeSoul({b,t,r,p:fromP})),gb)
    let fromAddr = toAddress(fromSoul,fromP)
    if([null,undefined].includes(val)){
        cb.call(cb,null,fromAddr)
        //console.log('getCell,NULL in:',Date.now()-start)
        return
    }
    //so we have data on this soul and this should be returned to the cb
    if(dataType === 'unorderedSet'){//this will be a full object
        let data = JSON.parse(JSON.stringify(val))
        let setVals = []
        if(Array.isArray(data)){
            setVals = data.slice()
        }else{
            for (const key in data) {
                if(key === '_')continue
                const boolean = data[key];
                if (boolean) {//if currently part of the set
                    setVals.push(key) 
                }
            }
        }
        
        if(fromP === 'LABELS')setVals.unshift(t)
        val = setVals
    }else if(dataType === 'array'){
        try {
            val = JSON.parse(val)
            for (let i = 0; i < val.length; i++) {
                const el = val[i];
                if(ISO_DATE_PATTERN.test(el)){//JSON takes a date object to ISO string on conversion
                    val[i] = new Date(el)
                }
            }
        } catch (error) {
            // leave as is..
        }
    }
    if(!raw)val = formatData(format,propType,dataType,val)
    cb.call(cb,val, fromAddr)
    //console.log('getCell,DATA in:',Date.now()-start)

}