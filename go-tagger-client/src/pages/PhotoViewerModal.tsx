import { createEffect, Show } from "solid-js";

export function PhotoViewerModal(props: {
  hash: string;
  isVideo: boolean;
  loading: boolean;
}) {
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
        <Show when={props.loading}>
          <p style={{ color: "white" }}>Loading...</p>
        </Show>

        <Show when={!props.loading}>
          <Show
            when={props.isVideo}
            fallback={
              <img
                src={`/media/photos/${props.hash}`}
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
              <source src={`/media/photos/${props.hash}`} />
            </video>
          </Show>
        </Show>
      </div>
    </div>
  );
}
