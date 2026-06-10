"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TabResumen from "@/components/reportes-chats/TabResumen";
import TabAgentes from "@/components/reportes-chats/TabAgentes";
import TabTiempoReal from "@/components/reportes-chats/TabTiempoReal";
import TabConfigBot from "@/components/reportes-chats/TabConfigBot";
import TabContactos from "@/components/reportes-chats/TabContactos";

type TabId = "resumen" | "agentes" | "tiempo-real" | "contactos" | "config";

const TABS: { id: TabId; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "agentes", label: "Agentes" },
  { id: "tiempo-real", label: "Tiempo real" },
  { id: "contactos", label: "Contactos" },
  { id: "config", label: "Configuración bot" },
];

export default function CrmReportesChatsPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("resumen");

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/chats");
    }
  }, [isAdmin, loading, router]);

  if (loading || !isAdmin) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
          Reportes chats
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Panel de reportería de conversaciones: métricas, agentes, monitoreo en
          tiempo real y configuración del chatbot.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "resumen" && <TabResumen />}
      {activeTab === "agentes" && <TabAgentes />}
      {activeTab === "tiempo-real" && <TabTiempoReal />}
      {activeTab === "contactos" && <TabContactos />}
      {activeTab === "config" && <TabConfigBot />}
    </section>
  );
}
