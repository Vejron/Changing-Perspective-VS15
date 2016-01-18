
var config = require("./config.js");
var express = require('express');
var app = express();
var server = require("http").createServer(app);
var io = require('socket.io')(server);
var dgram = require('dgram');

/* Storage container for markers
 * 
 * 
 */
var jsonMarkerDictionary = {
	//ids...
	'12': {
		tId: 0,
		mId: 12,
		rvec: [0, 0, 0],
		tvec: [0, 0, 0],
		sensor1: 12345678,
		sensor2: 999.8822
	},
	'6': {
		tId: 0,
		mId: 6,
		rvec: [0, 0, 0],
		tvec: [0, 0, 0],
		sensor1: 0,
		sensor2: 1
	}
}

const MarkerTracker = dgram.createSocket('udp4');
MarkerTracker.bind(config.UDPmarkerTrackerPort);

MarkerTracker.on('listening', function () {
	console.log('Marker tracker service listening on port: ', config.UDPmarkerTrackerPort);
});

/* Recives binary encoded (C-type POD) datagram with following structure:
 * [<uint16> table id][<uint16> marker id][<float32, float32, float32> rotation vector][<float32, float32, float32> translation vector]
 * Size of each marker POD is 28 bytes, so packet size is between 28 up to 168 (28 x 6) for all markers */
MarkerTracker.on('message', function (buf, rinfo) {
	const packetSize = 28;
	
	console.log('Received %d bytes from %s:%d\n', buf.length, rinfo.address, rinfo.port);
	
	// Simple check for malformed packets
	if (buf.length % packetSize === 0) {
		for (let i = 0, j = 0; i < buf.length; i += packetSize, j++) {
			// parse marker data 
			const marker = {
				tId: buf.readUInt16LE(i + 0),
				mId: buf.readUInt16LE(i + 2),
				rvec: [buf.readFloatLE(i + 4), buf.readFloatLE(i + 8), buf.readFloatLE(i + 12)],
				tvec: [buf.readFloatLE(i + 18), buf.readFloatLE(i + 20), buf.readFloatLE(i + 24)],
				sensor1: 0,
				sensor2: 1 
			}
			
			// Store and/or update marker in dictionary
			jsonMarkerDictionary[marker.id.toString()] = marker;

			//console.log('Table Id:%d Marker Id:%d r:%s t:%s', marker.tId, marker.mId, marker.rvec.toString(), marker.tvec.toString());
		}
	}
});

MarkerTracker.on('error', function () {
	console.log('Something bad with the network :(');
  // handle error
});

function binaryPacker(jsonPacket) {
	// mId = 2, tId = 2, rvec = 4 * 3, tvec = 4 * 3, sensor1 = 4, sensor2 = 4, == 4 + 12 + 12 + 8 == 36 bytes
	const keySizeInBytes = 36;
	const length = Object.keys(jsonPacket).length; // nbr of markers in dictionary
	var dataToSend = new Buffer(keySizeInBytes * length); // make room for all markers

	//pack straight [marker1][marker2][marker3]... etc
	var byteOffset = 0;
	
	for (var prop in jsonPacket) {
		if (jsonPacket.hasOwnProperty(prop)) {
			
			dataToSend.writeUInt16LE(jsonPacket[prop].tId, byteOffset + 0);
			dataToSend.writeUInt16LE(jsonPacket[prop].mId, byteOffset + 2);
			
			dataToSend.writeFloatLE(jsonPacket[prop].rvec[0], byteOffset + 4);
			dataToSend.writeFloatLE(jsonPacket[prop].rvec[1], byteOffset + 8);
			dataToSend.writeFloatLE(jsonPacket[prop].rvec[2], byteOffset + 12);
			
			dataToSend.writeFloatLE(jsonPacket[prop].tvec[0], byteOffset + 16);
			dataToSend.writeFloatLE(jsonPacket[prop].tvec[1], byteOffset + 20);
			dataToSend.writeFloatLE(jsonPacket[prop].tvec[2], byteOffset + 24);
			
			dataToSend.writeFloatLE(jsonPacket[prop].sensor1, byteOffset + 28);
			dataToSend.writeFloatLE(jsonPacket[prop].sensor2, byteOffset + 32);
			
			byteOffset += 36; // step to next 
		}
	}

	//for (var i = 0, keys = Object.keys(jsonPacket); i < keys.length; i++) {
		
	//	dataToSend.writeUInt16LE(jsonPacket[i].tId, byteOffset + 0);
	//	dataToSend.writeUInt16LE(jsonPacket[i].mId, byteOffset + 2);

	//	dataToSend.writeFloatLE(jsonPacket[i].rvec[0], byteOffset + 4);
	//	dataToSend.writeFloatLE(jsonPacket[i].rvec[1], byteOffset + 8);
	//	dataToSend.writeFloatLE(jsonPacket[i].rvec[2], byteOffset + 12);

	//	dataToSend.writeFloatLE(jsonPacket[i].rvec[0], byteOffset + 16);
	//	dataToSend.writeFloatLE(jsonPacket[i].rvec[1], byteOffset + 20);
	//	dataToSend.writeFloatLE(jsonPacket[i].rvec[2], byteOffset + 24);

	//	dataToSend.writeFloatLE(jsonPacket[i].sensor1, byteOffset + 28);
	//	dataToSend.writeFloatLE(jsonPacket[i].sensor2, byteOffset + 32);

	//	byteOffset += 36; // step to next 
	//}
	console.log(dataToSend);
	return dataToSend;
}

/* socket io */

io.on('connection', function (socket) {
	console.log('websocket connected');
	//socket.emit('message', { 'message': 'hello world' });
	
	// transmit updates with marker data to client(s) 
	var updates = setInterval(function () {
		//socket.volatile.emit('markers', markerContainer); 
		socket.volatile.emit('markers', binaryPacker(jsonMarkerDictionary)); 
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

app.use(express.static(__dirname + '/public'));
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