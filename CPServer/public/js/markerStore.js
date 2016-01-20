/**
 *	One globalStore contains multiple (defult 16) tableStores
 *	witch in turn contains a dictionary for all the markers.
 *	each marker also contains a circular buffer history with the last 
 *	<markerBufferSize> values
**/

var circularBuffer = function (buffer_size) {
	
	var bufferSize = buffer_size > 0 ? buffer_size : 1; // At worst, make an array of size 1
	var buffer = new Array(bufferSize);
	
	var end = 0; // Index of last element.
	var start = 0; // Index of first element.
	var count = 0; // Count of elements
	
	// 'Private' function to push object onto buffer.
	this._push = function (obj) {
		buffer[end] = obj; // Write
		end++; // Advance        
		if (end == bufferSize) {
			end = 0; // Wrap if illegal
		}
		count++;
	}
	
	// 'Private' function to pop object from buffer. 
	this._pop = function () {
		var obj = buffer[start];
		start++;
		if (start == bufferSize) {
			start = 0; // Wrap
		}
		count--;
		return obj;
	}
	
	// Adds values to buffer.
	this.addValue = function (obj) {
		if (count < bufferSize) {
			// Just push
			this._push(obj);
		}
		else {
			// Pop, then push
			this._pop();
			this._push(obj);
		}
	}
	
	// Returns a value from the buffer.  Index is relative to current notional start.
	this.getValue = function (index) {
		
		if (index >= count || index < 0) return; // Catch attempt to access illegal index
		
		var i = index + start;
		
		if (i >= bufferSize) {
			i -= bufferSize;
		}
		
		return buffer[i];
	}
	
	// Returns the length of the buffer.
	this.getLength = function () {
		return count;
	}
	
	// Returns all items as strings, separated by optional delimiter.
	this.streamToString = function (delim) {
		
		delim = (typeof delim === "undefined") ? "\r\n" : delim; // Default syntax; Default to CRLF
		
		var strReturn = "";
		
		var once = 0;
		var index = 0;
		var read = index + start;
		for (; index < count; ++index) {
			if (once == 1) strReturn += delim.toString();
			strReturn += buffer[read].toString();
			read++;
			if (read >= bufferSize) read = 0;
			once = 1;
		}
		
		return strReturn;
	}
}



var tableStore = function (markerBufferSize) {
	var bufferSize = markerBufferSize;
	var markers = {};

	this.addMarker = function (marker) {
		// create new if its not in dictionary
		if (!markers.hasOwnProperty(marker.mId)) { 
			markers[marker.mId] = new circularBuffer(bufferSize);
		}
		markers[marker.mId].addValue(marker);
	};
	
	this.getMarkers = function () {
		return markers;
	};
};

var GlobalStore = function (markerBufferSize , nbrOfTables) {
	// Max lengt of buffers
	var bufferSize = markerBufferSize;
	// Uniqe tables
	var tableSize = nbrOfTables

	// Array of uniqe tables
	var tables = new Array(nbrOfTables);

	for (var i = 0; i < tableSize; i++) {
	    tables[i] = new tableStore(bufferSize)
	};
	
	// public interface
	this.addMarker = function (marker) {
		tables[marker.tId].addMarker(marker);
	};

	this.getTable = function (tableId) {
		if (tableId >= 0 && tableId < tableSize)
			return tables[tableId];
		else
			return undefined;
	};

	this.getTables = function () {
		return tables;
	};
	
	//server side
	this.getLastKnownMarkers = function () {
		var lastMarkers = [];
		tables.forEach(function (element, index, array) {
			var markers = element.getMarkers();
			// check each marker history
			for (var prop in markers) {
				if (markers.hasOwnProperty(prop)) {
					// add last added marker
					//console.log(prop);
					//console.log(markers[prop].getLength());
					//console.log(markers[prop].getValue(markers[prop].getLength() - 1));
					lastMarkers.push( markers[prop].getValue(markers[prop].getLength() - 1) );
				}
			}
		}, this);
		return lastMarkers;
	}

	this.getRecentMarkerMovement = function (timeFrame) {
		var recentMarkers = {};
		// cheack each table
		tables.forEach(function (element, index, array) {
			var markers = element.getMarkers();
			// check each marker history
			for (var prop in markers) {
				if (markers.hasOwnProperty(prop)) {
					var length = markers[prop].getLength();

					markers[prop].getValue(markers[prop].getLength());
				}
			}
		}, this);
	};
}

module.exports = GlobalStore;
