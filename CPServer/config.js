var env = process.env.NODE_ENV || "development";
//var settings = require("./settings.json")[env];

module.exports = {
	env: env,
	UDPmarkerTrackerPort: 666,	// Original Doom port number!
	viewClientPort: 1666,
	clientUpdateRate: 1000		// Intervall in ms between updates of marker positions. lower than 30 would be meningless due to camera capture rate
	//requirejsCommand: settings.requirejsCommand
};