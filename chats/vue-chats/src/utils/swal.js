import Swal from "sweetalert2";

const baseConfig = {
  confirmButtonColor: "#7eb83b",
  cancelButtonColor: "#6b7280",
};

export async function confirmSave({
  title = "¿Guardar cambios?",
  text = "Se actualizará la información del contacto.",
} = {}) {
  const result = await Swal.fire({
    ...baseConfig,
    title,
    text,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
  });
  return result.isConfirmed;
}

export async function confirmDelete({
  title = "¿Eliminar contacto?",
  text = "Se eliminarán el contacto, la conversación y los mensajes asociados. Esta acción no se puede deshacer.",
} = {}) {
  const result = await Swal.fire({
    ...baseConfig,
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

export async function showError(message, title = "Error") {
  await Swal.fire({
    ...baseConfig,
    title,
    text: message,
    icon: "error",
    confirmButtonText: "Aceptar",
  });
}

export async function showSuccess(message, title = "Listo") {
  await Swal.fire({
    ...baseConfig,
    title,
    text: message,
    icon: "success",
    confirmButtonText: "Aceptar",
    timer: 2200,
    timerProgressBar: true,
  });
}
