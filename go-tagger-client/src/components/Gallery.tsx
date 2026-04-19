import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { PhotoCard } from "./PhotoCard";
import type { Photo } from "../types";

const COLUMN_COUNT = 4;
const ESTIMATED_COLUMN_WIDTH = 240;
const ESTIMATED_CARD_CHROME_HEIGHT = 84;

function estimatePhotoCardHeight(photo: Photo) {
  if (photo.width > 0 && photo.height > 0) {
    return (
      ESTIMATED_CARD_CHROME_HEIGHT +
      (ESTIMATED_COLUMN_WIDTH * photo.height) / photo.width
    );
  }

  return ESTIMATED_CARD_CHROME_HEIGHT + ESTIMATED_COLUMN_WIDTH;
}

function getShortestColumnIndex(columnHeights: number[]) {
  let shortestIndex = 0;

  for (let index = 1; index < columnHeights.length; index += 1) {
    if (columnHeights[index] < columnHeights[shortestIndex]) {
      shortestIndex = index;
    }
  }

  return shortestIndex;
}

type GalleryProps = {
  photos: Photo[];
  selectedIds: () => Set<number>;
  focusedIds: () => Set<number>;
  onToggleSelection: (id: number) => void;
  onPhotoClick: (id: number, index: number, shiftKey: boolean) => void;
  onSelectMultiple: (ids: number[]) => void;
  isLoading: boolean;
  currentPage: number;
  onDeletePhoto?: (id: number) => void;
};

export function Gallery(props: GalleryProps) {
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = createSignal({ x: 0, y: 0 });
  const [dragStartedOnCard, setDragStartedOnCard] = createSignal(false);
  let galleryRef: HTMLDivElement | undefined;

  const photoColumns = createMemo(() => {
    const columns = Array.from(
      { length: COLUMN_COUNT },
      () =>
        [] as {
          photo: Photo;
          index: number;
        }[],
    );
    const columnHeights = Array.from({ length: COLUMN_COUNT }, () => 0);

    props.photos.forEach((photo, index) => {
      const columnIndex = getShortestColumnIndex(columnHeights);
      columns[columnIndex].push({ photo, index });
      columnHeights[columnIndex] += estimatePhotoCardHeight(photo);
    });

    return columns;
  });

  const handleMouseDown = (e: MouseEvent) => {
    // Check if we started on a photo card or its children
    const target = e.target as HTMLElement;
    const isOnCard = target.closest(".gallery__item") !== null;

    // Only start drag selection if NOT on a card, checkbox, or delete button
    if (
      isOnCard ||
      target.closest(".gallery__checkbox") ||
      target.closest("button")
    ) {
      setDragStartedOnCard(true);
      return;
    }

    setDragStartedOnCard(false);
    setIsDragging(true);
    const rect = galleryRef!.getBoundingClientRect();
    setDragStart({
      x: e.clientX - rect.left + galleryRef!.scrollLeft,
      y: e.clientY - rect.top + galleryRef!.scrollTop,
    });
    setDragEnd({
      x: e.clientX - rect.left + galleryRef!.scrollLeft,
      y: e.clientY - rect.top + galleryRef!.scrollTop,
    });
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging() || dragStartedOnCard()) return;

    const rect = galleryRef!.getBoundingClientRect();
    setDragEnd({
      x: e.clientX - rect.left + galleryRef!.scrollLeft,
      y: e.clientY - rect.top + galleryRef!.scrollTop,
    });

    // Calculate which photos are in the selection rectangle
    const selectedInDrag = getPhotosInRect();
    // Update selection
    if (selectedInDrag.length > 0) {
      props.onSelectMultiple(selectedInDrag);
    }
  };

  const handleMouseUp = () => {
    if (isDragging() && !dragStartedOnCard()) {
      const selectedInDrag = getPhotosInRect();
      if (selectedInDrag.length > 0) {
        props.onSelectMultiple(selectedInDrag);
      }
    }
    setIsDragging(false);
    setDragStartedOnCard(false);
  };

  const getPhotosInRect = (): number[] => {
    if (!galleryRef) return [];

    const start = dragStart();
    const end = dragEnd();
    const selectionRect = {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      right: Math.max(start.x, end.x),
      bottom: Math.max(start.y, end.y),
    };

    const photoElements = galleryRef.querySelectorAll(".gallery__item");
    const selected: number[] = [];

    photoElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const galleryRect = galleryRef!.getBoundingClientRect();
      const photoRect = {
        left: rect.left - galleryRect.left + galleryRef!.scrollLeft,
        top: rect.top - galleryRect.top + galleryRef!.scrollTop,
        right: rect.right - galleryRect.left + galleryRef!.scrollLeft,
        bottom: rect.bottom - galleryRect.top + galleryRef!.scrollTop,
      };

      // Check if rectangles intersect
      if (
        selectionRect.left < photoRect.right &&
        selectionRect.right > photoRect.left &&
        selectionRect.top < photoRect.bottom &&
        selectionRect.bottom > photoRect.top
      ) {
        const photoId = Number((el as HTMLElement).dataset.photoId);
        if (!Number.isNaN(photoId)) {
          selected.push(photoId);
        }
      }
    });

    return selected;
  };

  const getSelectionRectStyle = () => {
    const start = dragStart();
    const end = dragEnd();
    return {
      position: "absolute" as const,
      left: `${Math.min(start.x, end.x)}px`,
      top: `${Math.min(start.y, end.y)}px`,
      width: `${Math.abs(end.x - start.x)}px`,
      height: `${Math.abs(end.y - start.y)}px`,
      border: "2px solid var(--color-selection)",
      background: "var(--color-selection-soft)",
      "pointer-events": "none" as const,
      "z-index": 100,
    };
  };

  // Add global mouse event listeners
  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    onCleanup(() => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    });
  }

  return (
    <Show
      when={props.photos.length > 0}
      fallback={
        <Show
          when={props.isLoading}
          fallback={
            <div>
              <p>No photos indexed yet. Run the indexer to get started.</p>
            </div>
          }
        >
          <p>Loading photos…</p>
        </Show>
      }
    >
      <div>
        <div
          style={{ height: "2rem", display: "flex", "align-items": "center" }}
        >
          <Show when={props.isLoading}>
            <span class="pill">Updating…</span>
          </Show>
        </div>
        <div
          ref={galleryRef}
          class="masonry wrapper switcher"
          onMouseDown={handleMouseDown}
          style={{ position: "relative", "user-select": "none" }}
        >
          <For each={photoColumns()}>
            {(column) => (
              <div class="flow">
                <For each={column}>
                  {({ photo, index }) => (
                    <PhotoCard
                      photo={photo}
                      index={index}
                      isSelected={() => props.selectedIds().has(photo.ID)}
                      isFocused={() => props.focusedIds().has(photo.ID)}
                      onToggleSelection={props.onToggleSelection}
                      onPhotoClick={props.onPhotoClick}
                      currentPage={props.currentPage}
                      onDelete={props.onDeletePhoto}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
          <Show when={isDragging() && !dragStartedOnCard()}>
            <div style={getSelectionRectStyle()} />
          </Show>
        </div>
      </div>
    </Show>
  );
}
