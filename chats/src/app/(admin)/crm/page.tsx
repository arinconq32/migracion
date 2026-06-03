"use client";
import React from "react";
import dynamic from "next/dynamic";

// Load chart only on client side
const LineChartOne = dynamic(() => import("@/components/charts/line/LineChartOne"), {
  ssr: false,
});

// CRM Metrics Component
const CRMMetrics = () => {
  const metrics = [
    {
      title: "Total Customers",
      value: "3,456",
      change: "+12.5%",
      isPositive: true,
      icon: "👥",
    },
    {
      title: "Active Deals",
      value: "145",
      change: "+8.3%",
      isPositive: true,
      icon: "💼",
    },
    {
      title: "Deal Value",
      value: "$482K",
      change: "+15.2%",
      isPositive: true,
      icon: "💰",
    },
    {
      title: "Win Rate",
      value: "68.4%",
      change: "+3.1%",
      isPositive: true,
      icon: "🎯",
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

// Sales Pipeline Component
const SalesPipeline = () => {
  const stages = [
    { name: "Lead", deals: 45, value: "$125K", color: "bg-blue-500" },
    { name: "Qualified", deals: 32, value: "$198K", color: "bg-indigo-500" },
    { name: "Proposal", deals: 18, value: "$234K", color: "bg-purple-500" },
    { name: "Negotiation", deals: 12, value: "$156K", color: "bg-pink-500" },
    { name: "Closed Won", deals: 8, value: "$98K", color: "bg-green-500" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Sales Pipeline
      </h3>
      <div className="space-y-4">
        {stages.map((stage, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {stage.name}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {stage.deals} deals
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {stage.value}
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-2 rounded-full ${stage.color}`}
                style={{ width: `${(stage.deals / 45) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Recent Customers Component
const RecentCustomers = () => {
  const customers = [
    {
      name: "John Anderson",
      email: "john@company.com",
      company: "Tech Corp",
      value: "$45,000",
      status: "Active",
    },
    {
      name: "Sarah Williams",
      email: "sarah@startup.io",
      company: "Startup Inc",
      value: "$32,500",
      status: "Active",
    },
    {
      name: "Michael Brown",
      email: "mike@enterprise.com",
      company: "Enterprise Co",
      value: "$78,900",
      status: "Negotiation",
    },
    {
      name: "Emma Davis",
      email: "emma@agency.com",
      company: "Creative Agency",
      value: "$21,300",
      status: "Active",
    },
    {
      name: "James Wilson",
      email: "james@business.com",
      company: "Business Ltd",
      value: "$54,200",
      status: "Lead",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Negotiation":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Lead":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Recent Customers
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="pb-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                Customer
              </th>
              <th className="pb-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                Company
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                Value
              </th>
              <th className="pb-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer, index) => (
              <tr
                key={index}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-white">
                      {customer.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {customer.email}
                    </div>
                  </div>
                </td>
                <td className="py-3 text-sm text-gray-600 dark:text-gray-400">
                  {customer.company}
                </td>
                <td className="py-3 text-right text-sm font-medium text-gray-800 dark:text-white">
                  {customer.value}
                </td>
                <td className="py-3 text-right">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
                      customer.status
                    )}`}
                  >
                    {customer.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Activities Component
const RecentActivities = () => {
  const activities = [
    {
      type: "Call",
      customer: "John Anderson",
      action: "Scheduled follow-up call",
      time: "2 hours ago",
    },
    {
      type: "Email",
      customer: "Sarah Williams",
      action: "Sent proposal",
      time: "5 hours ago",
    },
    {
      type: "Meeting",
      customer: "Michael Brown",
      action: "Product demo completed",
      time: "1 day ago",
    },
    {
      type: "Note",
      customer: "Emma Davis",
      action: "Added contact notes",
      time: "2 days ago",
    },
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Call":
        return "📞";
      case "Email":
        return "📧";
      case "Meeting":
        return "👥";
      case "Note":
        return "📝";
      default:
        return "📌";
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Recent Activities
      </h3>
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="text-2xl">{getTypeIcon(activity.type)}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-800 dark:text-white">
                  {activity.customer}
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {activity.time}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {activity.action}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function CRM() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
          CRM Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your customer relationships and sales pipeline
        </p>
      </div>

      <CRMMetrics />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineChartOne />
        </div>
        <SalesPipeline />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentCustomers />
        </div>
        <RecentActivities />
      </div>
    </div>
  );
}
