// Björn Yttergren
// Modified sample to output whole dictionary to specified directory
// Usage: MarkerGenerator -d=5 dirName

#include <opencv2/highgui.hpp>
#include <opencv2/aruco.hpp>
#include <Windows.h>
#include <sstream>
#include <locale>
#include <codecvt>

using namespace std;
using namespace cv;

wstring s2ws(const std::string& str)
{
	typedef std::codecvt_utf8<wchar_t> convert_typeX;
	std::wstring_convert<convert_typeX, wchar_t> converterX;

	return converterX.from_bytes(str);
}

string ws2s(const std::wstring& wstr)
{
	typedef std::codecvt_utf8<wchar_t> convert_typeX;
	std::wstring_convert<convert_typeX, wchar_t> converterX;

	return converterX.to_bytes(wstr);
}

namespace {
const char* about = "Create an ArUco marker collection";
const char* keys  =
        "{@dir	   |<none> | Output directory }"
        "{d        |       | dictionary: DICT_4X4_50=0, DICT_4X4_100=1, DICT_4X4_250=2,"
        "DICT_4X4_1000=3, DICT_5X5_50=4, DICT_5X5_100=5, DICT_5X5_250=6, DICT_5X5_1000=7, "
        "DICT_6X6_50=8, DICT_6X6_100=9, DICT_6X6_250=10, DICT_6X6_1000=11, DICT_7X7_50=12,"
        "DICT_7X7_100=13, DICT_7X7_250=14, DICT_7X7_1000=15, DICT_ARUCO_ORIGINAL = 16}"
        "{ms       | 200   | Marker size in pixels }"
        "{bb       | 1     | Number of bits in marker borders }";
}


int main(int argc, char *argv[]) {
    CommandLineParser parser(argc, argv, keys);
    parser.about(about);

    if(argc < 3) {
        parser.printMessage();
        return 0;
    }

    int dictionaryId = parser.get<int>("d");
    int borderBits = parser.get<int>("bb");
    int markerSize = parser.get<int>("ms");

    string folderName = parser.get<string>(0);

    if(!parser.check()) {
        parser.printErrors();
        return 0;
    }

	if (CreateDirectory(s2ws(folderName).c_str(), NULL))
	{
		// Directory created
		aruco::Dictionary dictionary =
			aruco::getPredefinedDictionary(aruco::PREDEFINED_DICTIONARY_NAME(dictionaryId));

		stringstream ss;
		string name = "marker_";
		string type = ".png";
		Mat markerImg;

		for (int i = 0; i < dictionary.bytesList.rows; i++)
		{
			aruco::drawMarker(dictionary, i, markerSize, markerImg, borderBits);
			imshow("Output", markerImg);
			waitKey(25);

			ss << folderName << "\\" << name << i << type;
			string fullPath = ss.str();
			ss.str("");

			imwrite(fullPath, markerImg);
		}
	}

    return 0;
}
