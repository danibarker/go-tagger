import { Show } from "solid-js";
import type { Photo } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

type PhotoCardProps = {
  photo: Photo;
  isSelected: () => boolean;
  onToggleSelection: (id: number) => void;
  currentPage: number;
};

export function PhotoCard(props: PhotoCardProps) {
  const takenAt = () =>
    props.photo.taken_at
      ? new Date(props.photo.taken_at).toLocaleString()
      : "Unknown date";

  const handleClick = () => {
    // Update URL hash to open modal
    window.location.hash = props.photo.file_hash;
  };

  const handleCheckboxClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    props.onToggleSelection(props.photo.ID);
  };

  return (
    <button
      type="button"
      class={`gallery__item ${props.isSelected() ? "is-selected" : ""}`}
      onClick={handleClick}
    >
      <Show
        when={props.photo.thumbnail_path}
        fallback={<div class="gallery__placeholder">No Thumbnail</div>}
      >
        {(thumb) => (
          <img src={`${API_BASE}${thumb()}`} alt="thumbnail" loading="lazy" />
        )}
      </Show>
      <div class="gallery__meta">
        <span>{takenAt()}</span>
        <span>{props.photo.file_type.toUpperCase()}</span>
      </div>
      <div class="gallery__checkbox" onClick={handleCheckboxClick}>
        <input type="checkbox" readOnly checked={props.isSelected()} />
      </div>
    </button>
  );
}
