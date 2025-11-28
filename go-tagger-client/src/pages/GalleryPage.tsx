import {
  Show,
  createMemo,
  createResource,
  createSignal,
  createEffect,
} from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { Gallery } from "../components/Gallery";
import {
  fetchPhotos,
  batchTagPhotos,
  batchTagPeople,
  triggerIndexing,
  triggerUpdateIndex,
} from "../api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export function GalleryPage() {
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
        fetch(`${API_BASE}/media/photos/${hash}`, { method: "HEAD" })
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

  const closeViewer = () => {
    window.location.hash = "";
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && viewerHash()) {
      closeViewer();
    }
  };

  createEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = searchParams.page;
  const initialPage = parseInt(
    Array.isArray(pageParam) ? pageParam[0] : pageParam || "1",
    10
  );
  const [page, setPage] = createSignal(initialPage);
  const [limit, setLimit] = createSignal(50);

  // Filter states
  const [searchTags, setSearchTags] = createSignal("");
  const [tagsLogic, setTagsLogic] = createSignal<"and" | "or">("and");
  const [searchPeople, setSearchPeople] = createSignal("");
  const [peopleLogic, setPeopleLogic] = createSignal<"and" | "or">("and");
  const [searchName, setSearchName] = createSignal("");
  const [fileType, setFileType] = createSignal<"any" | "image" | "video">(
    "any"
  );
  const [beforeDate, setBeforeDate] = createSignal("");
  const [beforeTime, setBeforeTime] = createSignal("");
  const [afterDate, setAfterDate] = createSignal("");
  const [afterTime, setAfterTime] = createSignal("");

  // Tagging states
  const [tagInput, setTagInput] = createSignal("");
  const [peopleInput, setPeopleInput] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [showFilterPanel, setShowFilterPanel] = createSignal(false);
  const [showBatchPanel, setShowBatchPanel] = createSignal(false);
  // Update URL when page changes
  createEffect(() => {
    setSearchParams({ page: page().toString() });
  });

  const updatedLimit = (newValue: number) => {
    setLimit(newValue);
    setPage(1); // Reset to first page when limit changes
  };

  const [photosData, { refetch }] = createResource(page, (currentPage) =>
    fetchPhotos(currentPage, limit(), {
      tags: searchTags() || undefined,
      tagsOrAnd: tagsLogic(),
      people: searchPeople() || undefined,
      peopleOrAnd: peopleLogic(),
      name: searchName() || undefined,
      fileType: fileType() !== "any" ? fileType() : undefined,
      beforeDate: beforeDate() || undefined,
      beforeTime: beforeTime() || undefined,
      afterDate: afterDate() || undefined,
      afterTime: afterTime() || undefined,
    })
  );

  const photos = createMemo(() => photosData()?.data ?? []);
  const totalPages = createMemo(() => {
    const total = photosData()?.total ?? 0;
    return total > 0 ? Math.ceil(total / limit()) : 1;
  });

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

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      photos().forEach((photo) => next.add(photo.ID));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(() => new Set<number>());

  const handleBatchTag = async (event: Event) => {
    event.preventDefault();

    const ids = Array.from(selectedIds());
    const tags = tagInput()
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!ids.length || !tags.length) {
      setFeedback("Pick at least one photo and enter at least one tag.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await batchTagPhotos(ids, tags);
      setFeedback(`Tagged ${ids.length} photo(s) with ${tags.join(", ")}`);
      setTagInput("");
      clearSelection();
      await refetch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchPeople = async (event: Event) => {
    event.preventDefault();

    const ids = Array.from(selectedIds());
    const people = peopleInput()
      .split(",")
      .map((person) => person.trim())
      .filter(Boolean);

    if (!ids.length || !people.length) {
      setFeedback("Pick at least one photo and enter at least one person.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await batchTagPeople(ids, people);
      setFeedback(
        `Tagged ${ids.length} photo(s) with people: ${people.join(", ")}`
      );
      setPeopleInput("");
      clearSelection();
      await refetch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    refetch();
  };

  const handleClearFilters = () => {
    setSearchTags("");
    setTagsLogic("and");
    setSearchPeople("");
    setPeopleLogic("and");
    setSearchName("");
    setFileType("any");
    setBeforeDate("");
    setBeforeTime("");
    setAfterDate("");
    setAfterTime("");
    setPage(1);
    refetch();
  };

  const handleIndexing = async () => {
    try {
      await triggerIndexing();
      setFeedback("Indexing started.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setFeedback(message);
    }
  };

  const handleUpdateIndex = async () => {
    try {
      await triggerUpdateIndex();
      setFeedback("Index update started (checking for deleted/moved files).");
      setTimeout(() => refetch(), 2000); // Refetch after a delay
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setFeedback(message);
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
      </header>

      <section class="panel" id="filters-panel">
        <div class="panel__header" onClick={toggleFiltersPanel}>
          <h3>Search Filters</h3>
          <div class="panel__header-actions">
            <button
              id="filters-panel-close-btn"
              aria-label="Close Filters Panel"
            >
              {showFilterPanel() ? "˄" : "˅"}
            </button>
          </div>
        </div>
        <div class="tag-form">
          <div class="field-group">
            <label for="search-tags">Search by tags (comma-separated)</label>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                "align-items": "center",
              }}
            >
              <input
                id="search-tags"
                type="text"
                placeholder="beach, sunset, vacation"
                value={searchTags()}
                onInput={(event) => setSearchTags(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <select
                value={tagsLogic()}
                onChange={(e) =>
                  setTagsLogic(e.currentTarget.value as "and" | "or")
                }
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            </div>
          </div>
          <div class="field-group">
            <label for="search-people">
              Search by people (comma-separated)
            </label>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                "align-items": "center",
              }}
            >
              <input
                id="search-people"
                type="text"
                placeholder="John, Mary"
                value={searchPeople()}
                onInput={(event) => setSearchPeople(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <select
                value={peopleLogic()}
                onChange={(e) =>
                  setPeopleLogic(e.currentTarget.value as "and" | "or")
                }
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            </div>
          </div>
          <div class="field-group">
            <label for="search-name">Search by name</label>
            <input
              id="search-name"
              type="text"
              placeholder="vacation_2024"
              value={searchName()}
              onInput={(event) => setSearchName(event.currentTarget.value)}
            />
          </div>
          <div class="field-group">
            <label for="file-type">File type</label>
            <select
              id="file-type"
              value={fileType()}
              onChange={(e) =>
                setFileType(e.currentTarget.value as "any" | "image" | "video")
              }
            >
              <option value="any">Any</option>
              <option value="image">Images Only</option>
              <option value="video">Videos Only</option>
            </select>
          </div>
          <div
            style={{
              display: "grid",
              "grid-template-columns": "1fr 1fr",
              gap: "1rem",
              "grid-column": "span 2",
            }}
          >
            <div class="field-group">
              <label for="after-date">Taken after</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  id="after-date"
                  type="date"
                  value={afterDate()}
                  onInput={(event) => setAfterDate(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="time"
                  value={afterTime()}
                  onInput={(event) => setAfterTime(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div class="field-group">
              <label for="before-date">Taken before</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  id="before-date"
                  type="date"
                  value={beforeDate()}
                  onInput={(event) => setBeforeDate(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="time"
                  value={beforeTime()}
                  onInput={(event) => setBeforeTime(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              "grid-template-columns": "1fr 1fr",
              gap: "1rem",
              "grid-column": "span 2",
            }}
          >
            <div class="field-group">
              <label for="limit">Photos per page</label>
              <input
                id="limit"
                type="range"
                min="10"
                max="1000"
                value={limit()}
                onInput={(e) => updatedLimit(Number(e.currentTarget.value))}
              />
            </div>
            <p class="limit">Current limit: {limit()}</p>
          </div>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              "flex-wrap": "wrap",
              "grid-column": "span 2",
            }}
          >
            <button type="button" class="primary" onClick={handleSearch}>
              Search
            </button>
            <button type="button" class="ghost" onClick={handleClearFilters}>
              Clear Filters
            </button>
            <button type="button" class="ghost" onClick={handleIndexing}>
              Run Indexer
            </button>
            <button type="button" class="ghost" onClick={handleUpdateIndex}>
              Update Index
            </button>
          </div>
        </div>
      </section>

      <section class="panel" id="batch-tagging-panel">
        <div class="panel__header" onClick={toggleBatchPanel}>
          <h3>Batch Tagging</h3>
          <div class="panel__header-actions">
            <button
              id="batch-panel-close-btn"
              aria-label="Close Batch Tagging Panel"
            >
              {showBatchPanel() ? "˄" : "˅"}
            </button>
          </div>
        </div>
        <form class="tag-form" onSubmit={handleBatchTag}>
          <div class="field-group">
            <label for="tag-input">Add tags to selected photos</label>
            <input
              id="tag-input"
              type="text"
              placeholder="portrait, beach, favorites"
              value={tagInput()}
              onInput={(event) => setTagInput(event.currentTarget.value)}
            />
          </div>
          <button type="submit" class="primary" disabled={isSubmitting()}>
            {isSubmitting() ? "Tagging…" : "Apply Tags"}
          </button>
        </form>

        <form
          class="tag-form"
          onSubmit={handleBatchPeople}
          style={{ "margin-top": "1rem" }}
        >
          <div class="field-group">
            <label for="people-input">Add people to selected photos</label>
            <input
              id="people-input"
              type="text"
              placeholder="John, Mary, Alice"
              value={peopleInput()}
              onInput={(event) => setPeopleInput(event.currentTarget.value)}
            />
          </div>
          <button type="submit" class="primary" disabled={isSubmitting()}>
            {isSubmitting() ? "Tagging…" : "Apply People"}
          </button>
        </form>

        <div class="field-group" style={{ "margin-top": "1rem" }}>
          <label>Selection</label>
          <div class="selection-actions">
            <button type="button" class="ghost" onClick={selectAllVisible}>
              Select page
            </button>
            <button type="button" class="ghost" onClick={clearSelection}>
              Clear
            </button>
            <span>{selectedIds().size} selected</span>
          </div>
        </div>

        <Show when={feedback()}>
          {(message) => <p class="feedback">{message()}</p>}
        </Show>
      </section>

      <section class="panel panel--open">
        <div class="page-controls">
          <button
            type="button"
            class="ghost"
            disabled={page() === 1 || photosData.loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            ‹ Prev
          </button>
          <span>
            Page {page()} / {totalPages()}
          </span>
          <button
            type="button"
            class="ghost"
            disabled={page() >= totalPages() || photosData.loading}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next ›
          </button>
        </div>
        <Show
          when={photos().length === 0 && !photosData.loading}
          fallback={
            <Gallery
              photos={photos()}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              isLoading={photosData.loading}
              currentPage={page()}
            />
          }
        >
          <div>
            <p>No photos indexed yet. Run the indexer to get started.</p>
            <button onClick={handleIndexing}>Start Indexing</button>
          </div>
        </Show>
        <div class="page-controls">
          <button
            type="button"
            class="ghost"
            disabled={page() === 1 || photosData.loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            ‹ Prev
          </button>
          <span>
            Page {page()} / {totalPages()}
          </span>
          <button
            type="button"
            class="ghost"
            disabled={page() >= totalPages() || photosData.loading}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next ›
          </button>
        </div>
      </section>

      {/* Photo Viewer Modal */}
      <Show when={viewerHash()}>
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            "background-color": "rgba(0, 0, 0, 0.95)",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            "justify-content": "center",
            "z-index": 1000,
          }}
          onClick={closeViewer}
        >
          <div
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              color: "white",
              "font-size": "2rem",
              cursor: "pointer",
              "z-index": 1001,
            }}
            onClick={closeViewer}
          >
            ✕
          </div>

          <div
            style={{
              "max-width": "90vw",
              "max-height": "90vh",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Show when={mediaLoading()}>
              <p style={{ color: "white" }}>Loading...</p>
            </Show>

            <Show when={!mediaLoading()}>
              <Show
                when={isVideo()}
                fallback={
                  <img
                    src={`${API_BASE}/media/photos/${viewerHash()}`}
                    alt="Full size"
                    style={{
                      "max-width": "100%",
                      "max-height": "100%",
                      "object-fit": "contain",
                    }}
                  />
                }
              >
                <video
                  controls
                  autoplay
                  style={{ "max-width": "100%", "max-height": "100%" }}
                >
                  <source src={`${API_BASE}/media/photos/${viewerHash()}`} />
                </video>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
    </main>
  );
}
