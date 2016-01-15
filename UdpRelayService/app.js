"use strict";
var dgram = require('dgram');
const udpPort = 666; // Original Doom port number!

const server = dgram.createSocket('udp4');
server.bind(udpPort);

server.on('listening', function () {
	console.log('Server started at ', udpPort);
});

/* Recives binary encoded (C-type POD) datagram with following structure:
 * [<uint32> marker id][<float32, float32, float32> rotation vector][<float32, float32, float32> translation vector]
 * Size of each marker POD is 28 bytes, so packet size is between 28 up to 168 (28 x 6) for all markers */
server.on('message', function (buf, rinfo) {
	const byteStep = 4;
	const packetSize = 28;
	
	console.log('Received %d bytes from %s:%d\n', buf.length, rinfo.address, rinfo.port);
	
	if (buf.length % packetSize === 0) {
		const size = buf.length;
		const msg = [];
		
		for (let i = 0, j = 0; i < size; i += packetSize, j++) {
			msg.push({
				id: buf.readUInt32LE(i + 0),
				rvec: [buf.readFloatLE(i + 4), buf.readFloatLE(i + 8), buf.readFloatLE(i + 12)],
				tvec: [buf.readFloatLE(i + 18), buf.readFloatLE(i + 20), buf.readFloatLE(i + 24)]
			});
			console.log('Marker id:%d r:%s t:%s', msg[j].id, msg[j].rvec.toString(), msg[j].tvec.toString());
		}

		
	} 
});

server.on('error', function () {
	console.log('Something bad with the network :(');
  // handle error
});

process.on('SIGINT', function () {
	console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
	server.close();
	process.exit();
})