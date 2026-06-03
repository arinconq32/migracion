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

// Marketing Metrics Component
const MarketingMetrics = () => {
  const metrics = [
    {
      title: "Campaign ROI",
      value: "342%",
      change: "+24.5%",
      isPositive: true,
      icon: "📈",
    },
    {
      title: "Leads Generated",
      value: "2,845",
      change: "+18.2%",
      isPositive: true,
      icon: "👥",
    },
    {
      title: "Conversion Rate",
      value: "12.8%",
      change: "+3.4%",
      isPositive: true,
      icon: "🎯",
    },
    {
      title: "Email CTR",
      value: "8.6%",
      change: "-1.2%",
      isPositive: false,
      icon: "📧",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
      {metrics.map((metric, index) => (
        <div
          key={index}
          className="rounded-2xl border border-gray-200 bg-white px-6 py-5 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {metric.title}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">
                {metric.value}
              </h3>
              <div
                className={`mt-2 text-sm font-medium ${
                  metric.isPositive
                    ? "text-green-600 dark:text-green-500"
                    : "text-red-600 dark:text-red-500"
                }`}
              >
                {metric.change}
              </div>
            </div>
            <div className="text-3xl">{metric.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Active Campaigns Component
const ActiveCampaigns = () => {
  const campaigns = [
    {
      name: "Summer Sale 2026",
      status: "Active",
      budget: "$12,500",
      spent: "$8,234",
      progress: 66,
    },
    {
      name: "Product Launch",
      status: "Active",
      budget: "$25,000",
      spent: "$15,678",
      progress: 63,
    },
    {
      name: "Email Newsletter",
      status: "Active",
      budget: "$5,000",
      spent: "$4,123",
      progress: 82,
    },
    {
      name: "Social Media Ads",
      status: "Active",
      budget: "$8,500",
      spent: "$2,456",
      progress: 29,
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Active Campaigns
      </h3>
      <div className="space-y-5">
        {campaigns.map((campaign, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-sm font-medium text-gray-800 dark:text-white">
                  {campaign.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {campaign.spent} of {campaign.budget}
                </p>
              </div>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {campaign.status}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-2 rounded-full bg-brand-500"
                style={{ width: `${campaign.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Channel Performance Component
const ChannelPerformance = () => {
  const channels = [
    { name: "Email Marketing", leads: 1245, cost: "$2,345", roi: "245%" },
    { name: "Social Media", leads: 982, cost: "$3,456", roi: "189%" },
    { name: "Google Ads", leads: 756, cost: "$5,678", roi: "132%" },
    { name: "Content Marketing", leads: 543, cost: "$1,234", roi: "298%" },
    { name: "Referral Program", leads: 432, cost: "$567", roi: "412%" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Channel Performance
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="pb-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                Channel
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                Leads
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                Cost
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                ROI
              </th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel, index) => (
              <tr
                key={index}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-3 text-sm text-gray-800 dark:text-white">
                  {channel.name}
                </td>
                <td className="py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                  {channel.leads}
                </td>
                <td className="py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                  {channel.cost}
                </td>
                <td className="py-3 text-right text-sm font-medium text-green-600 dark:text-green-500">
                  {channel.roi}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function Marketing() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
          Marketing Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Track your marketing campaigns and ROI
        </p>
      </div>

      <MarketingMetrics />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LineChartOne />
        <BarChartOne />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActiveCampaigns />
        <ChannelPerformance />
      </div>
    </div>
  );
}
