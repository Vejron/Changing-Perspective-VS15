#pragma once
#include <opencv2\opencv.hpp>
#include <boost/accumulators/accumulators.hpp>
#include <boost/accumulators/statistics/stats.hpp>
#include <boost/accumulators/statistics/rolling_mean.hpp>
#include <iostream>
using namespace cv;
using namespace std;
using namespace boost::accumulators;

namespace marker_tracker
{
	class MovementFilter
	{
	public:
		MovementFilter(size_t);
		~MovementFilter();

		// @filter_distance in meters so 0.01 = 1 cm
		void filterInPlace(vector<int> &ids, vector<Vec3d> &rvecs, vector<Vec3d> &tvecs, double filter_distance = 0.01)
		{
			for (size_t i = 0; i < ids.size(); i++)
			{
				double x1 = tvecs[i][0]; double y1 = tvecs[i][1]; double z1 = tvecs[i][2]; // current position
				double x2 = previusMarkerPositions[ids[i]][0]; // previus
				double y2 = previusMarkerPositions[ids[i]][1];
				double z2 = previusMarkerPositions[ids[i]][2];
				
				// calc euclidian distance
				double distance = sqrt(pow(x1 - x2, 2.0) + pow(y1 - y2, 2.0) + pow(z1 - z2, 2.0));
				if (distance < filter_distance)
				{
					ids[i] = -1; // mark as non mover. Ugly, but check this in packer
				}
				// save old values
				previusMarkerPositions[ids[i]] = Vec3d(x1, y1, z1);
			}
		}

	private:
		size_t markerCount;
		Vec3d previusMarkerPositions[1024];
	};

	MovementFilter::MovementFilter(size_t marker_count)
	{
		markerCount = markerCount;
	}

	MovementFilter::~MovementFilter()
	{
	}

	class OneFilter
	{
	public:
		OneFilter() {};
		OneFilter(uint, size_t);
		~OneFilter();

		void add(const Vec3d &rvec, const Vec3d &tvec) 
		{
			(*accR0)(rvec[0]); (*accR1)(rvec[1]); (*accR2)(rvec[2]);
			(*accT0)(tvec[0]); (*accT1)(tvec[1]); (*accT2)(tvec[2]);
		}

		void get(Vec3d &rvec, Vec3d &tvec)
		{
			rvec[0] = rolling_mean((*accR0));
			rvec[1] = rolling_mean((*accR1));
			rvec[2] = rolling_mean((*accR2));

			tvec[0] = rolling_mean((*accT0));
			tvec[1] = rolling_mean((*accT1));
			tvec[2] = rolling_mean((*accT2));
		}

	private:
		int markerId;
		accumulator_set<double, stats<tag::rolling_mean>> *accT0;
		accumulator_set<double, stats<tag::rolling_mean>> *accT1;
		accumulator_set<double, stats<tag::rolling_mean>> *accT2;

		accumulator_set<double, stats<tag::rolling_mean>> *accR0;
		accumulator_set<double, stats<tag::rolling_mean>> *accR1;
		accumulator_set<double, stats<tag::rolling_mean>> *accR2;
	};

	OneFilter::OneFilter(uint markerId, size_t windowSize)
	{
		OneFilter::markerId = markerId;
		accT0 = new accumulator_set<double, stats<tag::rolling_mean>>(tag::rolling_window::window_size = windowSize);
		accT1 = new accumulator_set<double, stats<tag::rolling_mean>>(tag::rolling_window::window_size = windowSize);
		accT2 = new accumulator_set<double, stats<tag::rolling_mean>>(tag::rolling_window::window_size = windowSize);

		accR0 = new accumulator_set<double, stats<tag::rolling_mean>>(tag::rolling_window::window_size = windowSize);
		accR1 = new accumulator_set<double, stats<tag::rolling_mean>>(tag::rolling_window::window_size = windowSize);
		accR2 = new accumulator_set<double, stats<tag::rolling_mean>>(tag::rolling_window::window_size = windowSize);
	}

	OneFilter::~OneFilter()
	{
		delete accT0; delete accT1; delete accT2;
		delete accR0; delete accR1; delete accR2;
	}

	// EMA. exponential moving average (applies more weigth to resent values, thus following the marker faster)
	class jitterFilter
	{
	public:
		jitterFilter(size_t, size_t);
		~jitterFilter();

		void processInPlace(const vector<int> &, vector<Vec3d> &, vector<Vec3d> &);

	private:
		size_t markerCount;
		OneFilter *filterArray[1024];
		
		//accumulator_set<double, features<tag::mean, tag::variance>> acc;
	
	};

	void jitterFilter::processInPlace(const vector<int> &ids, vector<Vec3d> &rvecs, vector<Vec3d> &tvecs)
	{
		//markerFilters = new vector<OneFilter>(ids.size());
		// input
		for (size_t i = 0; i < ids.size(); i++)
		{
			filterArray[ids[i]]->add(rvecs[i], tvecs[i]);
		}

		// update output with filtered values
		for (size_t i = 0; i < ids.size(); i++)
		{
			filterArray[ids[i]]->get(rvecs[i], tvecs[i]);
		}
		
	}

	jitterFilter::jitterFilter(size_t marker_count, size_t window_size)
	{
		markerCount = marker_count;
		for (size_t i = 0; i < markerCount; i++)
		{
			filterArray[i] = new OneFilter(i, window_size);
		}
	}

	jitterFilter::~jitterFilter()
	{
		for (size_t i = 0; i < markerCount; i++)
		{
			delete filterArray[i];
		}
	}
}
