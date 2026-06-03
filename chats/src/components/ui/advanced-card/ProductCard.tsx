import React from "react";
import Image from "next/image";

interface ProductCardProps {
  name: string;
  price: number;
  image: string;
  category: string;
  rating: number;
  stock: number;
}

const ProductCard: React.FC<ProductCardProps> = ({
  name,
  price,
  image,
  category,
  rating,
  stock,
}) => {
  return (
    <div className="rounded-lg border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover"
        />
        {stock < 10 && (
          <div className="absolute right-2 top-2 rounded bg-meta-1 px-2 py-1 text-xs font-medium text-white">
            Pocas unidades
          </div>
        )}
      </div>

      <div className="p-5">
        <span className="mb-2 inline-block rounded bg-gray-2 px-3 py-1 text-xs font-medium text-body dark:bg-meta-4">
          {category}
        </span>

        <h4 className="mb-2 text-lg font-semibold text-black dark:text-white">
          {name}
        </h4>

        <div className="mb-3 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className={`text-lg ${
                i < rating ? "text-yellow-400" : "text-gray-300"
              }`}
            >
              ★
            </span>
          ))}
          <span className="ml-1 text-sm text-body">({rating}.0)</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-primary">${price}</span>
          <span className="text-sm text-body">{stock} en stock</span>
        </div>

        <button className="mt-4 w-full rounded bg-primary px-4 py-2 font-medium text-white hover:bg-opacity-90">
          Agregar al carrito
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
