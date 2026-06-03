"use client";
import React, { useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

interface Task {
  id: number;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High";
  assignee: string;
  tags: string[];
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
}

const initialColumns: Column[] = [
  {
    id: "todo",
    title: "To Do",
    tasks: [
      {
        id: 1,
        title: "Design new landing page",
        description: "Create wireframes and mockups",
        priority: "High",
        assignee: "Sarah Williams",
        tags: ["Design", "UI/UX"],
      },
      {
        id: 2,
        title: "Write documentation",
        description: "Document the new API endpoints",
        priority: "Medium",
        assignee: "Michael Brown",
        tags: ["Documentation"],
      },
    ],
  },
  {
    id: "in-progress",
    title: "In Progress",
    tasks: [
      {
        id: 3,
        title: "Implement authentication",
        description: "Add JWT authentication to API",
        priority: "High",
        assignee: "John Anderson",
        tags: ["Backend", "Security"],
      },
      {
        id: 4,
        title: "Fix mobile responsiveness",
        description: "Resolve layout issues on mobile",
        priority: "High",
        assignee: "Emma Davis",
        tags: ["Frontend", "Bug"],
      },
    ],
  },
  {
    id: "review",
    title: "Review",
    tasks: [
      {
        id: 5,
        title: "Code review for PR #123",
        description: "Review authentication implementation",
        priority: "Medium",
        assignee: "James Wilson",
        tags: ["Code Review"],
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    tasks: [
      {
        id: 6,
        title: "Update dependencies",
        description: "Update all npm packages",
        priority: "Low",
        assignee: "James Wilson",
        tags: ["Maintenance"],
      },
    ],
  },
];

const TaskKanban = () => {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [draggedFrom, setDraggedFrom] = useState<string | null>(null);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "border-l-4 border-red-500";
      case "Medium":
        return "border-l-4 border-yellow-500";
      case "Low":
        return "border-l-4 border-blue-500";
      default:
        return "";
    }
  };

  const handleDragStart = (task: Task, columnId: string) => {
    setDraggedTask(task);
    setDraggedFrom(columnId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetColumnId: string) => {
    if (!draggedTask || !draggedFrom) return;

    if (draggedFrom === targetColumnId) {
      setDraggedTask(null);
      setDraggedFrom(null);
      return;
    }

    setColumns((prevColumns) =>
      prevColumns.map((column) => {
        if (column.id === draggedFrom) {
          return {
            ...column,
            tasks: column.tasks.filter((task) => task.id !== draggedTask.id),
          };
        }
        if (column.id === targetColumnId) {
          return {
            ...column,
            tasks: [...column.tasks, draggedTask],
          };
        }
        return column;
      })
    );

    setDraggedTask(null);
    setDraggedFrom(null);
  };

  return (
    <>
      <PageBreadcrumb pageTitle="Task Kanban" />

      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                Task Board
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Drag and drop tasks to update their status
              </p>
            </div>

            <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
              + Add Task
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((column) => (
            <div key={column.id}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-400">
                  {column.title}
                  <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-800">
                    {column.tasks.length}
                  </span>
                </h3>
              </div>

              <div
                className="min-h-[500px] space-y-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/30"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(column.id)}
              >
                {column.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task, column.id)}
                    className={`cursor-move rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-white/[0.03] ${getPriorityColor(
                      task.priority
                    )}`}
                  >
                    <div className="mb-3">
                      <h4 className="font-semibold text-gray-800 dark:text-white">
                        {task.title}
                      </h4>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {task.description}
                      </p>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      {task.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="rounded-full bg-brand-100 px-2 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-medium text-white">
                          {task.assignee
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {task.assignee}
                        </span>
                      </div>

                      <span
                        className={`text-xs font-medium ${
                          task.priority === "High"
                            ? "text-red-600 dark:text-red-500"
                            : task.priority === "Medium"
                            ? "text-yellow-600 dark:text-yellow-500"
                            : "text-blue-600 dark:text-blue-500"
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                ))}

                {column.tasks.length === 0 && (
                  <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <p className="text-sm text-gray-400 dark:text-gray-600">
                      Drop tasks here
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default TaskKanban;
