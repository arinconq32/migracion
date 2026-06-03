import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  color?: "blue" | "green" | "purple" | "orange";
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon,
  color = "blue",
}) => {
  const colorClasses = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
  };

  const isPositive = change >= 0;

  return (
    <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-title-md font-bold text-black dark:text-white">
            {value}
          </h4>
          <span className="text-sm font-medium text-body">{title}</span>
        </div>

        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full ${colorClasses[color]}`}
        >
          <div className="text-white">{icon}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1">
        <span
          className={`flex items-center gap-1 text-sm font-medium ${
            isPositive ? "text-meta-3" : "text-meta-1"
          }`}
        >
          {isPositive ? "↑" : "↓"}
          {Math.abs(change)}%
        </span>
        <span className="text-sm font-medium text-body">desde el mes pasado</span>
      </div>
    </div>
  );
};

export default StatCard;
