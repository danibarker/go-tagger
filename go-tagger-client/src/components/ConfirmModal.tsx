import { Show } from "solid-js";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal(props: ConfirmModalProps) {
  return (
    <Show when={props.open}>
      <div class="modal-overlay" role="dialog" aria-modal="true">
        <div class="modal">
          <h3 class="modal__title">{props.title}</h3>
          <p class="modal__message">{props.message}</p>
          <div class="modal__actions">
            <button type="button" class="ghost" onClick={props.onClose}>
              {props.cancelLabel ?? "Cancel"}
            </button>
            <button type="button" class="primary" onClick={props.onConfirm}>
              {props.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
