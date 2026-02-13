import type { Accessor } from "solid-js";

interface AppHeaderProps {
  perfMonitoring: Accessor<boolean>;
  onTogglePerfMonitoring: () => void;
  onIndexing: () => void;
  onUpdateIndex: () => void;
  onResetIndex: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  return (
    <header class="app-shell__header">
      <div>
        <h1>Go Tagger</h1>
        <p class="subtitle">Quickly preview photos and batch tag them.</p>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" class="ghost" onClick={props.onIndexing}>
          Start Indexing
        </button>
        <button type="button" class="ghost" onClick={props.onUpdateIndex}>
          Update Index
        </button>
        <button type="button" class="ghost" onClick={props.onResetIndex}>
          Reset & Reindex
        </button>
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "0.25rem",
            cursor: "pointer",
            "margin-left": "1rem",
          }}
        >
          <input
            type="checkbox"
            checked={props.perfMonitoring()}
            onChange={props.onTogglePerfMonitoring}
          />
          <span>Performance Monitoring</span>
        </label>
      </div>
    </header>
  );
}
