var randomColor = require('randomcolor');

// example markerData
var marker = {
	tId: 0,
	mId: 0,
	rvec: [0, 0, 0],
	tvec: [0, 0, 0],
	epoch: Date.now(),
	sensor1: 0,
	sensor2: 0,
	localTimeMs: Date.now()
};

function tvecToScreen(tvec) {
	// 0.7 meters, table in pix = 1080
	return {
		x: 1080 * tvec[0] + 1080/2,
		y: 1080 * tvec[1] + 1080/2
	};
};


var markerRenderer = function (nbrOfMarkers, radius, table) {
	
	//privates
	var _bufferSize = nbrOfMarkers;
	var _markerArray = new Array();
	var _width = 1920;
	var _height = 1080;
	var _magicScale = 1;
	
	this._createMarker = function (id, color, radius) {
		// Marker Shape
		var shape = new PIXI.Graphics();
		shape.beginFill(parseInt(color.replace(/^#/, ''), 16));
		shape.drawCircle(0, 0, radius);
		shape.endFill();
		
		// Marker Text (ID)
		var message = new PIXI.Text(id, {
			font: "18px sans-serif",
			fill: "black"
		});
		
		var marker = new PIXI.Container();
		marker.addChild(shape);
		marker.addChild(message);
		marker.visible = false; // start hidden
		
		return marker;
	};

	this._translateToTable = function(tvec) {
		return {
			x: tvec[0] * _width *  0.8,//_magicScale, //x;
			y: tvec[1] * _height * 1.4//_magicScale//y;
		};
	}
	// x 0.3 to -0.3 // y 0.23 to -0.23
	this.update = function (markerData) {
		var x, y;
		for (var i = 0; i < _bufferSize; i++) {
			if (markerData.mId === i) {
				_markerArray[i].visible = true
				var pos = this._translateToTable(markerData.tvec);
				_markerArray[i].position.set(pos.x + (_width / 2), pos.y + (_height / 2));
				//_markerArray[i].getChildAt(1).text = "posy: " + (pos.x + (_table.width / 2)) + " posx: " + (pos.y + (_table.height / 2));
				_markerArray[i].getChildAt(1).text = "posx: " + markerData.tvec[0]  + " posy: " + markerData.tvec[1];
				//TODO rotation comes in wierd rodriges format
				//_markerArray[i].rotation = Math.atan2(markerData.rvec[0], markerData.rvec[1]); //markerData.rvec[0]; //rotation around z-axis
				break;
			}
		};
	}
	
	for (var i = 0; i < _bufferSize; i++) {
		var marker = this._createMarker(i, randomColor(), radius);
		_markerArray.push(marker);
		table.addChild(marker);
	}
};

module.exports = markerRenderer;