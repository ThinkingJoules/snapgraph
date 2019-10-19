import url from 'url'
import WebSocket from 'ws'
import {onMsg,Peer} from '../wire'

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
		ws.web.on('connection', function(wire,req){ 
			let peer;
			root.opt.debug('new connection')
			wire.upgradeReq = wire.upgradeReq || {};
			let theirIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress
			wire.url = url.parse(wire.upgradeReq.url||'', true);
			//console.log({theirIP,url})
			//console.log(wire)
			peer = new Peer(root,false,false)//if it is another peer, can we see their ip from the wire and use that instead??
			peer.wire = wire
			peer.connected = true
			root.router.send.peerChallenge(peer)//we do not send intro
			
			wire.on('message', function(msg){
				onM(msg,peer)
			});
			wire.on('close', function(){//server does not try to reconnect to a peerer
				root.opt.debug('peerer disconnected')
				clearInterval(peer.heart)
				peer.onclose()
				root.event.emit('peerDisconnect',peer)

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

