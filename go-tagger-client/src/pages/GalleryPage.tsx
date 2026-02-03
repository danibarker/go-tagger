import { Show, createSignal, createEffect } from "solid-js";
import { Gallery } from "../components/Gallery";
import {
  triggerIndexing,
  triggerUpdateIndex,
  resetAndReindex,
  deletePhotos,
  getPerfMonitoring,
  setPerfMonitoring,
} from "../api";
import { FilterPanel } from "../components/FilterPanel";
import { BatchTaggingPanel } from "../components/BatchTaggingPanel";
import { PageControls } from "../components/PageControls";
import { PhotoViewerModal } from "./PhotoViewerModal";

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
      <header class="app-shell__header">
        <div>
          <h1>Go Tagger</h1>
          <p class="subtitle">Quickly preview photos and batch tag them.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" class="ghost" onClick={handleIndexing}>
            Start Indexing
          </button>
          <button type="button" class="ghost" onClick={handleUpdateIndex}>
            Update Index
          </button>
          <button type="button" class="ghost" onClick={handleResetIndex}>
            Reset & Reindex
          </button>
          <label
            style={{
              display: "flex",
              "align-items": "center",
              gap: "0.25rem",
              cursor: "pointer",
              "margin-left": "1rem",
            }}
          >
            <input
              type="checkbox"
              checked={perfMonitoring()}
              onChange={handleTogglePerfMonitoring}
            />
            <span>Performance Monitoring</span>
          </label>
        </div>
      </header>

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
              <button type="button" class="ghost" onClick={toggleSelectAll}>
                {photos().length > 0 &&
                photos().every((p) => selectedIds().has(p.ID))
                  ? "Unselect All"
                  : "Select All"}
              </button>
              {selectedIds().size > 0 && (
                <button
                  type="button"
                  onClick={handleBatchDelete}
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
              )}
            </div>
            <Gallery
              photos={photos()}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
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
