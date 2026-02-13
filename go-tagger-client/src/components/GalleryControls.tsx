import { Show } from "solid-js";
import type { Accessor } from "solid-js";

interface GalleryControlsProps {
  photos: any[];
  selectedIds: Accessor<Set<number>>;
  onToggleSelectAll: () => void;
  onBatchDelete: () => void;
}

export function GalleryControls(props: GalleryControlsProps) {
  const allSelected = () =>
    props.photos.length > 0 &&
    props.photos.every((p) => props.selectedIds().has(p.ID));

  return (
    <div
      style={{
        position: "absolute",
        top: "-2.5rem",
        right: 0,
        display: "flex",
        gap: "0.5rem",
        "z-index": 10,
      }}
    >
      <button type="button" class="ghost" onClick={props.onToggleSelectAll}>
        {allSelected() ? "Unselect All" : "Select All"}
      </button>
      <Show when={props.selectedIds().size > 0}>
        <button
          type="button"
          onClick={props.onBatchDelete}
          style={{
            background: "#fff",
            color: "#c00",
            border: "1px solid #c00",
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
  );
}
