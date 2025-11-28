import { For, Show } from "solid-js";
import { PhotoCard } from "./PhotoCard";
import type { Photo } from "../types";

type GalleryProps = {
  photos: Photo[];
  selectedIds: () => Set<number>;
  onToggleSelection: (id: number) => void;
  isLoading: boolean;
  currentPage: number;
};

export function Gallery(props: GalleryProps) {
  return (
    <Show when={!props.isLoading} fallback={<p>Loading photos…</p>}>
      <Show
        when={props.photos.length > 0}
        fallback={
          <div>
            <p>No photos indexed yet. Run the indexer to get started.</p>
          </div>
        }
      >
        <div class="gallery">
          <For each={props.photos}>
            {(photo) => (
              <PhotoCard
                photo={photo}
                isSelected={() => props.selectedIds().has(photo.ID)}
                onToggleSelection={props.onToggleSelection}
                currentPage={props.currentPage}
              />
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}
