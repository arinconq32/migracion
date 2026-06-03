import React from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import ImageCarousel from "@/components/ui/carousel/ImageCarousel";

const CarouselPage = () => {
  const carouselImages = [
    {
      src: "/images/carousel/carousel-01.png",
      alt: "Slide 1",
      title: "Bienvenido a TailAdmin",
      description: "El mejor template de dashboard para Next.js",
    },
    {
      src: "/images/carousel/carousel-02.png",
      alt: "Slide 2",
      title: "Diseño Moderno",
      description: "Interfaz limpia y profesional con Tailwind CSS",
    },
    {
      src: "/images/carousel/carousel-03.png",
      alt: "Slide 3",
      title: "Totalmente Responsive",
      description: "Optimizado para todos los dispositivos",
    },
  ];

  const autoPlayImages = [
    {
      src: "/images/grid-image/image-01.png",
      alt: "Auto 1",
    },
    {
      src: "/images/grid-image/image-02.png",
      alt: "Auto 2",
    },
    {
      src: "/images/grid-image/image-03.png",
      alt: "Auto 3",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageBreadCrumb
        title="Carousel / Slider"
        pages={[
          { name: "Dashboard", path: "/" },
          { name: "UI Elements", path: "#" },
          { name: "Carousel" },
        ]}
      />

      {/* Basic Carousel */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Carousel Básico
        </h3>
        <ImageCarousel images={carouselImages} />
      </div>

      {/* Auto Play Carousel */}
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
          Carousel con Auto-Play
        </h3>
        <ImageCarousel images={autoPlayImages} autoPlay interval={4000} />
      </div>

      {/* Grid with Carousel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
            Carousel Compacto 1
          </h3>
          <ImageCarousel images={carouselImages.slice(0, 2)} />
        </div>

        <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-4 text-xl font-semibold text-black dark:text-white">
            Carousel Compacto 2
          </h3>
          <ImageCarousel images={autoPlayImages.slice(0, 2)} autoPlay />
        </div>
      </div>
    </div>
  );
};

export default CarouselPage;
