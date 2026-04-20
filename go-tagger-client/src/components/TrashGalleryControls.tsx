import { Show } from "solid-js";
import type { Accessor } from "solid-js";

interface TrashGalleryControlsProps {
  photos: any[];
  totalItems: number;
  limit: number;
  selectedIds: Accessor<Set<number>>;
  onLimitChange: (limit: number) => void;
  onToggleSelectAll: () => void;
  onEmptyTrash: () => void;
  emptyTrashInProgress: boolean;
  onBatchRestore: () => void;
  onBatchPermanentDelete: () => void;
}

export function TrashGalleryControls(props: TrashGalleryControlsProps) {
  const allSelected = () =>
    props.photos.length > 0 &&
    props.photos.every((p) => props.selectedIds().has(p.ID));

  return (
    <div
      style={{
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center",
        gap: "1rem",
        "flex-wrap": "wrap",
        "margin-bottom": "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          "align-items": "center",
          "flex-wrap": "wrap",
        }}
      >
        <label
          for="trash-limit"
          style={{
            display: "flex",
            gap: "0.5rem",
            "align-items": "center",
            "font-weight": 600,
          }}
        >
          <span>Images per page</span>
          <select
            id="trash-limit"
            value={String(props.limit)}
            onChange={(e) => props.onLimitChange(Number(e.currentTarget.value))}
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </label>
        <span class="pill">{props.totalItems} in trash</span>
        <button
          type="button"
          onClick={props.onEmptyTrash}
          disabled={props.totalItems === 0 || props.emptyTrashInProgress}
          style={{
            background: "var(--color-surface)",
            color: "var(--color-danger)",
            border: "1px solid var(--color-danger)",
            "border-radius": "999px",
            padding: "0.35rem 1rem",
            "font-weight": 700,
            cursor: "pointer",
            "font-size": "0.95em",
            opacity:
              props.totalItems === 0 || props.emptyTrashInProgress ? 0.6 : 1,
          }}
        >
          {props.emptyTrashInProgress ? "Emptying…" : "Empty Trash"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          "align-items": "center",
          "flex-wrap": "wrap",
          "justify-content": "flex-end",
        }}
      >
        <button type="button" class="ghost" onClick={props.onToggleSelectAll}>
          {allSelected() ? "Unselect All" : "Select All"}
        </button>

        <Show when={props.selectedIds().size > 0}>
          <button type="button" class="ghost" onClick={props.onBatchRestore}>
            Restore Selected
          </button>
          <button
            type="button"
            onClick={props.onBatchPermanentDelete}
            style={{
              background: "var(--color-surface)",
              color: "var(--color-danger)",
              border: "1px solid var(--color-danger)",
              "border-radius": "999px",
              padding: "0.25rem 1rem",
              "font-weight": 700,
              cursor: "pointer",
              "font-size": "0.95em",
            }}
          >
            Delete Selected ×
          </button>
        </Show>
      </div>
    </div>
  );
}
