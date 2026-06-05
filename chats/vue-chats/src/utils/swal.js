import Swal from "sweetalert2";

const SWAL_Z_INDEX = 20000;

const baseConfig = {
  confirmButtonColor: "#7eb83b",
  cancelButtonColor: "#6b7280",
  didOpen: (popup) => {
    const container = popup?.closest?.(".swal2-container");
    if (container) {
      container.style.zIndex = String(SWAL_Z_INDEX);
    }
  },
};

function fireSwal(options = {}) {
  const userDidOpen = options.didOpen;
  return Swal.fire({
    ...baseConfig,
    ...options,
    didOpen: (popup) => {
      baseConfig.didOpen(popup);
      if (typeof userDidOpen === "function") {
        userDidOpen(popup);
      }
    },
  });
}

export async function confirmSave({
  title = "¿Guardar cambios?",
  text = "Se actualizará la información del contacto.",
} = {}) {
  const result = await fireSwal({
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
  const result = await fireSwal({
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
  await fireSwal({
    title,
    text: message,
    icon: "error",
    confirmButtonText: "Aceptar",
  });
}

export async function showSuccess(message, title = "Listo") {
  await fireSwal({
    title,
    text: message,
    icon: "success",
    confirmButtonText: "Aceptar",
    timer: 2200,
    timerProgressBar: true,
  });
}
