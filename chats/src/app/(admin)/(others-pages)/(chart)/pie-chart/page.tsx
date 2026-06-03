"use client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import dynamic from "next/dynamic";

// Load PieChartOne only on client side to avoid window errors
const PieChartOne = dynamic(() => import("@/components/charts/pie/PieChartOne"), {
  ssr: false,
});

const PieChart = () => {
  return (
    <>
      <PageBreadcrumb pageTitle="Pie Chart" />

      <div className="grid grid-cols-1 gap-4 md:gap-6">
        <PieChartOne />
      </div>
    </>
  );
};

export default PieChart;
