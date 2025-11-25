import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

type Photo = {
  id: number;
  thumbnail_path: string | null;
  file_hash: string;
  width: number;
  height: number;
  file_type: string;
  taken_at?: string;
};

type PhotosResponse = {
  data: Photo[];
  total: number;
  page: number;
  limit: number;
};

const fetchPhotos = async (
  page: number,
  limit: number
): Promise<PhotosResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const res = await fetch(`${API_BASE}/api/photos?${params.toString()}`);
  if (!res.ok) {
    let message = "Failed to fetch photos";
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // ignore JSON parse errors and bubble default message
    }
    throw new Error(message);
  }

  return (await res.json()) as PhotosResponse;
};

function App() {
  const [page, setPage] = createSignal(1);
  const [limit] = createSignal(50);
  const [tagInput, setTagInput] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());

  const [photosData, { refetch }] = createResource(page, (currentPage) =>
    fetchPhotos(currentPage, limit())
  );

  const photos = createMemo(() => photosData()?.data ?? []);
  const totalPages = createMemo(() => {
    const total = photosData()?.total ?? 0;
    return total > 0 ? Math.ceil(total / limit()) : 1;
  });
  const allSelected = createMemo(
    () =>
      photos().length > 0 &&
      photos().every((photo) => selectedIds().has(photo.id))
  );

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
      photos().forEach((photo) => next.add(photo.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(() => new Set());

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
      const res = await fetch(`${API_BASE}/api/photos/batch/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_ids: ids, new_tags: tags }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to batch tag photos");
      }

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

  return (
    <main class="app-shell">
      <header class="app-shell__header">
        <div>
          <h1>Go Tagger</h1>
          <p class="subtitle">Quickly preview photos and batch tag them.</p>
        </div>
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
      </header>

      <section class="panel">
        <form class="tag-form" onSubmit={handleBatchTag}>
          <div class="field-group">
            <label for="tag-input">New tags</label>
            <input
              id="tag-input"
              type="text"
              placeholder="portrait, beach, favorites"
              value={tagInput()}
              onInput={(event) => setTagInput(event.currentTarget.value)}
            />
          </div>
          <div class="field-group">
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
          <button type="submit" class="primary" disabled={isSubmitting()}>
            {isSubmitting() ? "Tagging…" : "Apply tags"}
          </button>
        </form>
        <Show when={feedback()}>
          {(message) => <p class="feedback">{message}</p>}
        </Show>
      </section>

      <section class="panel">
        <Show when={!photosData.loading} fallback={<p>Loading photos…</p>}>
          <Show
            when={photos().length > 0}
            fallback={
              <p>No photos indexed yet. Run the indexer to get started.</p>
            }
          >
            <div class="gallery">
              <For each={photos()}>
                {(photo) => {
                  const isSelected = () => selectedIds().has(photo.id);
                  const takenAt = () =>
                    photo.taken_at
                      ? new Date(photo.taken_at).toLocaleString()
                      : "Unknown date";

                  return (
                    <button
                      type="button"
                      class={`gallery__item ${
                        isSelected() ? "is-selected" : ""
                      }`}
                      onClick={() => toggleSelection(photo.id)}
                    >
                      <Show
                        when={photo.thumbnail_path}
                        fallback={
                          <div class="gallery__placeholder">No Thumbnail</div>
                        }
                      >
                        {(thumb) => (
                          <img
                            src={`${API_BASE}${thumb}`}
                            alt="thumbnail"
                            loading="lazy"
                          />
                        )}
                      </Show>
                      <div class="gallery__meta">
                        <span>{takenAt()}</span>
                        <span>{photo.file_type.toUpperCase()}</span>
                      </div>
                      <div class="gallery__checkbox">
                        <input
                          type="checkbox"
                          readOnly
                          checked={isSelected()}
                        />
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </section>
    </main>
  );
}

export default App;
