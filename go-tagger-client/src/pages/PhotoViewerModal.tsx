import { createEffect, createSignal, Show } from "solid-js";
import type { Photo } from "../types";

const getFileName = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : filePath;
};

export function PhotoViewerModal(props: {
  hash: string;
  isVideo: boolean;
  loading: boolean;
}) {
  const [photo, setPhoto] = createSignal<Photo | null>(null);
  const [photoLoading, setPhotoLoading] = createSignal(true);

  // Fetch photo metadata when hash changes
  createEffect(() => {
    if (props.hash) {
      setPhotoLoading(true);
      fetch(`/api/photos/${props.hash}`)
        .then((res) => res.json())
        .then((data) => {
          setPhoto(data);
          setPhotoLoading(false);
        })
        .catch(() => {
          setPhotoLoading(false);
        });
    }
  });
  const closeViewer = () => {
    window.location.hash = "";
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.hash) {
      closeViewer();
    }
  };

  createEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        "background-color": "var(--color-overlay-strong)",
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
          color: "var(--color-text-on-dark)",
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
          "max-width": "95vw",
          "max-height": "90vh",
          display: "flex",
          gap: "20px",
          "align-items": "center",
          "justify-content": "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Show when={props.loading}>
          <p style={{ color: "var(--color-text-on-dark)" }}>Loading...</p>
        </Show>

        <Show when={!props.loading}>
          <div
            style={{ flex: "1", display: "flex", "justify-content": "center" }}
          >
            <Show
              when={props.isVideo}
              fallback={
                <img
                  src={`/media/photos/${props.hash}`}
                  alt="Full size"
                  style={{
                    "max-width": "100%",
                    "max-height": "90vh",
                    "object-fit": "contain",
                  }}
                />
              }
            >
              <video
                controls
                autoplay
                style={{ "max-width": "100%", "max-height": "90vh" }}
              >
                <source src={`/media/photos/${props.hash}`} />
              </video>
            </Show>
          </div>

          <Show when={!photoLoading() && photo()}>
            <div
              style={{
                background: "var(--color-overlay)",
                color: "var(--color-text-on-dark)",
                padding: "20px",
                "border-radius": "8px",
                "max-width": "300px",
                "max-height": "90vh",
                "overflow-y": "auto",
              }}
            >
              <h3 style={{ "margin-top": "0" }}>Details</h3>
              <div style={{ "font-size": "0.9em", "line-height": "1.6" }}>
                <p>
                  <strong>Filename:</strong> {getFileName(photo()!.file_path)}
                </p>
                <p>
                  <strong>Path:</strong> {photo()!.file_path}
                </p>
                <p>
                  <strong>Size:</strong>{" "}
                  {photo()!.file_size > 1024 * 1024
                    ? `${(photo()!.file_size / (1024 * 1024)).toFixed(2)} MB`
                    : `${(photo()!.file_size / 1024).toFixed(2)} KB`}
                </p>
                <p>
                  <strong>Dimensions:</strong> {photo()!.width} ×{" "}
                  {photo()!.height}
                </p>
                <Show when={photo()!.taken_at}>
                  <p>
                    <strong>Taken:</strong>{" "}
                    {new Date(photo()!.taken_at!).toLocaleString()}
                  </p>
                </Show>
                <Show when={photo()!.tags && photo()!.tags!.length > 0}>
                  <p>
                    <strong>Tags:</strong>
                  </p>
                  <div
                    style={{
                      display: "flex",
                      "flex-wrap": "wrap",
                      gap: "5px",
                      "margin-bottom": "10px",
                    }}
                  >
                    {photo()!.tags!.map((tag) => (
                      <span
                        style={{
                          background: "var(--color-gallery-pattern-a)",
                          padding: "3px 8px",
                          "border-radius": "12px",
                          "font-size": "0.85em",
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </Show>
                <Show when={photo()!.people && photo()!.people!.length > 0}>
                  <p>
                    <strong>People:</strong>
                  </p>
                  <div
                    style={{ display: "flex", "flex-wrap": "wrap", gap: "5px" }}
                  >
                    {photo()!.people!.map((person) => (
                      <span
                        style={{
                          background: "var(--color-gallery-pattern-a)",
                          padding: "3px 8px",
                          "border-radius": "12px",
                          "font-size": "0.85em",
                        }}
                      >
                        {person.name}
                      </span>
                    ))}
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
