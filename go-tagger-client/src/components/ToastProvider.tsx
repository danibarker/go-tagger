import {
  createContext,
  createSignal,
  For,
  useContext,
  type JSX,
  onCleanup,
} from "solid-js";

type ToastKind = "info" | "success" | "error";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type PushToastOptions = {
  kind?: ToastKind;
  message: string;
  durationMs?: number;
};

type ToastApi = {
  pushToast: (opts: PushToastOptions) => void;
};

const ToastContext = createContext<ToastApi>();

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  let nextId = 1;
  const timers = new Map<number, number>();

  const removeToast = (id: number) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const pushToast = (opts: PushToastOptions) => {
    const id = nextId++;
    const kind: ToastKind = opts.kind ?? "info";
    const durationMs = opts.durationMs ?? (kind === "error" ? 6000 : 3000);

    setToasts((prev) => prev.concat({ id, kind, message: opts.message }));

    const timer = window.setTimeout(() => removeToast(id), durationMs);
    timers.set(id, timer);
  };

  onCleanup(() => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  });

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {props.children}
      <div class="toast-stack" aria-live="polite" aria-relevant="additions">
        <For each={toasts()}>
          {(toast) => (
            <div
              class={`toast toast--${toast.kind}`}
              role={toast.kind === "error" ? "alert" : "status"}
              onClick={() => removeToast(toast.id)}
            >
              {toast.message}
            </div>
          )}
        </For>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
