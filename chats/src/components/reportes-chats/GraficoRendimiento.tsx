"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface GraficoRendimientoProps {
  categorias: string[];
  series: { name: string; data: number[] }[];
}

export default function GraficoRendimiento({
  categorias,
  series,
}: GraficoRendimientoProps) {
  const options: ApexOptions = {
    legend: { show: true, position: "top" },
    colors: ["#7eb83b"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 300,
      type: "area",
      toolbar: { show: false },
    },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.45, opacityTo: 0.05 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: "category",
      categories: categorias,
      labels: { style: { fontSize: "11px", colors: "#6B7280" } },
    },
    yaxis: {
      labels: { style: { fontSize: "12px", colors: "#6B7280" } },
      title: { text: "Conversaciones" },
    },
    grid: {
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    tooltip: { enabled: true },
  };

  if (!categorias.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-400">Sin datos para el período seleccionado</p>
      </div>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto">
      <ReactApexChart options={options} series={series} type="area" height={300} />
    </div>
  );
}
