import React from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Breadcrumb from "@/components/ui/breadcrumb/Breadcrumb";

const BreadcrumbsPage = () => {
  return (
    <div className="flex flex-col gap-6">
      <PageBreadCrumb
        title="Breadcrumbs"
        pages={[
          { name: "Dashboard", path: "/" },
          { name: "UI Elements", path: "#" },
          { name: "Breadcrumbs" },
        ]}
      />

      {/* Basic Breadcrumb */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Breadcrumb Básico
        </h3>
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/" },
            { label: "UI Elements", href: "#" },
            { label: "Breadcrumbs" },
          ]}
        />
      </div>

      {/* Breadcrumb with Home Icon */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Breadcrumb con Ícono de Inicio
        </h3>
        <Breadcrumb
          homeIcon={true}
          items={[
            { label: "Productos", href: "#" },
            { label: "Electrónica", href: "#" },
            { label: "Smartphones" },
          ]}
        />
      </div>

      {/* Breadcrumb without Home Icon */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Breadcrumb sin Ícono de Inicio
        </h3>
        <Breadcrumb
          homeIcon={false}
          items={[
            { label: "Configuración", href: "#" },
            { label: "Perfil", href: "#" },
            { label: "Editar Información" },
          ]}
        />
      </div>

      {/* Long Breadcrumb */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Breadcrumb Largo
        </h3>
        <Breadcrumb
          items={[
            { label: "Inicio", href: "/" },
            { label: "Categorías", href: "#" },
            { label: "Tecnología", href: "#" },
            { label: "Computadoras", href: "#" },
            { label: "Laptops", href: "#" },
            { label: "Gaming" },
          ]}
        />
      </div>

      {/* Example Usage in Different Contexts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
            E-commerce Context
          </h3>
          <Breadcrumb
            items={[
              { label: "Tienda", href: "#" },
              { label: "Ropa", href: "#" },
              { label: "Camisetas" },
            ]}
          />
          <div className="mt-4 border-t border-stroke pt-4 dark:border-strokedark">
            <p className="text-sm text-body">
              Navegación típica de una tienda en línea, mostrando la jerarquía de
              categorías.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
            Admin Panel Context
          </h3>
          <Breadcrumb
            items={[
              { label: "Panel", href: "/" },
              { label: "Usuarios", href: "#" },
              { label: "Gestión", href: "#" },
              { label: "Editar Usuario" },
            ]}
          />
          <div className="mt-4 border-t border-stroke pt-4 dark:border-strokedark">
            <p className="text-sm text-body">
              Breadcrumb para panel de administración mostrando el flujo de
              navegación.
            </p>
          </div>
        </div>
      </div>

      {/* Code Example */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Ejemplo de Uso
        </h3>
        <pre className="rounded bg-gray-100 p-4 text-sm dark:bg-meta-4">
          <code>{`<Breadcrumb
  homeIcon={true}
  items={[
    { label: "Dashboard", href: "/" },
    { label: "UI Elements", href: "#" },
    { label: "Breadcrumbs" },
  ]}
/>`}</code>
        </pre>
      </div>
    </div>
  );
};

export default BreadcrumbsPage;
