import { Show, createSignal, createEffect, onCleanup } from "solid-js";
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
import { useToast } from "../components/ToastProvider";
import { ConfirmModal } from "../components/ConfirmModal";

export function GalleryPage() {
  console.log("GalleryPage mounted!");

  const { pushToast } = useToast();

  type ActiveFilters = {
    tags: string;
    tagsLogic: string;
    notTags: string;
    people: string;
    peopleLogic: string;
    notPeople: string;
    untagged: boolean;
  };

  const [activeFilters, setActiveFilters] = createSignal<ActiveFilters>({
    tags: "",
    tagsLogic: "and",
    notTags: "",
    people: "",
    peopleLogic: "and",
    notPeople: "",
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

    const notTagFilter = parseCsv(f.notTags).map((t) => t.toLowerCase());
    if (notTagFilter.length > 0) {
      if (notTagFilter.some((t) => photoTags.has(t))) return false;
    }

    if (peopleFilter.length > 0) {
      if (f.peopleLogic === "or") {
        if (!peopleFilter.some((p) => photoPeople.has(p))) return false;
      } else {
        if (!peopleFilter.every((p) => photoPeople.has(p))) return false;
      }
    }

    const notPeopleFilter = parseCsv(f.notPeople).map((p) => p.toLowerCase());
    if (notPeopleFilter.length > 0) {
      if (notPeopleFilter.some((p) => photoPeople.has(p))) return false;
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
      requestRefreshPhotos();
    } catch (error) {
      // Roll back optimistic update on failure.
      setPhotos(() => prevPhotos);
      setSelectedIds(() => prevSelected);
      const msg =
        error instanceof Error ? error.message : "Failed to delete photo";
      pushToast({ kind: "error", message: msg });
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
      requestRefreshPhotos();
    } catch (error) {
      setPhotos(() => prevPhotos);
      setSelectedIds(() => prevSelected);
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to delete selected photos";
      pushToast({ kind: "error", message: msg });
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
  const [focusedIds, setFocusedIds] = createSignal<Set<number>>(new Set());
  const [focusedIndex, setFocusedIndex] = createSignal<number | null>(null);
  const [focusAnchorIndex, setFocusAnchorIndex] = createSignal<number | null>(
    null,
  );
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

      setFocusedIds(() => new Set(rangeIds));
      setFocusAnchorIndex(start);
    } else {
      // Regular click: toggle
      toggleSelection(id);
      setFocusedIds(() => new Set([id]));
      setFocusAnchorIndex(index);
    }
    setFocusedIndex(index);
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

  const getGalleryColumnCount = () => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".gallery .gallery__item"),
    );
    if (items.length <= 1) return 1;

    const firstTop = items[0].getBoundingClientRect().top;
    let count = 1;
    for (let i = 1; i < items.length; i += 1) {
      const top = items[i].getBoundingClientRect().top;
      if (Math.abs(top - firstTop) < 2) {
        count += 1;
      } else {
        break;
      }
    }
    return Math.max(1, count);
  };

  const clampIndex = (index: number) => {
    if (photos().length === 0) return 0;
    return Math.max(0, Math.min(index, photos().length - 1));
  };

  const getRangePhotoIds = (start: number, end: number): number[] => {
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    return photos()
      .slice(from, to + 1)
      .map((p) => p.ID);
  };

  const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable
    );
  };

  const applyFocusMove = (
    nextIndex: number,
    modifiers: { shift: boolean; meta: boolean },
  ) => {
    const nextPhoto = photos()[nextIndex];
    if (!nextPhoto) return;

    if (!modifiers.shift && !modifiers.meta) {
      setFocusedIds(() => new Set([nextPhoto.ID]));
      setFocusAnchorIndex(nextIndex);
    } else if (modifiers.shift) {
      const anchor = focusAnchorIndex() ?? focusedIndex() ?? nextIndex;
      const rangeIds = getRangePhotoIds(anchor, nextIndex);
      if (modifiers.meta) {
        setFocusedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
      } else {
        setFocusedIds(() => new Set(rangeIds));
      }
      if (focusAnchorIndex() === null) {
        setFocusAnchorIndex(anchor);
      }
    } else if (modifiers.meta) {
      setFocusedIds((prev) => {
        const next = new Set(prev);
        next.add(nextPhoto.ID);
        return next;
      });
      setFocusAnchorIndex(nextIndex);
    }

    setFocusedIndex(nextIndex);
  };

  const toggleActiveSelectionFromFocus = () => {
    let focusIds = Array.from(focusedIds());
    if (focusIds.length === 0 && focusedIndex() !== null) {
      const photo = photos()[focusedIndex()!];
      if (photo) focusIds = [photo.ID];
    }

    if (focusIds.length === 0) return;

    const everyFocusedSelected = focusIds.every((id) => selectedIds().has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (everyFocusedSelected) {
        focusIds.forEach((id) => next.delete(id));
      } else {
        focusIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const navigateViewerByIndex = (index: number) => {
    const clamped = clampIndex(index);
    const target = photos()[clamped];
    if (!target) return;
    window.location.hash = target.file_hash;
  };

  const navigateViewerByDelta = (delta: number) => {
    const hash = viewerHash();
    if (!hash) return;
    const idx = photos().findIndex((p) => p.file_hash === hash);
    if (idx === -1) return;
    navigateViewerByIndex(idx + delta);
  };

  const navigateViewerByRow = (rows: number) => {
    const columns = getGalleryColumnCount();
    navigateViewerByDelta(rows * columns);
  };

  const handleGalleryKeyboard = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;

    if (viewerHash()) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateViewerByDelta(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateViewerByDelta(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateViewerByRow(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateViewerByRow(1);
      }
      return;
    }

    if (photos().length === 0) return;

    if (e.key === " ") {
      e.preventDefault();
      toggleActiveSelectionFromFocus();
      return;
    }

    const columns = getGalleryColumnCount();
    let delta: number | null = null;

    if (e.key === "ArrowLeft") delta = -1;
    if (e.key === "ArrowRight") delta = 1;
    if (e.key === "ArrowUp") delta = -columns;
    if (e.key === "ArrowDown") delta = columns;

    if (delta === null) return;

    e.preventDefault();
    const current = focusedIndex() ?? 0;
    const next = clampIndex(current + delta);
    applyFocusMove(next, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
  };

  createEffect(() => {
    window.addEventListener("keydown", handleGalleryKeyboard);
    return () => window.removeEventListener("keydown", handleGalleryKeyboard);
  });

  createEffect(() => {
    const idsOnPage = new Set(photos().map((p) => p.ID));
    setFocusedIds((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => {
        if (idsOnPage.has(id)) next.add(id);
      });
      return next;
    });

    if (photos().length === 0) {
      setFocusedIndex(null);
      setFocusAnchorIndex(null);
      return;
    }

    const idx = focusedIndex();
    if (idx === null || idx >= photos().length) {
      setFocusedIndex(0);
      setFocusAnchorIndex(0);
      setFocusedIds(() => new Set([photos()[0].ID]));
    }
  });

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

  // Debounced refresh: avoids repeated fetches (and resulting grid reflow)
  // when deleting multiple photos quickly.
  let refreshTimeoutId: number | undefined;
  const requestRefreshPhotos = (delayMs = 3000) => {
    if (refreshTimeoutId !== undefined) window.clearTimeout(refreshTimeoutId);
    refreshTimeoutId = window.setTimeout(() => {
      refreshTimeoutId = undefined;
      setRefreshPhotos((v) => !v);
    }, delayMs);
  };

  onCleanup(() => {
    if (refreshTimeoutId !== undefined) window.clearTimeout(refreshTimeoutId);
  });

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
      pushToast({
        kind: "error",
        message: "Failed to toggle performance monitoring",
      });
    }
  };

  const handleIndexing = async () => {
    try {
      await triggerIndexing();
      pushToast({
        kind: "success",
        message: "Indexing started in the background. Check back in a moment.",
      });
    } catch (error) {
      pushToast({ kind: "error", message: "Failed to start indexing" });
    }
  };

  const handleUpdateIndex = async () => {
    try {
      await triggerUpdateIndex();
      pushToast({
        kind: "success",
        message:
          "Index update started. Removed photos will be cleared from the database.",
      });
    } catch (error) {
      pushToast({ kind: "error", message: "Failed to update index" });
    }
  };

  const [showResetConfirm, setShowResetConfirm] = createSignal(false);
  const [resetInProgress, setResetInProgress] = createSignal(false);

  const handleResetIndex = async () => {
    setShowResetConfirm(true);
  };

  const confirmResetIndex = async () => {
    setResetInProgress(true);
    try {
      await resetAndReindex();
      pushToast({
        kind: "success",
        message: "Database reset. Full reindex started in the background.",
      });
      setRefreshPhotos((v) => !v);
      setShowResetConfirm(false);
    } catch (error) {
      pushToast({ kind: "error", message: "Failed to reset and reindex" });
    } finally {
      setResetInProgress(false);
    }
  };

  const handleSyncMetadata = async () => {
    try {
      const result = await syncMetadataToFiles();
      pushToast({
        kind: "success",
        message: `Synced metadata to ${result.photos_to_sync} files.`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to sync metadata to files";
      pushToast({ kind: "error", message: errorMessage });
    }
  };

  const handleImportMetadata = async () => {
    try {
      const result = await importMetadataFromFiles();
      pushToast({
        kind: "success",
        message: `Imported metadata for ${result.photos_with_metadata} of ${result.photos_scanned} files.`,
      });
      setRefreshPhotos((v) => !v);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to import metadata from files";
      pushToast({ kind: "error", message: errorMessage });
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
      <ConfirmModal
        open={showResetConfirm()}
        title="Reset database and reindex?"
        message="This will clear all existing photo records and tags."
        confirmLabel={resetInProgress() ? "Working…" : "Reset and reindex"}
        cancelLabel="Cancel"
        onClose={() => {
          if (!resetInProgress()) setShowResetConfirm(false);
        }}
        onConfirm={() => {
          if (!resetInProgress()) void confirmResetIndex();
        }}
      />
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
            notTags: filters.notTags,
            people: filters.people,
            peopleLogic: filters.peopleLogic,
            notPeople: filters.notPeople,
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
        onClearSelection={clearSelection}
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
              focusedIds={focusedIds}
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
