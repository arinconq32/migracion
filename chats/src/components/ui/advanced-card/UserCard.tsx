import React from "react";
import Image from "next/image";

interface UserCardProps {
  name: string;
  role: string;
  avatar: string;
  email: string;
  phone: string;
  location: string;
}

const UserCard: React.FC<UserCardProps> = ({
  name,
  role,
  avatar,
  email,
  phone,
  location,
}) => {
  return (
    <div className="rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex flex-col items-center">
        <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-full">
          <Image
            src={avatar}
            alt={name}
            fill
            className="object-cover"
          />
        </div>

        <h4 className="mb-1 text-xl font-semibold text-black dark:text-white">
          {name}
        </h4>
        <span className="mb-4 text-sm font-medium text-body">{role}</span>

        <div className="mb-5 w-full space-y-3 border-t border-stroke pt-4 dark:border-strokedark">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-body"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm text-body">{email}</span>
          </div>

          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-body"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <span className="text-sm text-body">{phone}</span>
          </div>

          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-body"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-sm text-body">{location}</span>
          </div>
        </div>

        <div className="flex w-full gap-2">
          <button className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
            Mensaje
          </button>
          <button className="flex-1 rounded border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4">
            Ver perfil
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserCard;
