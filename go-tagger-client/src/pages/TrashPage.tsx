import { Show, createEffect, createSignal } from "solid-js";
import type { Photo } from "../types";
import {
  fetchTrashPhotos,
  permanentlyDeletePhotos,
  restorePhotos,
} from "../api";
import { PageControls } from "../components/PageControls";
import { TopNav } from "../components/TopNav";
import { TrashGallery } from "../components/TrashGallery";
import { TrashGalleryControls } from "../components/TrashGalleryControls";
import { PhotoViewerModal } from "./PhotoViewerModal";

export function TrashPage() {
  const [viewerHash, setViewerHash] = createSignal<string | null>(null);
  const [isVideo, setIsVideo] = createSignal(false);
  const [mediaLoading, setMediaLoading] = createSignal(false);
  const [savedScrollY, setSavedScrollY] = createSignal(0);

  createEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      const wasOpen = viewerHash() !== null;
      const willBeOpen = hash !== "";

      if (!wasOpen && willBeOpen) {
        setSavedScrollY(window.scrollY);
        document.body.style.overflow = "hidden";
      }

      if (wasOpen && !willBeOpen) {
        document.body.style.overflow = "";
        window.scrollTo(0, savedScrollY());
      }

      setViewerHash(hash || null);

      if (hash) {
        setMediaLoading(true);
        fetch(`/media/photos/${hash}`, { method: "HEAD" })
          .then((response) => {
            const contentType = response.headers.get("content-type") || "";
            setIsVideo(contentType.startsWith("video/"));
            setMediaLoading(false);
          })
          .catch(() => {
            setMediaLoading(false);
          });
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => window.removeEventListener("hashchange", handleHashChange);
  });

  const limit = 50;
  const [photos, setPhotos] = createSignal<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = createSignal(false);
  const [totalPages, setTotalPages] = createSignal(1);
  const [currentPage, setCurrentPage] = createSignal(1);
  const [refreshPhotos, setRefreshPhotos] = createSignal(false);

  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = createSignal<number | null>(
    null,
  );

  const clearSelection = () => setSelectedIds(() => new Set<number>());

  const handlePhotoClick = (id: number, index: number, shiftKey: boolean) => {
    if (shiftKey && lastClickedIndex() !== null) {
      const start = Math.min(lastClickedIndex()!, index);
      const end = Math.max(lastClickedIndex()!, index);
      const rangeIds = photos()
        .slice(start, end + 1)
        .map((p) => p.ID);

      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((pid) => next.add(pid));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    setLastClickedIndex(index);
  };

  const selectMultiple = (ids: number[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllOnPage = () => {
    const photoIds = photos().map((p) => p.ID);
    setSelectedIds(() => new Set(photoIds));
  };

  const unselectAllOnPage = () => {
    const photoIds = new Set(photos().map((p) => p.ID));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      photoIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleSelectAll = () => {
    const photoIds = photos().map((p) => p.ID);
    const allSelected = photoIds.every((id) => selectedIds().has(id));
    if (allSelected) unselectAllOnPage();
    else selectAllOnPage();
  };

  const reconcilePhotosById = (prev: Photo[], next: Photo[]): Photo[] => {
    if (!Array.isArray(prev) || prev.length === 0) return next;
    if (!Array.isArray(next) || next.length === 0) return [];

    const prevById = new Map<number, Photo>();
    for (const p of prev) prevById.set(p.ID, p);

    return next.map((p) => {
      const existing = prevById.get(p.ID);
      if (!existing) return p;
      Object.assign(existing, p);
      return existing;
    });
  };

  const loadTrash = async () => {
    setPhotosLoading(true);
    try {
      const res = await fetchTrashPhotos(currentPage(), limit);
      const pages = Math.max(1, Math.ceil(res.total / limit));
      setTotalPages(pages);

      // If the page became invalid (e.g. after deleting the last item on the
      // last page), clamp and let the reactive effect refetch.
      if (currentPage() > pages) {
        setPhotosLoading(false);
        setCurrentPage(pages);
        return;
      }

      setPhotos((prev) => reconcilePhotosById(prev, res.data));

      // Keep selection only for items still visible.
      const visible = new Set(res.data.map((p) => p.ID));
      setSelectedIds((prev) => {
        const next = new Set<number>();
        prev.forEach((id) => {
          if (visible.has(id)) next.add(id);
        });
        return next;
      });
    } catch {
      setPhotos([]);
      setTotalPages(1);
    } finally {
      setPhotosLoading(false);
    }
  };

  createEffect(() => {
    currentPage();
    refreshPhotos();
    loadTrash();
  });

  const handleRestorePhoto = async (id: number) => {
    try {
      await restorePhotos([id]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRefreshPhotos((v) => !v);
    } catch {
      // optionally log
    }
  };

  const handlePermanentDeletePhoto = async (id: number) => {
    try {
      await permanentlyDeletePhotos([id]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRefreshPhotos((v) => !v);
    } catch {
      // optionally log
    }
  };

  const handleBatchRestore = async () => {
    const ids = Array.from(selectedIds());
    if (!ids.length) return;
    try {
      await restorePhotos(ids);
      clearSelection();
      setRefreshPhotos((v) => !v);
    } catch {
      // optionally log
    }
  };

  const handleBatchPermanentDelete = async () => {
    const ids = Array.from(selectedIds());
    if (!ids.length) return;
    try {
      await permanentlyDeletePhotos(ids);
      clearSelection();
      setRefreshPhotos((v) => !v);
    } catch {
      // optionally log
    }
  };

  return (
    <main class="app-shell">
      <TopNav />

      <header class="app-shell__header">
        <div>
          <h1>Trash</h1>
          <p class="subtitle">Soft-deleted photos (marked for deletion).</p>
        </div>
      </header>

      <section class="panel panel--open">
        <PageControls
          page={currentPage}
          totalPages={totalPages}
          setPage={setCurrentPage}
          photosLoading={photosLoading}
        />

        <div style={{ position: "relative" }}>
          <TrashGalleryControls
            photos={photos()}
            selectedIds={selectedIds}
            onToggleSelectAll={toggleSelectAll}
            onBatchRestore={handleBatchRestore}
            onBatchPermanentDelete={handleBatchPermanentDelete}
          />

          <TrashGallery
            photos={photos()}
            selectedIds={selectedIds}
            onPhotoClick={handlePhotoClick}
            onSelectMultiple={selectMultiple}
            isLoading={photosLoading()}
            onRestore={handleRestorePhoto}
            onPermanentDelete={handlePermanentDeletePhoto}
          />
        </div>

        <PageControls
          page={currentPage}
          totalPages={totalPages}
          setPage={setCurrentPage}
          photosLoading={photosLoading}
        />
      </section>

      <Show when={viewerHash()}>
        <PhotoViewerModal
          hash={viewerHash()!}
          isVideo={isVideo()}
          loading={mediaLoading()}
        />
      </Show>
    </main>
  );
}
