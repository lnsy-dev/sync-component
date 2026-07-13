import { PeerServer } from 'peer';

const server = PeerServer({
  port: 9000,
  path: '/peerjs'
});

server.on('connection', (client) => {
  console.log(`peerjs-server: peer connected: ${client.getId()}`);
});

server.on('disconnect', (client) => {
  console.log(`peerjs-server: peer disconnected: ${client.getId()}`);
});

console.log('peerjs-server listening on port 9000');
