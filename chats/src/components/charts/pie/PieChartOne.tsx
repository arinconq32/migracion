"use client";
import React, { useEffect, useRef, useState } from "react";
import ApexCharts from "apexcharts";
import type { ApexOptions } from "apexcharts";

const PieChartOne: React.FC = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ApexCharts | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check if dark mode is enabled
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    const options: ApexOptions = {
      series: [44, 55, 13, 43, 22],
      chart: {
        type: "pie",
        height: 350,
        fontFamily: "Outfit, sans-serif",
        toolbar: {
          show: false,
        },
      },
      labels: ["Desktop", "Tablet", "Mobile", "Smart TV", "Other"],
      colors: ["#465FFF", "#2A31D8", "#252DAE", "#7592FF", "#9CB9FF"],
      legend: {
        show: true,
        position: "bottom",
        labels: {
          colors: isDark ? "#9CA3AF" : "#6B7280",
        },
      },
      dataLabels: {
        enabled: true,
        style: {
          fontSize: "12px",
          fontWeight: "500",
          colors: ["#fff"],
        },
        dropShadow: {
          enabled: false,
        },
      },
      tooltip: {
        theme: isDark ? "dark" : "light",
        y: {
          formatter: function (val: number) {
            return val + "%";
          },
        },
      },
      responsive: [
        {
          breakpoint: 480,
          options: {
            chart: {
              height: 300,
            },
            legend: {
              position: "bottom",
            },
          },
        },
      ],
    };

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    chartInstance.current = new ApexCharts(chartRef.current, options);
    chartInstance.current.render();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [isDark]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-6 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Device Usage Statistics
        </h3>
        <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
          Distribution of users across different devices
        </p>
      </div>
      <div ref={chartRef} id="pieChartOne" />
    </div>
  );
};

export default PieChartOne;
