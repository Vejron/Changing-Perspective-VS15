#pragma once
#include <iostream>
#include <boost/array.hpp>
#include <boost/asio.hpp>

using namespace std;
using boost::asio::ip::udp;

// 7 * 4 = 28 bytes
struct MarkerPod
{
	uint16_t tableId;
	uint16_t markerId;		// read offset little endian 0
	float r0, r1, r2;	// 4, 8, 12
	float t0, t1, t2;	// 16, 20, 24
};

class UDPClient
{
public:
	UDPClient(
		boost::asio::io_service& io_service,
		const std::string& host,
		const std::string& port
		) : _io_service(io_service), _socket(io_service, udp::endpoint(udp::v4(), 0)) {
		udp::resolver resolver(_io_service);
		udp::resolver::query query(udp::v4(), host, port);
		_endpoint = *resolver.resolve(query);
	}

	~UDPClient()
	{
		_socket.close();
	}

	void send(const std::string& msg) {
		_socket.send_to(boost::asio::buffer(msg, msg.size()), _endpoint);
	}

	void send(const std::vector<MarkerPod>& msg) {
		_socket.send_to(boost::asio::buffer(msg), _endpoint);
	}

private:
	boost::asio::io_service& _io_service;
	udp::socket _socket;
	udp::endpoint _endpoint;
};