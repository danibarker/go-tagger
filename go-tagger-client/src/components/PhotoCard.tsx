import { Show } from "solid-js";
import type { Photo } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

type PhotoCardProps = {
  photo: Photo;
  index: number;
  isSelected: () => boolean;
  isDeleting: () => boolean;
  isFocused: () => boolean;
  onToggleSelection: (id: number) => void;
  onPhotoClick: (id: number, index: number, shiftKey: boolean) => void;
  currentPage: number;
  onDelete?: (id: number) => void;
};

export function PhotoCard(props: PhotoCardProps) {
  return (
    <div
      class={`gallery__item ${props.isSelected() ? "is-selected" : ""} ${props.isFocused() ? "is-focused" : ""} ${props.isDeleting() ? "is-deleting" : ""}`}
      data-photo-id={props.photo.ID}
      onClick={() => {
        if (props.isDeleting()) return;
        window.location.hash = props.photo.file_hash;
      }}
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
      <Show when={props.isDeleting()}>
        <div class="gallery__deleting-overlay">Deleting...</div>
      </Show>
      <Show when={!props.isDeleting()}>
        <button
          type="button"
          aria-label="Delete photo"
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete?.(props.photo.ID);
          }}
          style={{
            position: "absolute",
            top: "4px",
            left: "4px",
            width: "20px",
            height: "20px",
            border: "none",
            background: "var(--color-surface)",
            color: "var(--color-danger)",
            "font-weight": "700",
            "border-radius": "50%",
            cursor: "pointer",
            "font-size": "1em",
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
      </Show>
    </div>
  );
}
