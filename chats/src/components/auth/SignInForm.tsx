"use client";

import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import React, { FormEvent, useState } from "react";

export default function SignInForm() {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const result = await login(usuario.trim(), password);
    if (!result.ok) {
      setError(result.error || "No se pudo iniciar sesión");
    }

    setSubmitting(false);
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Iniciar sesión
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ingresa tu usuario y contraseña para acceder al CRM.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <Label>
                  Usuario <span className="text-error-500">*</span>
                </Label>
                <input
                  type="text"
                  name="usuario"
                  autoComplete="username"
                  placeholder="Tu usuario"
                  value={usuario}
                  onChange={(event) => setUsuario(event.target.value)}
                  required
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>

              <div>
                <Label>
                  Contraseña <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>

              {error ? (
                <p className="text-sm text-error-500">{error}</p>
              ) : null}

              <div>
                <button
                  type="submit"
                  disabled={submitting || !usuario.trim() || !password}
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {submitting ? "Ingresando..." : "Ingresar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
