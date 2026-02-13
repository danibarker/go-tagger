import { createSignal } from "solid-js";

interface PageControlsProps {
  page: () => number;
  totalPages: () => number;
  photosLoading: () => boolean;
  setPage: (fn: (prev: number) => number) => void;
}

export function PageControls({
  page,
  totalPages,
  photosLoading,
  setPage,
}: PageControlsProps) {
  const [pageInput, setPageInput] = createSignal("");

  const handleGoToPage = () => {
    const targetPage = parseInt(pageInput(), 10);
    if (isNaN(targetPage)) return;

    const clampedPage = Math.max(1, Math.min(targetPage, totalPages()));
    setPage(() => clampedPage);
    setPageInput("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleGoToPage();
    }
  };

  return (
    <div class="page-controls">
      <button
        type="button"
        class="ghost"
        disabled={page() === 1 || photosLoading()}
        onClick={() => setPage((prev: number) => Math.max(1, prev - 1))}
      >
         Prev
      </button>
      <span>
        Page {page()} / {totalPages()}
      </span>
      <button
        type="button"
        class="ghost"
        disabled={page() >= totalPages() || photosLoading()}
        onClick={() => setPage((prev: number) => prev + 1)}
      >
        Next 
      </button>{" "}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          "align-items": "center",
          "margin-left": "1rem",
        }}
      >
        <span style={{ "font-size": "0.9em" }}>Go to:</span>
        <input
          type="number"
          min="1"
          max={totalPages()}
          value={pageInput()}
          onInput={(e) => setPageInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={String(page())}
          disabled={photosLoading()}
          style={{
            width: "4rem",
            padding: "0.25rem 0.5rem",
            "border-radius": "4px",
            border: "1px solid #ccc",
            "font-size": "0.95em",
          }}
        />
        <button
          type="button"
          class="ghost"
          disabled={photosLoading() || !pageInput()}
          onClick={handleGoToPage}
          style={{ padding: "0.25rem 0.75rem" }}
        >
          Go
        </button>
      </div>{" "}
    </div>
  );
}
