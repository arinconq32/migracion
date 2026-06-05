"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CrmReportesChatsPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

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
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
        Reportes chats
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Panel de reportes de conversaciones para administradores. Aquí podrás
        consultar métricas, tiempos de atención y volumen de chats por asesor.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs uppercase text-gray-400">Conversaciones</p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            —
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs uppercase text-gray-400">Activas</p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            —
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs uppercase text-gray-400">Cerradas hoy</p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            —
          </p>
        </div>
      </div>
    </section>
  );
}
