import url from 'url'
import WebSocket from 'ws'
import {onDisConn,onMsg,Peer} from '../wire'

export default function commsInit(root){
	let opt = root.opt
	let ws = {};
	ws.server = opt.web;
	const onM = onMsg(root)
	const onD = onDisConn(root)
	if(ws.server && !ws.web){
		root.WebSocket = WebSocket
		opt.WebSocket = WebSocket
		ws.path = ws.path || '/snap';
		ws.maxPayload = ws.maxPayload; // || opt.pack || (opt.memory? (opt.memory * 1000 * 1000) : 1399000000) * 0.3;
		ws.web = new WebSocket.Server(ws);
		root.opt.debug('listening')
		ws.web.on('connection', function(wire){ 
			let peer;
			root.opt.debug('new connection')
			wire.upgradeReq = wire.upgradeReq || {};
			let theirIP = wire.url
			wire.url = url.parse(wire.upgradeReq.url||'', true);
			//console.log(wire)
			peer = new Peer(wire,(theirIP || root.util.rand(12)))//if it is another peer, can we see their ip from the wire and use that instead??
			peer.connected = true
			root.mesh.peers.set(peer.id,peer)
			root.router.send.challenge(peer)//we do not send intro
			
			wire.on('message', function(msg){
				onM(msg,peer)
			});
			wire.on('close', function(){//server does not try to reconnect to a peerer
				root.opt.debug('peerer disconnected')
				clearInterval(peer.heart)
				onD(peer)
			});
			wire.on('error', function(e){});
			peer.heart = setInterval(function heart(){ //setInterval??
				if(!peer.connected){ return } 
				try{ 
					root.router.send.ping(peer); 
				}catch(e){} 
			}, 1000 * 50); // Some systems, like Heroku, require heartbeats to not time out. // TODO: Make this configurable?
		});
	}
	

}

