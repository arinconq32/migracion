import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión | BESTVOIPER",
  description: "Acceso al CRM y chats según perfil de usuario",
};

export default function SignIn() {
  return <SignInForm />;
}
