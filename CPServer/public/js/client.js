//browserify client.js - o bundle.js
//browserify -g uglifyify ./index.js > bundle.js
//
var PIXI = require('pixi.js');
var pixiUtil = require('./pixiUtils.js');
var $ = require('jquery');
var io = require('socket.io-client');
var Buffer = require('buffer').Buffer;
var GlobalStore = require('./markerStore.js');
var MarkerRenderer = require('./markerRenderer.js');
var config = require('../../config.js');



// history of 10 steps and 16 tables
var globalStore = new GlobalStore(10, 16); 

var socket = io.connect();
socket.on('markers', function (arrbuf) {
    var buf = new Buffer(arrbuf);
    var packetSize = config.packetSizeOnClient;

    if (buf.length % packetSize === 0) {
        for (var i = 0, j = 0; i < buf.length; i += packetSize, j++) {
			var marker = {
				tId: buf.readUInt16LE(i + 0),
				mId: buf.readUInt16LE(i + 2),
				rvec: [buf.readFloatLE(i + 4), buf.readFloatLE(i + 8), buf.readFloatLE(i + 12)],
				tvec: [buf.readFloatLE(i + 16), buf.readFloatLE(i + 20), buf.readFloatLE(i + 24)],
				epoch: buf.readIntLE(i + 28, 8),
				sensor1: buf.readFloatLE(i + 36),
				sensor2: buf.readFloatLE(i + 40)
			};
			marker.localTimeMs = Date.now();
			globalStore.addMarker(marker);
		}
		//console.log('round trip time in ms: %d', marker.localTimeMs - marker.epoch);
    }
});

var resolution = {
	x: 1920,
	y: 1080
};

var colors = {
	table: 0xE1F1F0,
	tableBorder: 0xFCFDFF,
	marker: 0xFEDE4D,
	markerBorder: 0x000000
};

// Pixi setup
var renderer = new PIXI.WebGLRenderer(resolution.x, resolution.y, { backgroundColor: 0xD8ECEA, antialias: true });
var scale = pixiUtil.scaleToWindow(renderer.view);
document.body.appendChild(renderer.view);
var stage = new PIXI.Container();
var markerRenderer;



// Rescale
window.addEventListener("resize", function () {
	scale = pixiUtil.scaleToWindow(renderer.view);
});

// Pixi Resource loading
var loader = PIXI.loader
				.add('bunny', 'images/bunny.png')
				//.add('marker', 'marker.png')
				//.add('table', 'table.png')
				.once('complete', function (loader, resources) { init(); })
				.load();

function init() {
	var bunny = new PIXI.Sprite(PIXI.loader.resources.bunny.texture);
	//var marker = new PIXI.Sprite(PIXI.loader.resources.marker.texture);
	//var table = new PIXI.Sprite(PIXI.loader.resources.table.texture);
	
	// Table geometry
	var table = new PIXI.Graphics();
	table.beginFill(colors.table);
	table.lineStyle(10, colors.tableBorder, 1);
	table.drawCircle(resolution.x / 2, resolution.y / 2, resolution.y / 2);
	table.endFill();
	stage.addChild(table);
	
	// Markers
	markerRenderer = new MarkerRenderer(90, 30, stage);

	// Start animation loop
	update();
}

function update() {
	
	// Update markers
	var markers = globalStore.getLastKnownMarkers(); //array of last known markers position
	for (var i = 0; i < markers.length; i++) {
		markerRenderer.update(markers[i]);    
	};
	
	
	// Render
	renderer.render(stage);
	requestAnimationFrame(update);
}


