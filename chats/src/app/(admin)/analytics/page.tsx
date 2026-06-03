"use client";
import React from "react";
import dynamic from "next/dynamic";

// Load charts only on client side
const LineChartOne = dynamic(() => import("@/components/charts/line/LineChartOne"), {
  ssr: false,
});
const BarChartOne = dynamic(() => import("@/components/charts/bar/BarChartOne"), {
  ssr: false,
});

// Analytics Metrics Component
const AnalyticsMetrics = () => {
  const metrics = [
    {
      title: "Total Visits",
      value: "45,672",
      change: "+12.5%",
      isPositive: true,
    },
    {
      title: "Page Views",
      value: "156,234",
      change: "+8.3%",
      isPositive: true,
    },
    {
      title: "Bounce Rate",
      value: "32.4%",
      change: "-2.1%",
      isPositive: true,
    },
    {
      title: "Avg. Session",
      value: "4m 32s",
      change: "+15.2%",
      isPositive: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
      {metrics.map((metric, index) => (
        <div
          key={index}
          className="rounded-2xl border border-gray-200 bg-white px-6 py-5 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {metric.title}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">
                {metric.value}
              </h3>
            </div>
            <div
              className={`text-sm font-medium ${
                metric.isPositive
                  ? "text-green-600 dark:text-green-500"
                  : "text-red-600 dark:text-red-500"
              }`}
            >
              {metric.change}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Traffic Sources Component
const TrafficSources = () => {
  const sources = [
    { name: "Organic Search", value: "45.2%", visitors: "18,956" },
    { name: "Direct", value: "28.3%", visitors: "11,843" },
    { name: "Social Media", value: "18.5%", visitors: "7,748" },
    { name: "Referral", value: "8.0%", visitors: "3,352" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Traffic Sources
      </h3>
      <div className="space-y-4">
        {sources.map((source, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {source.name}
              </span>
              <span className="text-sm font-medium text-gray-800 dark:text-white">
                {source.value}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-2 rounded-full bg-brand-500"
                  style={{ width: source.value }}
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {source.visitors}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Top Pages Component
const TopPages = () => {
  const pages = [
    { path: "/", views: "12,543", bounceRate: "32.1%" },
    { path: "/products", views: "8,932", bounceRate: "28.5%" },
    { path: "/about", views: "6,234", bounceRate: "45.2%" },
    { path: "/blog", views: "5,678", bounceRate: "38.7%" },
    { path: "/contact", views: "3,456", bounceRate: "52.3%" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Top Pages
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="pb-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                Page
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                Views
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                Bounce Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page, index) => (
              <tr
                key={index}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-3 text-sm text-gray-800 dark:text-white">
                  {page.path}
                </td>
                <td className="py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                  {page.views}
                </td>
                <td className="py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                  {page.bounceRate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
          Analytics Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Monitor your website performance and user behavior
        </p>
      </div>

      <AnalyticsMetrics />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LineChartOne />
        <BarChartOne />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TrafficSources />
        <TopPages />
      </div>
    </div>
  );
}
