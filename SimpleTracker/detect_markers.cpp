#include <opencv2\imgproc.hpp>
#include <opencv2/highgui.hpp>
#include <opencv2/aruco.hpp>
#include <iostream>
#include <boost/asio.hpp>
#include <boost/date_time/posix_time/posix_time.hpp>

#include "aruco_pre_filter.h"
#include "jitter_filter.h"
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
	double markerLength = 0.065;
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

static int64_t milliSecondsSinceEpoch()
{
	using boost::gregorian::date;
	using boost::posix_time::ptime;
	using boost::posix_time::microsec_clock;

	static ptime const epoch(date(1970, 1, 1));
	return (microsec_clock::universal_time() - epoch).total_milliseconds();
}

static void filterOnDistance(vector<Vec3d> &rvecs, vector<Vec3d> &tvecs, vector<int> &ids, double near_clip = 0.3, double far_clip = 1.7)
{
	vector< int > _ids;
	vector< Vec3d > _rvecs, _tvecs;

	// filter out sane markers based on distance from camera
	for (size_t i = 0; i < ids.size(); i++)
	{
		if ((tvecs[i][2] > near_clip) && (tvecs[i][2] < far_clip))
		{
			// valid marker
			_ids.push_back(ids[i]);
			_rvecs.push_back(rvecs[i]);
			_tvecs.push_back(tvecs[i]);
		}
	}
	// copy back to original containers
	ids = _ids;
	rvecs = _rvecs;
	tvecs = _tvecs;
}


static vector<MarkerPod> makeBinaryPacket(const int tableId, const vector<Vec3d> &rvecs, const vector<Vec3d> &tvecs, const vector<int> &ids, double near_clip = 0.3, double far_clip = 1.7)
{
	vector<MarkerPod> packet;
	for (size_t i = 0; i < ids.size(); i++)
	{
		// filter out markers with unrealistic z-value (TODO: refactor)
		if (ids[i] != -1 && (tvecs[i][2] > near_clip) && (tvecs[i][2] < far_clip))
		{
			//convert rodriges (compact axis angle) to euler
			/*Matx33d o(m(0), m(1), m(2),
				m(3), m(4), m(5),
				m(6), m(7), m(8));*/
			Matx33d rt;
			Rodrigues(rvecs[i], rt);
			double r0, r1, r2;
			r0 = atan2(rt.val[5], rt.val[8]);
			r1 = atan2(-rt.val[2], sqrt(rt.val[0]* rt.val[0] + rt.val[1] * rt.val[1]));
			r2 = atan2(rt.val[1], rt.val[0]);

			MarkerPod p{ tableId,
						ids[i],
						r0, r1, r2,
						//rvecs[i][0], rvecs[i][1], rvecs[i][2],
						tvecs[i][0], tvecs[i][1], tvecs[i][2],
						milliSecondsSinceEpoch() };
			packet.push_back(p);
		}
		else
		{
			if (ids[i] != -1)
				cout << "INFO: Unrealistic marker position detetected. Z = " << tvecs[i][2] << endl;
			//else
			//	cout << "filtered out";
		}
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

static void getEulerAngles(Mat &rotCamerMatrix, Vec3d &eulerAngles) {

	Mat cameraMatrix, rotMatrix, transVect, rotMatrixX, rotMatrixY, rotMatrixZ;
	double* _r = rotCamerMatrix.ptr<double>();
	double projMatrix[12] = { _r[0],_r[1],_r[2],0,
		_r[3],_r[4],_r[5],0,
		_r[6],_r[7],_r[8],0 };

	decomposeProjectionMatrix(Mat(3, 4, CV_64FC1, projMatrix),
		cameraMatrix,
		rotMatrix,
		transVect,
		rotMatrixX,
		rotMatrixY,
		rotMatrixZ,
		eulerAngles);
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

	// Create a window
	namedWindow("out");
	//Create trackbar to change brightness
	int threshold = 128;
	createTrackbar("Threshold", "out", &threshold, 255);

	// Udp test
	try
	{
		boost::asio::io_service io_service;
		UDPClient client(io_service, "localhost", "666");
		aruco_pre_filter::filter filter;
		marker_tracker::jitterFilter smoothing(90, 5);
		marker_tracker::MovementFilter moveFilter(90);
		
		while (inputVideo.grab()) {
			inputVideo.retrieve(image);
			image.copyTo(imageCopy);
			//filter.process(image, image, threshold);

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

				//smooth movement
				smoothing.processInPlace(ids, rvecs, tvecs);
				moveFilter.filterInPlace(ids, rvecs, tvecs);
				//transmit to server
				auto p = makeBinaryPacket(settings.tableId, rvecs, tvecs, ids);
				if (p.size() > 0)
					cout << "Transmited " << p.size() << " marker updates" << endl;
				client.send(p);
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
			
			if (ids.size() > 0) 
			{
				aruco::drawDetectedMarkers(imageCopy, corners, ids);
				for (unsigned int i = 0; i < ids.size(); i++)
					aruco::drawAxis(imageCopy, settings.camMatrix, settings.distCoeffs, rvecs[i], tvecs[i],
						settings.markerLength * 0.5f);
			}

			if (settings.showRejected && rejected.size() > 0)
				aruco::drawDetectedMarkers(imageCopy, rejected, noArray(), Scalar(100, 0, 255));

			//draw debug text
			if (ids.size() > 0)
			{
				stringstream ss;
				for (size_t i = 0; i < ids.size(); i++)
				{
					ss << "Translation:" << std::setprecision(3) << tvecs[i];

					putText(imageCopy, ss.str(), Point(10, 20 + i * 30), FONT_HERSHEY_SIMPLEX, 0.5, Scalar(255, 0, 0), 2);
					ss.str("");
				}
			}

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
