import url from 'url'
import WebSocket from 'ws'
import {onDisConn,onMsg,Peer} from '../wire'

export default function commsInit(root){
	let opt = root.opt
	let ws = {};
	ws.server = opt.web;
	const onM = onMsg(root)
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
			wire.url = url.parse(wire.upgradeReq.url||'', true);
			peer = new Peer(wire,root.util.rand(12))//if it is another peer, can we see their ip from the wire and use that instead??
			root.peers.set(peer.id,peer)
			root.router.send.challenge(peer)//we do not send intro
			
			wire.on('message', function(msg){
				onM(msg,peer)
			});
			wire.on('close', function(){//server does not try to reconnect to a peerer
				root.opt.debug('peerer disconnected')
				if(peer && peer.wire && peer.wire.close)peer.wire.close()
				root.mesh.peers.delete(peer.id)
			});
			wire.on('error', function(e){});
			setTimeout(function heart(){ //setInterval??
				if(!root.peers.get(peer.id)){ return } 
				try{ 
					root.router.send.ping(peer); 
					setTimeout(heart, 1000 * 50) 
				}catch(e){} 
			}, 1000 * 50); // Some systems, like Heroku, require heartbeats to not time out. // TODO: Make this configurable?
		});
	}
	

}

