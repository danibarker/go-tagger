import { For, Show, createSignal, onCleanup } from "solid-js";
import type { Photo } from "../types";
import { TrashPhotoCard } from "./TrashPhotoCard";

type TrashGalleryProps = {
  photos: Photo[];
  selectedIds: () => Set<number>;
  onPhotoClick: (id: number, index: number, shiftKey: boolean) => void;
  onSelectMultiple: (ids: number[]) => void;
  isLoading: boolean;
  onRestore?: (id: number) => void;
  onPermanentDelete?: (id: number) => void;
};

export function TrashGallery(props: TrashGalleryProps) {
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = createSignal({ x: 0, y: 0 });
  const [dragStartedOnCard, setDragStartedOnCard] = createSignal(false);
  let galleryRef: HTMLDivElement | undefined;

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const isOnCard = target.closest(".gallery__item") !== null;

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

    const selectedInDrag = getPhotosInRect();
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

    photoElements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const galleryRect = galleryRef!.getBoundingClientRect();
      const photoRect = {
        left: rect.left - galleryRect.left + galleryRef!.scrollLeft,
        top: rect.top - galleryRect.top + galleryRef!.scrollTop,
        right: rect.right - galleryRect.left + galleryRef!.scrollLeft,
        bottom: rect.bottom - galleryRect.top + galleryRef!.scrollTop,
      };

      if (
        selectionRect.left < photoRect.right &&
        selectionRect.right > photoRect.left &&
        selectionRect.top < photoRect.bottom &&
        selectionRect.bottom > photoRect.top
      ) {
        const photo = props.photos[index];
        if (photo) selected.push(photo.ID);
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
      border: "2px solid #0066cc",
      background: "rgba(0, 102, 204, 0.1)",
      "pointer-events": "none" as const,
      "z-index": 100,
    };
  };

  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    onCleanup(() => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    });
  }

  return (
    <Show when={!props.isLoading} fallback={<p>Loading trash…</p>}>
      <Show when={props.photos.length > 0} fallback={<p>Trash is empty.</p>}>
        <div
          ref={galleryRef}
          class="gallery"
          onMouseDown={handleMouseDown}
          style={{ position: "relative", "user-select": "none" }}
        >
          <For each={props.photos}>
            {(photo, index) => (
              <TrashPhotoCard
                photo={photo}
                index={index()}
                isSelected={() => props.selectedIds().has(photo.ID)}
                onPhotoClick={props.onPhotoClick}
                onRestore={props.onRestore}
                onPermanentDelete={props.onPermanentDelete}
              />
            )}
          </For>
          <Show when={isDragging() && !dragStartedOnCard()}>
            <div style={getSelectionRectStyle()} />
          </Show>
        </div>
      </Show>
    </Show>
  );
}
