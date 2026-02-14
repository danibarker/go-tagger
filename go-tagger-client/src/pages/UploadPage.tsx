import { Show, createEffect, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { uploadPhotos } from "../api";
import { TopNav } from "../components/TopNav";

export function UploadPage() {
  const navigate = useNavigate();

  const [files, setFiles] = createSignal<File[]>([]);
  const [folderName, setFolderName] = createSignal("");
  const [tags, setTags] = createSignal("");
  const [people, setPeople] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);
  const [previews, setPreviews] = createSignal<
    { name: string; url: string; isVideo: boolean }[]
  >([]);

  const uploadFiles = async () => {
    if (!files().length) {
      setError("Select at least one file to upload.");
      return;
    }
    if (!folderName().trim()) {
      setError("Folder name is required.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await uploadPhotos({
        files: files(),
        folder: folderName().trim(),
        tags: tags().trim(),
        people: people().trim(),
      });

      setSuccess(
        `Uploaded ${result.uploaded} files. Skipped ${result.skipped}.`,
      );
      if (result.errors.length) {
        setError(result.errors.slice(0, 5).join("\n"));
      }
      setFiles([]);
      setTags("");
      setPeople("");
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error uploading files");
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    const current = previews();
    current.forEach((preview) => URL.revokeObjectURL(preview.url));

    const next = files()
      .slice(0, 10)
      .map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      }));
    setPreviews(next);
  });

  return (
    <main class="app-shell">
      <TopNav />
      <section class="panel panel--open upload-panel">
        <div>
          <h2>Upload Media</h2>
          <p>Upload new photos or videos into a folder and add tags.</p>
        </div>

        <div class="upload-panel__form">
          <div class="upload-panel__row">
            <div class="field-group">
              <label for="upload-folder">Folder Name</label>
              <input
                id="upload-folder"
                type="text"
                value={folderName()}
                onInput={(e) => setFolderName(e.currentTarget.value)}
                placeholder="e.g. vacation-2026"
              />
            </div>
            <div class="field-group">
              <label for="upload-tags">Tags (comma-separated)</label>
              <input
                id="upload-tags"
                type="text"
                value={tags()}
                onInput={(e) => setTags(e.currentTarget.value)}
                placeholder="beach, sunset, family"
              />
            </div>
            <div class="field-group">
              <label for="upload-people">People (comma-separated)</label>
              <input
                id="upload-people"
                type="text"
                value={people()}
                onInput={(e) => setPeople(e.currentTarget.value)}
                placeholder="alex, maria"
              />
            </div>
          </div>

          <div class="field-group">
            <label for="upload-files">Files</label>
            <input
              id="upload-files"
              type="file"
              multiple
              onChange={(e) =>
                setFiles(Array.from(e.currentTarget.files ?? []))
              }
            />
          </div>
        </div>

        <Show when={previews().length > 0}>
          <div>
            <h3>Preview (first 10)</h3>
            <div class="upload-panel__previews">
              {previews().map((preview) => (
                <div class="upload-preview">
                  <Show
                    when={!preview.isVideo}
                    fallback={<video src={preview.url} muted />}
                  >
                    <img src={preview.url} alt={preview.name} />
                  </Show>
                  <div class="upload-preview__meta">{preview.name}</div>
                </div>
              ))}
            </div>
          </div>
        </Show>

        <div class="batch-actions">
          <button class="primary" onClick={uploadFiles} disabled={loading()}>
            {loading() ? "Uploading..." : "Upload"}
          </button>
        </div>

        <Show when={error()}>
          <p style={{ color: "#b91c1c", "white-space": "pre-line" }}>
            {error()}
          </p>
        </Show>
        <Show when={success()}>
          <p style={{ color: "#166534" }}>{success()}</p>
        </Show>
      </section>
    </main>
  );
}
