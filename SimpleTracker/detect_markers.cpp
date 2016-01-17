/*
By downloading, copying, installing or using the software you agree to this
license. If you do not agree to this license, do not download, install,
copy or use the software.

                          License Agreement
               For Open Source Computer Vision Library
                       (3-clause BSD License)

Copyright (C) 2013, OpenCV Foundation, all rights reserved.
Third party copyrights are property of their respective owners.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice,
    this list of conditions and the following disclaimer.

  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation
    and/or other materials provided with the distribution.

  * Neither the names of the copyright holders nor the names of the contributors
    may be used to endorse or promote products derived from this software
    without specific prior written permission.

This software is provided by the copyright holders and contributors "as is" and
any express or implied warranties, including, but not limited to, the implied
warranties of merchantability and fitness for a particular purpose are
disclaimed. In no event shall copyright holders or contributors be liable for
any direct, indirect, incidental, special, exemplary, or consequential damages
(including, but not limited to, procurement of substitute goods or services;
loss of use, data, or profits; or business interruption) however caused
and on any theory of liability, whether in contract, strict liability,
or tort (including negligence or otherwise) arising in any way out of
the use of this software, even if advised of the possibility of such damage.
*/


#include <opencv2/highgui.hpp>
#include <opencv2/aruco.hpp>
#include <iostream>
#include <boost/asio.hpp>

#include "UDPClient.h"

using namespace std;
using namespace cv;
using boost::asio::ip::udp;

namespace {
const char* about = "Basic marker detection";
const char* keys  =
        "{d        |       | dictionary: DICT_4X4_50=0, DICT_4X4_100=1, DICT_4X4_250=2,"
        "DICT_4X4_1000=3, DICT_5X5_50=4, DICT_5X5_100=5, DICT_5X5_250=6, DICT_5X5_1000=7, "
        "DICT_6X6_50=8, DICT_6X6_100=9, DICT_6X6_250=10, DICT_6X6_1000=11, DICT_7X7_50=12,"
        "DICT_7X7_100=13, DICT_7X7_250=14, DICT_7X7_1000=15, DICT_ARUCO_ORIGINAL = 16}"
        "{v        |       | Input from video file, if ommited, input comes from camera }"
        "{ci       | 0     | Camera id if input doesnt come from video (-v) }"
        "{c        |       | Camera intrinsic parameters. Needed for camera pose }"
        "{l        | 0.1   | Marker side lenght (in meters). Needed for correct scale in camera pose }"
        "{dp       |       | File of marker detector parameters }"
        "{r        |       | show rejected candidates too }"
		"{s		   |	   | show debug view }";
}
// Usage: SimpleTracker.exe -d=5 --ci=0 -c=calibrationStudioHD.xml --dp=detector_params.yml -r=true

struct DetectorSettings
{
	int tableId = 0;
	int camId = 0;
	int dictionaryId = 5;
	float markerLength = 0.1f;
	bool showRejected = false;
	bool showDebugView = false;
	string paramsFile;
	string calibrationFile;
	Mat camMatrix;
	Mat distCoeffs;
	aruco::DetectorParameters params;
};

/**
*/
static bool readCameraParameters(string filename, Mat &camMatrix, Mat &distCoeffs) {
	FileStorage fs(filename, FileStorage::READ);
	if (!fs.isOpened())
		return false;
	fs["camera_matrix"] >> camMatrix;
	fs["distortion_coefficients"] >> distCoeffs;
	return true;
}

/**
*/
static bool readDetectorParameters(string filename, aruco::DetectorParameters &params) {
	FileStorage fs(filename, FileStorage::READ);
	if (!fs.isOpened())
		return false;
	fs["adaptiveThreshWinSizeMin"] >> params.adaptiveThreshWinSizeMin;
	fs["adaptiveThreshWinSizeMax"] >> params.adaptiveThreshWinSizeMax;
	fs["adaptiveThreshWinSizeStep"] >> params.adaptiveThreshWinSizeStep;
	fs["adaptiveThreshConstant"] >> params.adaptiveThreshConstant;
	fs["minMarkerPerimeterRate"] >> params.minMarkerPerimeterRate;
	fs["maxMarkerPerimeterRate"] >> params.maxMarkerPerimeterRate;
	fs["polygonalApproxAccuracyRate"] >> params.polygonalApproxAccuracyRate;
	fs["minCornerDistanceRate"] >> params.minCornerDistanceRate;
	fs["minDistanceToBorder"] >> params.minDistanceToBorder;
	fs["minMarkerDistanceRate"] >> params.minMarkerDistanceRate;
	fs["doCornerRefinement"] >> params.doCornerRefinement;
	fs["cornerRefinementWinSize"] >> params.cornerRefinementWinSize;
	fs["cornerRefinementMaxIterations"] >> params.cornerRefinementMaxIterations;
	fs["cornerRefinementMinAccuracy"] >> params.cornerRefinementMinAccuracy;
	fs["markerBorderBits"] >> params.markerBorderBits;
	fs["perspectiveRemovePixelPerCell"] >> params.perspectiveRemovePixelPerCell;
	fs["perspectiveRemoveIgnoredMarginPerCell"] >> params.perspectiveRemoveIgnoredMarginPerCell;
	fs["maxErroneousBitsInBorderRate"] >> params.maxErroneousBitsInBorderRate;
	fs["minOtsuStdDev"] >> params.minOtsuStdDev;
	fs["errorCorrectionRate"] >> params.errorCorrectionRate;
	return true;
}

