import url from 'url'
import WebSocket from 'ws'
export default function commsInit(root){
	let opt = root.opt
	let ws = {};
	ws.server = opt.web;

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
			peer = {wire: wire,id:root.util.rand(12)}

			root.peers.onConn(peer)
			wire.on('message', function(msg){
				root.peers.onMsg(msg,peer)
			});
			wire.on('close', function(){
				root.peers.onDisConn(peer);
			});
			wire.on('error', function(e){});
			setTimeout(function heart(){ //setInterval??
				if(!root.peers.peers.get(peer.id)){ return } 
				try{ 
					root.router.send.ping(peer.id); 
					setTimeout(heart, 1000 * 50) 
				}catch(e){} 
			}, 1000 * 50); // Some systems, like Heroku, require heartbeats to not time out. // TODO: Make this configurable?
		});
	}
	

}

