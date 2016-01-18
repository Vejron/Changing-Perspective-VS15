//browserify client.js - o bundle.js
//browserify -g uglifyify ./index.js > bundle.js
//
var PIXI = require('pixi.js');
var $ = require('jquery');
var io = require('socket.io-client');
var Buffer = require('buffer').Buffer;

var socket = io.connect();

socket.on('markers', function (arrbuf) {
    var buf = new Buffer(arrbuf);
    var packetSize = 36;

    if (buf.length % packetSize === 0) {
        for (var i = 0, j = 0; i < buf.length; i += packetSize, j++) {
            var marker = {
                tId: buf.readUInt16LE(i + 0),
                mId: buf.readUInt16LE(i + 2),
                rvec: [buf.readFloatLE(i + 4), buf.readFloatLE(i + 8), buf.readFloatLE(i + 12)],
                tvec: [buf.readFloatLE(i + 18), buf.readFloatLE(i + 20), buf.readFloatLE(i + 24)],
                sensor1: buf.readFloatLE(i + 28),
                sensor2: buf.readFloatLE(i + 32)
            }
        }
    }
    console.log(marker);
});

var resolution = {
	x: 800,
	y: 800
}

// Pixi setup
var renderer = new PIXI.WebGLRenderer(resolution.x, resolution.y, { backgroundColor: 0x000000, antialias: true });
$('#renderContainer').append(renderer.view);
var stage = new PIXI.Container();

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
	table.beginFill(0xe74c3c);
	table.drawCircle(resolution.x / 2, resolution.y / 2, resolution.x / 2);
	table.endFill();
	stage.addChild(table);

	// Start animation loop
	update();
}

function update() {
	
	// Render
	renderer.render(stage);
	requestAnimationFrame(update);
}

//// load the texture we need 
//PIXI.loader.add('bunny', 'images/bunny.png').load(function (loader, resources) {
//	// This creates a texture from a 'bunny.png' image. 
//	bunny = new PIXI.Sprite(resources.bunny.texture);
//	console.log(bunny);
	
//	// Setup the position and scale of the bunny 
//	bunny.position.x = 400;
//	bunny.position.y = 300;
	
//	bunny.scale.x = 2;
//	bunny.scale.y = 2;
	
//	// Add the bunny to the scene we are building. 
//	stage.addChild(bunny);
	
//	// kick off the animation loop (defined below) 
//	animate();
//});

//function animate() {
//	// start the timer for the next animation loop 
//	requestAnimationFrame(animate);
	
//	// each frame we spin the bunny around a bit 
//	bunny.rotation += 0.01;
	
//	// this is the main render call that makes pixi draw your container and its children. 
//	renderer.render(stage);
//}