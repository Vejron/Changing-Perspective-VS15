function _scaleToWindow(canvas, backgroundColor) {
	
	// Defualt color
	backgroundColor = backgroundColor || "#2C3539";
	var scaleX, scaleY, scale, center;
	
	// Scale the canvas to the correct size
	// Figure out the scale amount on each axis
	scaleX = window.innerWidth / canvas.width;
	scaleY = window.innerHeight / canvas.height;
	
	// Scale the canvas based on whichever value is less: `scaleX` or `scaleY`
	scale = Math.min(scaleX, scaleY);
	canvas.style.transformOrigin = "0 0";
	canvas.style.transform = "scale(" + scale + ")";
	
	// Center the canvas.
	// Decide whether to center the canvas vertically or horizontally.
	// Wide canvases should be centered vertically, and 
	// square or tall canvases should be centered horizontally
	if (canvas.width > canvas.height) {
		if (canvas.width * scale < window.innerWidth) {
			center = "horizontally";
		} else {
			center = "vertically";
		}
	} else {
		if (canvas.height * scale < window.innerHeight) {
			center = "vertically";
		} else {
			center = "horizontally";
		}
	}
	
	// Center horizontally (for square or tall canvases)
	var margin;
	if (center === "horizontally") {
		margin = (window.innerWidth - canvas.width * scale) / 2;
		canvas.style.marginLeft = margin + "px";
		canvas.style.marginRight = margin + "px";
	}
	
	// Center vertically (for wide canvases) 
	if (center === "vertically") {
		margin = (window.innerHeight - canvas.height * scale) / 2;
		canvas.style.marginTop = margin + "px";
		canvas.style.marginBottom = margin + "px";
	}
	
	// Remove any padding from the canvas  and body and set the canvas
	// display style to "block"
	canvas.style.paddingLeft = 0;
	canvas.style.paddingRight = 0;
	canvas.style.paddingTop = 0;
	canvas.style.paddingBottom = 0;
	canvas.style.display = "block";
	
	// Set the color of the HTML body background
	document.body.style.backgroundColor = backgroundColor;
	
	// Fix some quirkiness in scaling for Safari
	var ua = navigator.userAgent.toLowerCase();
	if (ua.indexOf("safari") != -1) {
		if (ua.indexOf("chrome") > -1) {
      // Chrome
		} else {
			// Safari
			canvas.style.maxHeight = "100%";
			canvas.style.minHeight = "100%";
		}
	}
	
	//for correct hit testing between the pointer and sprites
	return scale;
}

// god to have
function updatePose(id, error, rotation, translation) {
	var yaw = -Math.atan2(rotation[0][2], rotation[2][2]);
	var pitch = -Math.asin(-rotation[1][2]);
	var roll = Math.atan2(rotation[1][0], rotation[1][1]);
	
	var d = document.getElementById(id);
	d.innerHTML = " error: " + error 
                  + "<br/>" 
                  + " x: " + (translation[0] | 0) 
                  + " y: " + (translation[1] | 0) 
                  + " z: " + (translation[2] | 0) 
                  + "<br/>" 
                  + " yaw: " + Math.round(-yaw * 180.0 / Math.PI) 
                  + " pitch: " + Math.round(-pitch * 180.0 / Math.PI) 
                  + " roll: " + Math.round(roll * 180.0 / Math.PI);
};



module.exports = {
	scaleToWindow: _scaleToWindow
};