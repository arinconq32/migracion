import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.15"],

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/vue-chats/**",
        "**/src/app/chats/**",
      ],
    };
    return config;
  },

  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },

  // Evita que el trazado de archivos entre en carpetas duplicadas del chat
  outputFileTracingExcludes: {
    "*": ["**/vue-chats/**", "**/src/app/chats/**"],
  },
};

export default nextConfig;
