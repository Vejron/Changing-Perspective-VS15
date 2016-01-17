

var config = require("./config.js");
var express = require('express');
var app = express();
var server = require("http").createServer(app);
var io = require('socket.io')(server);

var dgram = require('dgram');
const MarkerTracker = dgram.createSocket('udp4');
MarkerTracker.bind(config.UDPmarkerTrackerPort);

MarkerTracker.on('listening', function () {
	console.log('Marker tracker service listening on port: ', config.UDPmarkerTrackerPort);
});

/* Storage container for markers
 * 
 * 
 */
const markerContainer = {
	//ids...
	'12': {
		id: 12,
		rvec: [0, 0, 0],
		tvec: [0, 0, 0],
		sensor1: 0,
		sensor2: 1
	},
	'6': {
		id: 6,
		rvec: [0, 0, 0],
		tvec: [0, 0, 0],
		sensor1: 0,
		sensor2: 1
	}
} 

/* Recives binary encoded (C-type POD) datagram with following structure:
 * [<uint32> marker id][<float32, float32, float32> rotation vector][<float32, float32, float32> translation vector]
 * Size of each marker POD is 28 bytes, so packet size is between 28 up to 168 (28 x 6) for all markers */
MarkerTracker.on('message', function (buf, rinfo) {
	const byteStep = 4;
	const packetSize = 28;
	
	console.log('Received %d bytes from %s:%d\n', buf.length, rinfo.address, rinfo.port);
	
	// Simple check for malformed packets
	if (buf.length % packetSize === 0) {
		const size = buf.length;
		const msg = [];
		
		for (let i = 0, j = 0; i < size; i += packetSize, j++) {
			
			// parse marker data 
			const marker = {
				id: buf.readUInt32LE(i + 0),
				rvec: [buf.readFloatLE(i + 4), buf.readFloatLE(i + 8), buf.readFloatLE(i + 12)],
				tvec: [buf.readFloatLE(i + 18), buf.readFloatLE(i + 20), buf.readFloatLE(i + 24)],
				sensor1: 0,
				sensor2: 1 
			}
			
			// Store and/or update marker in dictionary
			markerDictionary[marker.id.toString()] = marker;

			//console.log('Marker id:%d r:%s t:%s', marker.id, marker.rvec.toString(), marker.tvec.toString());
		}
	}
});

MarkerTracker.on('error', function () {
	console.log('Something bad with the network :(');
  // handle error
});

/* socket io */

io.on('connection', function (socket) {
	console.log('websocket connected');
	//socket.emit('message', { 'message': 'hello world' });
	
	// transmit updates with narker data to client(s) 
	var updates = setInterval(function () {
		socket.volatile.emit('markers', markerContainer); 
	}, config.clientUpdateRate);
	
	socket.on('disconnect', function () {
		clearInterval(updates);
		console.log("WebSocket client disconnectet");
	});
});


/* express part */

server.listen(config.viewClientPort, function () {
	console.log("http service listening on port:" + config.viewClientPort);
});

app.use(express.static('public'));
app.get("/", function (req, res) {
	res.sendFile('index.html');
});

/* graceful shutdown */
process.on('SIGINT', function () {
	console.log("Gracefully shutting down from SIGINT (Ctrl-C)");
	MarkerTracker.close();
	server.close();
	io.close();
	process.exit();
})