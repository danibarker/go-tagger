import { Show, createSignal, createEffect } from "solid-js";
import { Gallery } from "../components/Gallery";
import {
  triggerIndexing,
  triggerUpdateIndex,
  resetAndReindex,
  deletePhotos,
  getPerfMonitoring,
  setPerfMonitoring,
  syncMetadataToFiles,
} from "../api";
import { FilterPanel } from "../components/FilterPanel";
import { BatchTaggingPanel } from "../components/BatchTaggingPanel";
import { PageControls } from "../components/PageControls";
import { PhotoViewerModal } from "./PhotoViewerModal";
import { AppHeader } from "../components/AppHeader";
import { GalleryControls } from "../components/GalleryControls";

export function GalleryPage() {
  console.log("GalleryPage mounted!");

  // Single photo delete handler
  const handleDeletePhoto = async (id: number) => {
    try {
      await deletePhotos([id]);
      setRefreshPhotos((v) => !v);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      // Optionally log error
    }
  };

  // Batch delete handler
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds());
    if (!ids.length) return;
    try {
      await deletePhotos(ids);
      clearSelection();
      setRefreshPhotos((v) => !v);
    } catch (error) {
      // Optionally log error
    }
  };
  const [viewerHash, setViewerHash] = createSignal<string | null>(null);
  const [isVideo, setIsVideo] = createSignal(false);
  const [mediaLoading, setMediaLoading] = createSignal(false);
  const [savedScrollY, setSavedScrollY] = createSignal(0);

  // Listen for hash changes to open/close viewer
  createEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      const wasOpen = viewerHash() !== null;
      const willBeOpen = hash !== "";

      // Save scroll position when opening modal
      if (!wasOpen && willBeOpen) {
        setSavedScrollY(window.scrollY);
        document.body.style.overflow = "hidden";
      }

      // Restore scroll position when closing modal
      if (wasOpen && !willBeOpen) {
        document.body.style.overflow = "";
        window.scrollTo(0, savedScrollY());
      }

      setViewerHash(hash || null);

      if (hash) {
        // Check if it's a video
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
    handleHashChange(); // Check initial hash

    return () => window.removeEventListener("hashchange", handleHashChange);
  });

  // Page state
  const initialPage = 1;
  const [limit, setLimit] = createSignal(50);

  // Tagging states
  const [tagInput, setTagInput] = createSignal("");
  const [peopleInput, setPeopleInput] = createSignal("");
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = createSignal<number | null>(
    null,
  );
  const [showFilterPanel, setShowFilterPanel] = createSignal(false);
  const [showBatchPanel, setShowBatchPanel] = createSignal(false);
  const [perfMonitoring, setPerfMonitoringState] = createSignal(true);
  // Photo data, loading state, and pagination info will come from FilterPanel
  const [photos, setPhotos] = createSignal<any[]>([]);
  const [photosLoading, setPhotosLoading] = createSignal(false);
  const [totalPages, setTotalPages] = createSignal(1);
  const [currentPage, setCurrentPage] = createSignal(initialPage);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePhotoClick = (id: number, index: number, shiftKey: boolean) => {
    if (shiftKey && lastClickedIndex() !== null) {
      // Shift-click: select range
      const start = Math.min(lastClickedIndex()!, index);
      const end = Math.max(lastClickedIndex()!, index);
      const rangeIds = photos()
        .slice(start, end + 1)
        .map((p) => p.ID);

      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      // Regular click: toggle
      toggleSelection(id);
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

  const clearSelection = () => setSelectedIds(() => new Set<number>());

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

    if (allSelected) {
      unselectAllOnPage();
    } else {
      selectAllOnPage();
    }
  };

  // Refresh trigger for FilterPanel
  const [refreshPhotos, setRefreshPhotos] = createSignal(false);

  // Fetch initial performance monitoring state
  createEffect(() => {
    getPerfMonitoring()
      .then((data) => setPerfMonitoringState(data.enabled))
      .catch(() => {
        // Ignore error, use default value
      });
  });

  const handleTogglePerfMonitoring = async () => {
    const newValue = !perfMonitoring();
    try {
      await setPerfMonitoring(newValue);
      setPerfMonitoringState(newValue);
    } catch (error) {
      alert("Failed to toggle performance monitoring");
    }
  };

  const handleIndexing = async () => {
    try {
      await triggerIndexing();
      alert(
        "Indexing started in the background. Please refresh the page in a few moments.",
      );
    } catch (error) {
      alert("Failed to start indexing");
    }
  };

  const handleUpdateIndex = async () => {
    try {
      await triggerUpdateIndex();
      alert(
        "Index update started. Removed photos will be cleared from the database.",
      );
    } catch (error) {
      alert("Failed to update index");
    }
  };

  const handleResetIndex = async () => {
    if (
      !confirm(
        "Are you sure you want to reset the database and reindex? This will clear all existing photo records and tags.",
      )
    ) {
      return;
    }
    try {
      await resetAndReindex();
      alert(
        "Database reset. Full reindex started in the background. Please refresh the page in a few moments.",
      );
      setRefreshPhotos((v) => !v);
    } catch (error) {
      alert("Failed to reset and reindex");
    }
  };

  const handleSyncMetadata = async () => {
    try {
      const result = await syncMetadataToFiles();
      alert(
        `Successfully synced metadata to ${result.photos_to_sync} files. All tags and people from the database have been written to the actual image files.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to sync metadata to files";
      alert(`Error: ${errorMessage}`);
    }
  };

  const toggleFiltersPanel = () => {
    const panel = document.getElementById("filters-panel");
    if (panel) {
      panel.classList.toggle("panel--open");
      setShowFilterPanel(!showFilterPanel());
    }
  };
  const toggleBatchPanel = () => {
    const panel = document.getElementById("batch-tagging-panel");
    if (panel) {
      panel.classList.toggle("panel--open");
      setShowBatchPanel(!showBatchPanel());
    }
  };

  return (
    <main class="app-shell">
      <AppHeader
        perfMonitoring={perfMonitoring}
        onTogglePerfMonitoring={handleTogglePerfMonitoring}
        onIndexing={handleIndexing}
        onUpdateIndex={handleUpdateIndex}
        onResetIndex={handleResetIndex}
        onSyncMetadata={handleSyncMetadata}
      />

      <FilterPanel
        showFilterPanel={showFilterPanel}
        toggleFiltersPanel={toggleFiltersPanel}
        limit={limit}
        setLimit={setLimit}
        page={currentPage}
        setPage={setCurrentPage}
        setPhotos={setPhotos}
        setPhotosLoading={setPhotosLoading}
        setTotalPages={setTotalPages}
        refreshPhotos={refreshPhotos}
      />

      <BatchTaggingPanel
        selectedPhotoIds={() => Array.from(selectedIds())}
        selectedPhotos={() => photos().filter((p) => selectedIds().has(p.ID))}
        onUpdated={() => setRefreshPhotos((v) => !v)}
        tagInput={tagInput}
        setTagInput={setTagInput}
        peopleInput={peopleInput}
        setPeopleInput={setPeopleInput}
        showBatchPanel={showBatchPanel}
        toggleBatchPanel={toggleBatchPanel}
      />

      <section class="panel panel--open">
        <PageControls
          page={currentPage}
          totalPages={totalPages}
          setPage={setCurrentPage}
          photosLoading={photosLoading}
        />
        <Show
          when={photos().length > 0 || photosLoading()}
          fallback={
            <div>
              <p>No photos indexed yet. Run the indexer to get started.</p>
              <button onClick={handleIndexing}>Start Indexing</button>
            </div>
          }
        >
          <div style={{ position: "relative" }}>
            <GalleryControls
              photos={photos()}
              selectedIds={selectedIds}
              onToggleSelectAll={toggleSelectAll}
              onBatchDelete={handleBatchDelete}
            />
            <Gallery
              photos={photos()}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              onPhotoClick={handlePhotoClick}
              onSelectMultiple={selectMultiple}
              isLoading={photosLoading()}
              currentPage={currentPage()}
              onDeletePhoto={handleDeletePhoto}
            />
          </div>
        </Show>
        <PageControls
          page={currentPage}
          totalPages={totalPages}
          setPage={setCurrentPage}
          photosLoading={photosLoading}
        />
      </section>

      {/* Photo Viewer Modal */}
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
