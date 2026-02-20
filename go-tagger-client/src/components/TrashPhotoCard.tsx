import type { Photo } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

type TrashPhotoCardProps = {
  photo: Photo;
  index: number;
  isSelected: () => boolean;
  onPhotoClick: (id: number, index: number, shiftKey: boolean) => void;
  onRestore?: (id: number) => void;
  onPermanentDelete?: (id: number) => void;
};

export function TrashPhotoCard(props: TrashPhotoCardProps) {
  return (
    <div
      class={`gallery__item ${props.isSelected() ? "is-selected" : ""}`}
      onClick={() => (window.location.hash = props.photo.file_hash)}
      style={{ position: "relative", cursor: "pointer" }}
    >
      {props.photo.thumbnail_path ? (
        <img
          src={`${API_BASE}${props.photo.thumbnail_path}`}
          alt="thumbnail"
          loading="lazy"
        />
      ) : (
        <div class="gallery__placeholder">No Thumbnail</div>
      )}

      <button
        type="button"
        aria-label="Restore photo"
        onClick={(e) => {
          e.stopPropagation();
          props.onRestore?.(props.photo.ID);
        }}
        style={{
          position: "absolute",
          top: "4px",
          left: "4px",
          width: "24px",
          height: "24px",
          border: "none",
          background: "var(--color-surface)",
          color: "var(--color-accent-text)",
          "font-weight": "700",
          "border-radius": "50%",
          cursor: "pointer",
          "font-size": "0.95em",
          "z-index": "2",
        }}
      >
        ↩
      </button>

      <button
        type="button"
        aria-label="Permanently delete photo"
        onClick={(e) => {
          e.stopPropagation();
          props.onPermanentDelete?.(props.photo.ID);
        }}
        style={{
          position: "absolute",
          top: "4px",
          left: "32px",
          width: "24px",
          height: "24px",
          border: "none",
          background: "var(--color-surface)",
          color: "var(--color-danger)",
          "font-weight": "700",
          "border-radius": "50%",
          cursor: "pointer",
          "font-size": "1.05em",
          "z-index": "2",
        }}
      >
        ×
      </button>

      <div class="gallery__meta">
        <span>
          {props.photo.taken_at
            ? new Date(props.photo.taken_at).toLocaleString()
            : "Unknown date"}
        </span>
        <span>{props.photo.file_type.toUpperCase()}</span>
      </div>

      <div
        class="gallery__checkbox"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          props.onPhotoClick(props.photo.ID, props.index, e.shiftKey);
        }}
      >
        <input type="checkbox" readOnly checked={props.isSelected()} />
      </div>
    </div>
  );
}