/**
*/
static bool readTableConfiguration(string filename, DetectorSettings &settings)
{
	FileStorage fs(filename, FileStorage::READ);
	if (!fs.isOpened())
		return false;
	fs["tableID"] >> settings.tableId;
	fs["cameraDeviceNbr"] >> settings.camId;
	fs["cameraCalibrationFile"] >> settings.calibrationFile;
	fs["detectorParametersFile"] >> settings.paramsFile;
	fs["markerDictionary"] >> settings.dictionaryId;
	fs["markerLength"] >> settings.markerLength;

	if ((bool)fs["useDefaultParameters"].node == false)
	{
		if (!readDetectorParameters(settings.paramsFile, settings.params))
		{
			cerr << "Invalid detector parameters file" << endl;
			return false;
		}
	}

	if (!readCameraParameters(settings.calibrationFile, settings.camMatrix, settings.distCoeffs)) 
	{
		cerr << "Invalid camera calibration file" << endl;
		return false;
	}
	return true;
}

static vector<MarkerPod> makeBinaryPacket(const vector<Vec3d> &rvecs, const vector<Vec3d> &tvecs, const vector<int> &ids)
{
	vector<MarkerPod> packet;
	for (size_t i = 0; i < ids.size(); i++)
	{
		MarkerPod p{ids[i], rvecs[i][0], rvecs[i][1], rvecs[i][2], tvecs[i][0], tvecs[i][1], tvecs[i][2]};
		packet.push_back(p);
	}
	return packet;
}

/**
 */
static string makeJsonPacket(const vector<Vec3d> &rvecs, const vector<Vec3d> &tvecs, const vector<int> &ids)
{
	// transform into json array
	std::stringstream jsonPacket;
	jsonPacket << "{ \"t\":[";
	for (size_t i = 0; i < ids.size(); i++)
	{
		// rotation
		float r0 = rvecs[i][0];
		float r1 = rvecs[i][1];
		float r2 = rvecs[i][2];

		// translation
		float t0 = tvecs[i][0];
		float t1 = tvecs[i][1];
		float t2 = tvecs[i][2];

		jsonPacket << '{'
			<< "\"id\":" << ids[i] << ','
			<< "\"r0\":" << r0 << ','
			<< "\"r1\":" << r1 << ','
			<< "\"r2\":" << r2 << ','
			<< "\"t0\":" << t0 << ','
			<< "\"t1\":" << t1 << ','
			<< "\"t2\":" << t2 << '}';
		if (i < ids.size() - 1)
			jsonPacket << ',';
	}
	jsonPacket << "]}";

	return jsonPacket.str();
}

/**
 */
int main(int argc, char *argv[]) 
{
    CommandLineParser parser(argc, argv, keys);
    parser.about(about);

	if (argc < 1)
	{
		parser.printMessage();
		return 0;
	}

	DetectorSettings settings;
	settings.showRejected = parser.has("r");
	//settings.showDebugView = parser.has("s");

	if (parser.has("c"))
	{
		if (!readTableConfiguration(parser.get<string>("c"), settings))
		{
			cerr << "Invalid table configuration file" << endl;
			return 0;
		}
	}

  
    //settings.params.doCornerRefinement = true; // do corner refinement in markers

    if(!parser.check()) {
        parser.printErrors();
        return 0;
    }

    aruco::Dictionary dictionary = aruco::getPredefinedDictionary(aruco::PREDEFINED_DICTIONARY_NAME(settings.dictionaryId));

   
    VideoCapture inputVideo(settings.camId); // + CAP_MSMF
  
    double totalTime = 0;
    int totalIterations = 0;
	Mat image, imageCopy;

	// Udp test
	try
	{
		boost::asio::io_service io_service;
		UDPClient client(io_service, "localhost", "666");
		
		while (inputVideo.grab()) {
			inputVideo.retrieve(image);


			double tick = (double)getTickCount();

			vector< int > ids;
			vector< vector< Point2f > > corners, rejected;
			vector< Vec3d > rvecs, tvecs;

			// detect markers and estimate pose
			aruco::detectMarkers(image, dictionary, corners, ids, settings.params, rejected);
			if (ids.size() > 0)
			{
				aruco::estimatePoseSingleMarkers(corners, settings.markerLength,
												 settings.camMatrix, settings.distCoeffs, rvecs, tvecs);

				auto p = makeBinaryPacket(rvecs, tvecs, ids);
				client.send(p);
				//client.send(makeJsonPacket(rvecs, tvecs, ids));
			}

			double currentTime = ((double)getTickCount() - tick) / getTickFrequency();
			totalTime += currentTime;
			totalIterations++;
			if (totalIterations % 30 == 0) {
				cout << "Detection Time = " << currentTime * 1000 << " ms "
					<< "(Mean = " << 1000 * totalTime / double(totalIterations) << " ms) "
					<< "Detected Markers = " << ids.size() << endl;
			}

			// draw results
			image.copyTo(imageCopy);
			if (ids.size() > 0) {
				aruco::drawDetectedMarkers(imageCopy, corners, ids);
				for (unsigned int i = 0; i < ids.size(); i++)
					aruco::drawAxis(imageCopy, settings.camMatrix, settings.distCoeffs, rvecs[i], tvecs[i],
						settings.markerLength * 0.5f);
			}

			if (settings.showRejected && rejected.size() > 0)
				aruco::drawDetectedMarkers(imageCopy, rejected, noArray(), Scalar(100, 0, 255));

			imshow("out", imageCopy);
			char key = (char)waitKey(10);
			if (key == 27) break;
		}
	}
	catch (const std::exception& e)
	{
		std::cerr << "Exception: " << e.what() << "\n";
	}
	
  
    return 0;
}
