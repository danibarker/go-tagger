export function PageControls({
  page,
  totalPages,
  photos,
  photosLoading,
  setPage,
}) {
  return (
    <div class="page-controls">
      <button
        type="button"
        class="ghost"
        disabled={page() === 1 || photosLoading()}
        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
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
        onClick={() => setPage((prev) => prev + 1)}
      >
        Next 
      </button>
    </div>
  );
}
