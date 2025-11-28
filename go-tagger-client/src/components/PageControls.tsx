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
      </button>
    </div>
  );
}
