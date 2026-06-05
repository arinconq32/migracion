export type UserRole = "asesor" | "administrador";

export type AuthUser = {
  id: string;
  agentId: string;
  usuario: string;
  nombre: string;
  correo?: string | null;
  exten?: string | null;
  perfil?: string | null;
  role: UserRole;
};

export const AUTH_COOKIE_NAME = "omni_auth";
export const AUTH_STORAGE_KEY = "omni_auth_user";

export function isAdministrador(role?: string | null): boolean {
  return String(role || "").toLowerCase() === "administrador";
}

export function defaultRouteForRole(role?: string | null): string {
  return "/chats";
}
