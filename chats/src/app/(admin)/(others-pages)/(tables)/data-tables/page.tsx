"use client";
import React, { useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

interface Employee {
  id: number;
  name: string;
  position: string;
  department: string;
  email: string;
  status: "Active" | "Inactive" | "On Leave";
  salary: string;
  joinDate: string;
}

const employeesData: Employee[] = [
  {
    id: 1,
    name: "John Anderson",
    position: "Senior Developer",
    department: "Engineering",
    email: "john@company.com",
    status: "Active",
    salary: "$95,000",
    joinDate: "2022-01-15",
  },
  {
    id: 2,
    name: "Sarah Williams",
    position: "Product Manager",
    department: "Product",
    email: "sarah@company.com",
    status: "Active",
    salary: "$105,000",
    joinDate: "2021-06-20",
  },
  {
    id: 3,
    name: "Michael Brown",
    position: "UX Designer",
    department: "Design",
    email: "michael@company.com",
    status: "On Leave",
    salary: "$85,000",
    joinDate: "2022-03-10",
  },
  {
    id: 4,
    name: "Emma Davis",
    position: "Marketing Lead",
    department: "Marketing",
    email: "emma@company.com",
    status: "Active",
    salary: "$92,000",
    joinDate: "2021-11-05",
  },
  {
    id: 5,
    name: "James Wilson",
    position: "DevOps Engineer",
    department: "Engineering",
    email: "james@company.com",
    status: "Active",
    salary: "$98,000",
    joinDate: "2022-02-28",
  },
  {
    id: 6,
    name: "Lisa Martinez",
    position: "HR Manager",
    department: "Human Resources",
    email: "lisa@company.com",
    status: "Active",
    salary: "$88,000",
    joinDate: "2020-09-15",
  },
  {
    id: 7,
    name: "David Garcia",
    position: "Sales Director",
    department: "Sales",
    email: "david@company.com",
    status: "Active",
    salary: "$115,000",
    joinDate: "2020-04-20",
  },
  {
    id: 8,
    name: "Jennifer Lee",
    position: "QA Engineer",
    department: "Engineering",
    email: "jennifer@company.com",
    status: "Inactive",
    salary: "$78,000",
    joinDate: "2023-01-10",
  },
];

const DataTables = () => {
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Get unique departments for filter
  const departments = ["All", ...Array.from(new Set(employeesData.map(emp => emp.department)))];
  const statuses = ["All", "Active", "Inactive", "On Leave"];

  // Filter and search logic
  const filteredData = employeesData.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.position.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = filterDepartment === "All" || employee.department === filterDepartment;
    const matchesStatus = filterStatus === "All" || employee.status === filterStatus;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const toggleRowSelection = (id: number) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const toggleAllRows = () => {
    if (selectedRows.length === paginatedData.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(paginatedData.map(emp => emp.id));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Inactive":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "On Leave":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  return (
    <>
      <PageBreadcrumb pageTitle="Data Tables" />

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {/* Table Header with Search and Filters */}
        <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Employee Directory
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {filteredData.length} employees found
              </p>
            </div>
            
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search */}
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              
              {/* Department Filter */}
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              
              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === paginatedData.length && paginatedData.length > 0}
                    onChange={toggleAllRows}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                  Employee
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                  Position
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                  Department
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                  Salary
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-600 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30"
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(employee.id)}
                      onChange={() => toggleRowSelection(employee.id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-800 dark:text-white">
                        {employee.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {employee.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {employee.position}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {employee.department}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(employee.status)}`}>
                      {employee.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800 dark:text-white">
                    {employee.salary}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-500">
                        Edit
                      </button>
                      <button className="text-sm text-red-600 hover:text-red-700 dark:text-red-500">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredData.length)} of {filteredData.length} results
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
            >
              Previous
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  currentPage === page
                    ? "bg-brand-500 text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
                }`}
              >
                {page}
              </button>
            ))}
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default DataTables;
