import { toast } from "react-toastify";

export function showDeleteToast(message) {
  toast.success(message, {
    className: "app-toast-delete",
  });
}
