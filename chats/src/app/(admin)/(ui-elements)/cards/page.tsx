import React from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import StatCard from "@/components/ui/advanced-card/StatCard";
import ProductCard from "@/components/ui/advanced-card/ProductCard";
import UserCard from "@/components/ui/advanced-card/UserCard";

const CardsPage = () => {
  return (
    <div className="flex flex-col gap-6">
      <PageBreadCrumb
        title="Cards Avanzadas"
        pages={[
          { name: "Dashboard", path: "/" },
          { name: "UI Elements", path: "#" },
          { name: "Cards" },
        ]}
      />

      {/* Statistics Cards */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Tarjetas de Estadísticas
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Usuarios"
            value="3,456"
            change={8.5}
            color="blue"
            icon={
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            }
          />

          <StatCard
            title="Total Ingresos"
            value="$45,231"
            change={12.3}
            color="green"
            icon={
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />

          <StatCard
            title="Total Pedidos"
            value="2,450"
            change={-2.4}
            color="purple"
            icon={
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            }
          />

          <StatCard
            title="Tasa de Conversión"
            value="3.65%"
            change={5.2}
            color="orange"
            icon={
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            }
          />
        </div>
      </div>

      {/* Product Cards */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Tarjetas de Productos
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ProductCard
            name="Apple Watch Series 7"
            price={399}
            image="/images/product/product-01.png"
            category="Electrónica"
            rating={5}
            stock={24}
          />

          <ProductCard
            name="Macbook Pro M1"
            price={1299}
            image="/images/product/product-02.png"
            category="Computadoras"
            rating={5}
            stock={8}
          />

          <ProductCard
            name="Dell Inspiron 15"
            price={699}
            image="/images/product/product-03.png"
            category="Computadoras"
            rating={4}
            stock={15}
          />
        </div>
      </div>

      {/* User Cards */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Tarjetas de Usuarios
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <UserCard
            name="Carlos García"
            role="Desarrollador Frontend"
            avatar="/images/user/user-01.jpg"
            email="carlos.garcia@example.com"
            phone="+52 123 456 7890"
            location="Ciudad de México, MX"
          />

          <UserCard
            name="María López"
            role="Diseñadora UX/UI"
            avatar="/images/user/user-02.jpg"
            email="maria.lopez@example.com"
            phone="+52 098 765 4321"
            location="Guadalajara, MX"
          />

          <UserCard
            name="Juan Rodríguez"
            role="Product Manager"
            avatar="/images/user/user-03.jpg"
            email="juan.rodriguez@example.com"
            phone="+52 555 123 4567"
            location="Monterrey, MX"
          />
        </div>
      </div>
    </div>
  );
};

export default CardsPage;
