import { Show, createSignal, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export function PhotoViewerPage() {
  const params = useParams<{ hash: string }>();
  const navigate = useNavigate();

  // Get the page from query params
  const searchParams = new URLSearchParams(window.location.search);
  const returnPage = searchParams.get("page") || "1";

  const [isVideo, setIsVideo] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);

  // Check if the media is a video by trying to load it - runs whenever hash changes
  createEffect(async () => {
    const hash = params.hash;
    setLoading(true);
    setError(false);

    try {
      const response = await fetch(`${API_BASE}/media/photos/${hash}`, {
        method: "HEAD",
      });
      const contentType = response.headers.get("content-type") || "";
      setIsVideo(contentType.startsWith("video/"));
      setLoading(false);
    } catch (e) {
      setError(true);
      setLoading(false);
    }
  });

  const handleClose = () => {
    navigate(`/?page=${returnPage}`);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  // Add keyboard listener
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleKeyDown);
  }

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
      onClick={handleClose}
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
        onClick={handleClose}
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
        <Show when={loading()}>
          <p style={{ color: "white" }}>Loading...</p>
        </Show>

        <Show when={error()}>
          <p style={{ color: "white" }}>Error loading media</p>
        </Show>

        <Show when={!loading() && !error()}>
          <Show
            when={isVideo()}
            fallback={
              <img
                src={`${API_BASE}/media/photos/${params.hash}`}
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
              <source src={`${API_BASE}/media/photos/${params.hash}`} />
            </video>
          </Show>
        </Show>
      </div>
    </div>
  );
}
