"use client";
import React, { useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

interface Task {
  id: number;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High";
  status: "Todo" | "In Progress" | "Completed";
  dueDate: string;
  assignee: string;
}

const initialTasks: Task[] = [
  {
    id: 1,
    title: "Design new landing page",
    description: "Create wireframes and mockups for the new product landing page",
    priority: "High",
    status: "In Progress",
    dueDate: "2026-05-20",
    assignee: "Sarah Williams",
  },
  {
    id: 2,
    title: "Implement authentication",
    description: "Add JWT authentication to the API endpoints",
    priority: "High",
    status: "In Progress",
    dueDate: "2026-05-18",
    assignee: "John Anderson",
  },
  {
    id: 3,
    title: "Write documentation",
    description: "Document the new API endpoints and features",
    priority: "Medium",
    status: "Todo",
    dueDate: "2026-05-25",
    assignee: "Michael Brown",
  },
  {
    id: 4,
    title: "Fix mobile responsiveness",
    description: "Resolve layout issues on mobile devices",
    priority: "High",
    status: "Todo",
    dueDate: "2026-05-19",
    assignee: "Emma Davis",
  },
  {
    id: 5,
    title: "Update dependencies",
    description: "Update all npm packages to latest stable versions",
    priority: "Low",
    status: "Completed",
    dueDate: "2026-05-15",
    assignee: "James Wilson",
  },
  {
    id: 6,
    title: "Optimize database queries",
    description: "Improve performance of slow database queries",
    priority: "Medium",
    status: "Todo",
    dueDate: "2026-05-22",
    assignee: "John Anderson",
  },
];

const TaskList = () => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterPriority, setFilterPriority] = useState<string>("All");

  const filteredTasks = tasks.filter(task => {
    const matchesStatus = filterStatus === "All" || task.status === filterStatus;
    const matchesPriority = filterPriority === "All" || task.priority === filterPriority;
    return matchesStatus && matchesPriority;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "Medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Low":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "In Progress":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Todo":
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const toggleTaskStatus = (taskId: number) => {
    setTasks(prevTasks =>
      prevTasks.map(task => {
        if (task.id === taskId) {
          const statusFlow: Record<Task["status"], Task["status"]> = {
            "Todo": "In Progress",
            "In Progress": "Completed",
            "Completed": "Todo",
          };
          return { ...task, status: statusFlow[task.status] };
        }
        return task;
      })
    );
  };

  const deleteTask = (taskId: number) => {
    setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
  };

  return (
    <>
      <PageBreadcrumb pageTitle="Task List" />

      <div className="space-y-6">
        {/* Header with Filters */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                Task Management
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {filteredTasks.length} tasks found
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                <option value="All">All Status</option>
                <option value="Todo">Todo</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                <option value="All">All Priority</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
                + Add Task
              </button>
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-4">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={task.status === "Completed"}
                      onChange={() => toggleTaskStatus(task.id)}
                      className="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <h3
                      className={`text-lg font-semibold ${
                        task.status === "Completed"
                          ? "text-gray-400 line-through dark:text-gray-600"
                          : "text-gray-800 dark:text-white"
                      }`}
                    >
                      {task.title}
                    </h3>
                  </div>

                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {task.description}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Priority:
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Status:
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
                          task.status
                        )}`}
                      >
                        {task.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Due:
                      </span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Assignee:
                      </span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">
                        {task.assignee}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default TaskList;
