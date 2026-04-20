import { Show, createEffect, createSignal } from "solid-js";
import type { Photo } from "../types";
import {
  emptyTrash,
  fetchTrashPhotos,
  permanentlyDeletePhotos,
  restorePhotos,
} from "../api";
import { PageControls } from "../components/PageControls";
import { TopNav } from "../components/TopNav";
import { TrashGallery } from "../components/TrashGallery";
import { TrashGalleryControls } from "../components/TrashGalleryControls";
import { ConfirmModal } from "../components/ConfirmModal";
import { useToast } from "../components/ToastProvider";
import { PhotoViewerModal } from "./PhotoViewerModal";

export function TrashPage() {
  const { pushToast } = useToast();
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

  const [limit, setLimit] = createSignal(50);
  const [photos, setPhotos] = createSignal<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = createSignal(false);
  const [totalPages, setTotalPages] = createSignal(1);
  const [totalItems, setTotalItems] = createSignal(0);
  const [currentPage, setCurrentPage] = createSignal(1);
  const [refreshPhotos, setRefreshPhotos] = createSignal(false);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = createSignal(false);
  const [emptyTrashInProgress, setEmptyTrashInProgress] = createSignal(false);

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

  const unselectMultiple = (ids: number[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
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
      const res = await fetchTrashPhotos(currentPage(), limit());
      setTotalItems(res.total ?? 0);
      const pages = Math.max(1, Math.ceil(res.total / limit()));
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
      setTotalItems(0);
      pushToast({ kind: "error", message: "Failed to load trash." });
    } finally {
      setPhotosLoading(false);
    }
  };

  createEffect(() => {
    currentPage();
    limit();
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
      pushToast({ kind: "success", message: "Photo restored." });
    } catch {
      pushToast({ kind: "error", message: "Failed to restore photo." });
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
      pushToast({ kind: "success", message: "Photo permanently deleted." });
    } catch {
      pushToast({
        kind: "error",
        message: "Failed to permanently delete photo.",
      });
    }
  };

  const handleBatchRestore = async () => {
    const ids = Array.from(selectedIds());
    if (!ids.length) return;
    try {
      await restorePhotos(ids);
      clearSelection();
      setRefreshPhotos((v) => !v);
      pushToast({
        kind: "success",
        message: `Restored ${ids.length} photo${ids.length === 1 ? "" : "s"}.`,
      });
    } catch {
      pushToast({
        kind: "error",
        message: "Failed to restore selected photos.",
      });
    }
  };

  const handleBatchPermanentDelete = async () => {
    const ids = Array.from(selectedIds());
    if (!ids.length) return;
    try {
      await permanentlyDeletePhotos(ids);
      clearSelection();
      setRefreshPhotos((v) => !v);
      pushToast({
        kind: "success",
        message: `Deleted ${ids.length} selected photo${ids.length === 1 ? "" : "s"}.`,
      });
    } catch {
      pushToast({
        kind: "error",
        message: "Failed to delete selected photos.",
      });
    }
  };

  const handleLimitChange = (nextLimit: number) => {
    setLimit(nextLimit);
    setCurrentPage(1);
  };

  const handleEmptyTrash = async () => {
    setEmptyTrashInProgress(true);
    try {
      await emptyTrash();
      clearSelection();
      setPhotos([]);
      setCurrentPage(1);
      setTotalItems(0);
      setTotalPages(1);
      setShowEmptyTrashConfirm(false);
      pushToast({ kind: "success", message: "Trash emptied." });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to empty trash.";
      pushToast({ kind: "error", message });
    } finally {
      setEmptyTrashInProgress(false);
    }
  };

  return (
    <main class="app-shell">
      <ConfirmModal
        open={showEmptyTrashConfirm()}
        title="Empty trash permanently?"
        message="This will permanently delete all trashed photos and their thumbnails. This cannot be undone."
        confirmLabel={emptyTrashInProgress() ? "Emptying…" : "Empty Trash"}
        cancelLabel="Cancel"
        onClose={() => {
          if (!emptyTrashInProgress()) setShowEmptyTrashConfirm(false);
        }}
        onConfirm={() => {
          if (!emptyTrashInProgress()) void handleEmptyTrash();
        }}
      />
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

        <div>
          <TrashGalleryControls
            photos={photos()}
            totalItems={totalItems()}
            limit={limit()}
            selectedIds={selectedIds}
            onLimitChange={handleLimitChange}
            onToggleSelectAll={toggleSelectAll}
            onEmptyTrash={() => setShowEmptyTrashConfirm(true)}
            emptyTrashInProgress={emptyTrashInProgress()}
            onBatchRestore={handleBatchRestore}
            onBatchPermanentDelete={handleBatchPermanentDelete}
          />

          <TrashGallery
            photos={photos()}
            selectedIds={selectedIds}
            onPhotoClick={handlePhotoClick}
            onSelectMultiple={selectMultiple}
            onUnselectMultiple={unselectMultiple}
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
