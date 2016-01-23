#pragma once
#include <opencv2\opencv.hpp>
using namespace cv;

namespace aruco_pre_filter
{
	class filter
	{
	public:
		void process(const Mat &,  Mat &, uint32_t );
		filter();
		~filter();

	private:
		/** \brief Original image */
		Mat I;

		/** \brief Filtered image */
		Mat I_filtered;
	};

	void filter::process(const Mat &original_image, Mat &filtred_image, uint32_t level)
	{
		cvtColor(original_image, I, ColorConversionCodes::COLOR_BGR2GRAY);
		GaussianBlur(I, I_filtered, Size(0, 0), 2);
		addWeighted(I, 2.5, I_filtered, -1.5, 0, I_filtered);
		equalizeHist(I_filtered, I_filtered);
		threshold(I_filtered, I_filtered, level, 0, ThresholdTypes::THRESH_TOZERO);

		I_filtered.copyTo(filtred_image);
	}

	filter::filter()
	{
	}

	filter::~filter()
	{
	}
}
