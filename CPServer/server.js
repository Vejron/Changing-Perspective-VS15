
var config = require("./config.js");
var express = require('express');
var app = express();
var server = require("http").createServer(app);
var io = require('socket.io')(server);
var dgram = require('dgram');
var GlobalStore = require('./public/js/markerStore.js');

/* Storage container for markers
 * 
 * 
 */
var globalStore = new GlobalStore(1000, 16);
var jsonMarkerDictionary = {
	//ids...
	'12': {
		tId: 0,
		mId: 12,
		rvec: [0, 0, 0],
		tvec: [0, 0, 0],
		epoch: Date.now(),
		sensor1: 12345678,
		sensor2: 999.8822
	},
	'6': {
		tId: 0,
		mId: 6,
		rvec: [0, 0, 0],
		tvec: [0, 0, 0],
		epoch: Date.now(),
		sensor1: 0,
		sensor2: 1
	}
}

var test = {
tId: 0,
		mId: 6,
rvec: [0, 0, 0],
tvec: [0, 0, 0],
epoch: Date.now(),
sensor1: 666,
sensor2: 1
}
//globalStore.addMarker(jsonMarkerDictionary['12']);
//globalStore.addMarker(jsonMarkerDictionary['6']);
//globalStore.addMarker(jsonMarkerDictionary['6']);
//globalStore.addMarker(test);

const MarkerTracker = dgram.createSocket('udp4');
MarkerTracker.bind(config.UDPmarkerTrackerPort);

MarkerTracker.on('listening', function () {
	console.log('Marker tracker service listening on port: ', config.UDPmarkerTrackerPort);
});

/* Recives binary encoded (C-type POD) datagram with following structure:
 * [<uint16> table id][<uint16> marker id][<float32, float32, float32> rotation vector]
 * [<float32, float32, float32> translation vector][<int64> time since epoch in ms]
 * Size of each marker POD is 36 bytes, so packet size is between 36 up to (36 x 6) for all markers 
*/
MarkerTracker.on('message', function (buf, rinfo) {
	const packetSize = config.packetSizeOnServer;
	
	console.log('Received %d bytes from %s:%d\n', buf.length, rinfo.address, rinfo.port);
	
	// Simple check for malformed packets
	if (buf.length % packetSize === 0) {
		for (let i = 0; i < buf.length; i += packetSize) {
			// parse marker data 
			const marker = {
				tId: buf.readUInt16LE(i + 0),
				mId: buf.readUInt16LE(i + 2),
				rvec: [buf.readFloatLE(i + 4), buf.readFloatLE(i + 8), buf.readFloatLE(i + 12)],
				tvec: [buf.readFloatLE(i + 18), buf.readFloatLE(i + 20), buf.readFloatLE(i + 24)],
				epoch: buf.readIntLE(i + 28, 8),
				sensor1: 0, // TODO: not implemented yet
				sensor2: 0  // will be added by smart markers (Tokens)
			}
			
			globalStore.addMarker(marker);
			// Store and/or update marker in dictionary
			//jsonMarkerDictionary[marker.id] = marker;
			//console.log('tracker time: %d node time: %d', marker.epoch, Date.now());
			//console.log('Table Id:%d Marker Id:%d r:%s t:%s', marker.tId, marker.mId, marker.rvec.toString(), marker.tvec.toString());
		}
	}
});

MarkerTracker.on('error', function () {
	console.log('Something bad with the network :(');
  // handle error
});

function binaryPackerFromArray(jsonPacket) {
	// mId = 2, tId = 2, rvec = 4 * 3, tvec = 4 * 3, epoch = 8, sensor1 = 4, sensor2 = 4, == 4 + 12 + 12 + 8 + 8 == 44 bytes
	const keySizeInBytes = config.packetSizeOnClient;
	const length = jsonPacket.length;
	var dataToSend = new Buffer(keySizeInBytes * length); // make room for all markers
	
	//pack straight [marker1][marker2][marker3]... etc
	var byteOffset = 0;
	
	for (var i = 0; i < length; i++) {
		dataToSend.writeUInt16LE(jsonPacket[i].tId, byteOffset + 0);
		dataToSend.writeUInt16LE(jsonPacket[i].mId, byteOffset + 2);
		
		dataToSend.writeFloatLE(jsonPacket[i].rvec[0], byteOffset + 4);
		dataToSend.writeFloatLE(jsonPacket[i].rvec[1], byteOffset + 8);
		dataToSend.writeFloatLE(jsonPacket[i].rvec[2], byteOffset + 12);
		
		dataToSend.writeFloatLE(jsonPacket[i].tvec[0], byteOffset + 16);
		dataToSend.writeFloatLE(jsonPacket[i].tvec[1], byteOffset + 20);
		dataToSend.writeFloatLE(jsonPacket[i].tvec[2], byteOffset + 24);
		
		dataToSend.writeIntLE(jsonPacket[i].epoch, byteOffset + 28, 8);
		
		dataToSend.writeFloatLE(jsonPacket[i].sensor1, byteOffset + 36);
		dataToSend.writeFloatLE(jsonPacket[i].sensor2, byteOffset + 40);
		
		byteOffset += keySizeInBytes; // jump to next marker
	};

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
		//socket.volatile.emit('markers', binaryPacker(jsonMarkerDictionary)); 
		var markersToEmit = globalStore.getLastKnownMarkers();
		if (markersToEmit.length > 0) {
			socket.volatile.emit('markers', binaryPackerFromArray(markersToEmit));
		}
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






// Deprecated
//function binaryPacker(jsonPacket) {
//	// mId = 2, tId = 2, rvec = 4 * 3, tvec = 4 * 3, epoch = 8, sensor1 = 4, sensor2 = 4, == 4 + 12 + 12 + 8 + 8 == 44 bytes
//	const keySizeInBytes = 44;
//	const length = Object.keys(jsonPacket).length; // nbr of markers in dictionary
//	var dataToSend = new Buffer(keySizeInBytes * length); // make room for all markers

//	//pack straight [marker1][marker2][marker3]... etc
//	var byteOffset = 0;

//	for (var prop in jsonPacket) {
//		if (jsonPacket.hasOwnProperty(prop)) {

//			dataToSend.writeUInt16LE(jsonPacket[prop].tId, byteOffset + 0);
//			dataToSend.writeUInt16LE(jsonPacket[prop].mId, byteOffset + 2);

//			dataToSend.writeFloatLE(jsonPacket[prop].rvec[0], byteOffset + 4);
//			dataToSend.writeFloatLE(jsonPacket[prop].rvec[1], byteOffset + 8);
//			dataToSend.writeFloatLE(jsonPacket[prop].rvec[2], byteOffset + 12);

//			dataToSend.writeFloatLE(jsonPacket[prop].tvec[0], byteOffset + 16);
//			dataToSend.writeFloatLE(jsonPacket[prop].tvec[1], byteOffset + 20);
//			dataToSend.writeFloatLE(jsonPacket[prop].tvec[2], byteOffset + 24);

//			dataToSend.writeIntLE(jsonPacket[prop].epoch, byteOffset + 28, 8);

//			dataToSend.writeFloatLE(jsonPacket[prop].sensor1, byteOffset + 36);
//			dataToSend.writeFloatLE(jsonPacket[prop].sensor2, byteOffset + 40);

//			byteOffset += keySizeInBytes; // jump to next marker
//		}
//	}
//	console.log(dataToSend);
//	return dataToSend;
//}