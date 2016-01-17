var socket = io.connect();

socket.on('markers', function (data) {
	console.log(data);
});