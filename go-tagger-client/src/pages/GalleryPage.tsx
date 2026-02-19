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
  importMetadataFromFiles,
} from "../api";
import { FilterPanel } from "../components/FilterPanel";
import { BatchTaggingPanel } from "../components/BatchTaggingPanel";
import { PageControls } from "../components/PageControls";
import { PhotoViewerModal } from "./PhotoViewerModal";
import { AppHeader } from "../components/AppHeader";
import { GalleryControls } from "../components/GalleryControls";
import { TopNav } from "../components/TopNav";

export function GalleryPage() {
  console.log("GalleryPage mounted!");

  type ActiveFilters = {
    tags: string;
    tagsLogic: string;
    people: string;
    peopleLogic: string;
    untagged: boolean;
  };

  const [activeFilters, setActiveFilters] = createSignal<ActiveFilters>({
    tags: "",
    tagsLogic: "and",
    people: "",
    peopleLogic: "and",
    untagged: false,
  });

  const parseCsv = (value: string): string[] =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const matchesActiveFilters = (photo: any): boolean => {
    const f = activeFilters();
    const tagFilter = parseCsv(f.tags).map((t) => t.toLowerCase());
    const peopleFilter = parseCsv(f.people).map((p) => p.toLowerCase());

    const photoTags = new Set(
      (photo.tags ?? []).map((t: any) => String(t.name ?? "").toLowerCase()),
    );
    const photoPeople = new Set(
      (photo.people ?? []).map((p: any) => String(p.name ?? "").toLowerCase()),
    );

    if (f.untagged) {
      // Match server semantics: "untagged" means no tags AND no people.
      if (photoTags.size > 0 || photoPeople.size > 0) return false;
    }

    if (tagFilter.length > 0) {
      if (f.tagsLogic === "or") {
        if (!tagFilter.some((t) => photoTags.has(t))) return false;
      } else {
        if (!tagFilter.every((t) => photoTags.has(t))) return false;
      }
    }

    if (peopleFilter.length > 0) {
      if (f.peopleLogic === "or") {
        if (!peopleFilter.some((p) => photoPeople.has(p))) return false;
      } else {
        if (!peopleFilter.every((p) => photoPeople.has(p))) return false;
      }
    }

    return true;
  };

  const handleApplyBatchChanges = (change: {
    entity: "tags" | "people";
    photoIds: number[];
    add: string[];
    remove: string[];
  }): { rollback: () => void; commit: () => void } => {
    const prevPhotos = photos();

    const addSet = new Set(change.add.map((s) => s.trim()).filter(Boolean));
    const removeSet = new Set(
      change.remove.map((s) => s.trim()).filter(Boolean),
    );
    const idSet = new Set(change.photoIds);

    let droppedFromFilter = false;

    setPhotos((prev) => {
      const updated = prev.map((photo) => {
        if (!idSet.has(photo.ID)) return photo;

        if (change.entity === "tags") {
          const existing = Array.isArray(photo.tags) ? photo.tags : [];
          const nextByLower = new Map<string, any>();
          for (const t of existing) {
            const name = String(t?.name ?? "").trim();
            if (!name) continue;
            nextByLower.set(name.toLowerCase(), { ...t, name });
          }

          for (const r of removeSet) {
            nextByLower.delete(r.toLowerCase());
          }
          for (const a of addSet) {
            const key = a.toLowerCase();
            if (!nextByLower.has(key)) {
              nextByLower.set(key, { ID: 0, name: a });
            }
          }

          const tags = Array.from(nextByLower.values());
          return { ...photo, tags };
        }

        // people
        const existing = Array.isArray(photo.people) ? photo.people : [];
        const nextByLower = new Map<string, any>();
        for (const p of existing) {
          const name = String(p?.name ?? "").trim();
          if (!name) continue;
          nextByLower.set(name.toLowerCase(), { ...p, name });
        }

        for (const r of removeSet) {
          nextByLower.delete(r.toLowerCase());
        }
        for (const a of addSet) {
          const key = a.toLowerCase();
          if (!nextByLower.has(key)) {
            nextByLower.set(key, { ID: 0, name: a });
          }
        }

        const people = Array.from(nextByLower.values());
        return { ...photo, people };
      });

      const filtered = updated.filter(matchesActiveFilters);
      droppedFromFilter = filtered.length < updated.length;
      return filtered;
    });

    return {
      rollback: () => setPhotos(() => prevPhotos),
      commit: () => {
        // If photos fell out of the active filter, backfill in background.
        // This must happen *after* the server mutation completes, otherwise
        // a "show untagged" refresh can bring the photo right back.
        if (droppedFromFilter) {
          setRefreshPhotos((v) => !v);
        }
      },
    };
  };

  // Single photo delete handler
  const handleDeletePhoto = async (id: number) => {
    const prevPhotos = photos();
    const prevSelected = selectedIds();

    // Optimistically update UI first (no full re-fetch needed to remove from DOM)
    setPhotos((prev) => prev.filter((p) => p.ID !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      await deletePhotos([id]);
      // Background refresh to backfill the page and keep pagination correct.
      setRefreshPhotos((v) => !v);
    } catch (error) {
      // Roll back optimistic update on failure.
      setPhotos(() => prevPhotos);
      setSelectedIds(() => prevSelected);
      const msg =
        error instanceof Error ? error.message : "Failed to delete photo";
      alert(msg);
    }
  };

  // Batch delete handler
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds());
    if (!ids.length) return;
    const prevPhotos = photos();
    const prevSelected = selectedIds();

    // Optimistically remove from the current page.
    const idSet = new Set(ids);
    setPhotos((prev) => prev.filter((p) => !idSet.has(p.ID)));
    clearSelection();

    try {
      await deletePhotos(ids);
      // Background refresh to backfill and recalc total pages.
      setRefreshPhotos((v) => !v);
    } catch (error) {
      setPhotos(() => prevPhotos);
      setSelectedIds(() => prevSelected);
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to delete selected photos";
      alert(msg);
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

  const handleImportMetadata = async () => {
    try {
      const result = await importMetadataFromFiles();
      alert(
        `Imported metadata for ${result.photos_with_metadata} of ${result.photos_scanned} files.`,
      );
      setRefreshPhotos((v) => !v);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to import metadata from files";
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
      <TopNav />
      <AppHeader
        perfMonitoring={perfMonitoring}
        onTogglePerfMonitoring={handleTogglePerfMonitoring}
        onIndexing={handleIndexing}
        onUpdateIndex={handleUpdateIndex}
        onResetIndex={handleResetIndex}
        onSyncMetadata={handleSyncMetadata}
        onImportMetadata={handleImportMetadata}
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
        onFilterChange={(filters) =>
          setActiveFilters({
            tags: filters.tags,
            tagsLogic: filters.tagsLogic,
            people: filters.people,
            peopleLogic: filters.peopleLogic,
            untagged: filters.untagged,
          })
        }
      />

      <BatchTaggingPanel
        selectedPhotoIds={() => Array.from(selectedIds())}
        selectedPhotos={() => photos().filter((p) => selectedIds().has(p.ID))}
        onApplyChanges={handleApplyBatchChanges}
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

        <button
          type="button"
          class="ghost"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            right: "1rem",
            bottom: "1rem",
            "z-index": 50,
          }}
        >
          Back to top
        </button>
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
