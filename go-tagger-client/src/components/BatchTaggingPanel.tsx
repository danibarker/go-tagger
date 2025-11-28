import { createSignal, createEffect } from "solid-js";
import { getTopTags, getTopPeople } from "../api";
import { getTagSuggestions, getPeopleSuggestions } from "../api";

interface BatchTaggingPanelProps {
  toggleBatchPanel: () => void;
  showBatchPanel: () => boolean;
  tagInput: () => string;
  setTagInput: (val: string) => void;
  peopleInput: () => string;
  setPeopleInput: (val: string) => void;
  children?: any;
}

export function BatchTaggingPanel(props: BatchTaggingPanelProps) {
  // Autocomplete state
  const [tagSuggestions, setTagSuggestions] = createSignal<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = createSignal(false);
  const [peopleSuggestions, setPeopleSuggestions] = createSignal<string[]>([]);
  const [showPeopleDropdown, setShowPeopleDropdown] = createSignal(false);
  // Top tags/people state
  const [topTags, setTopTags] = createSignal<string[]>([]);
  const [topPeople, setTopPeople] = createSignal<string[]>([]);

  // Fetch top tags/people on mount
  createEffect(() => {
    getTopTags()
      .then(setTopTags)
      .catch(() => setTopTags([]));
    getTopPeople()
      .then(setTopPeople)
      .catch(() => setTopPeople([]));
  });
  // All props are signals or handlers from GalleryPage
  return (
    <section class="panel" id="batch-tagging-panel">
      <div class="panel__header" onClick={props.toggleBatchPanel}>
        <h3>Batch Tagging</h3>
        <div class="panel__header-actions">
          <button
            id="batch-panel-close-btn"
            aria-label="Close Batch Tagging Panel"
          >
            {props.showBatchPanel() ? "˄" : "˅"}
          </button>
        </div>
      </div>
      <div class="tag-form">
        <div class="field-group">
          <label for="batch-tag-input">Tags (comma-separated)</label>
          <input
            id="batch-tag-input"
            type="text"
            placeholder="beach, sunset, vacation"
            value={props.tagInput()}
            onInput={async (event) => {
              const value = event.currentTarget.value;
              props.setTagInput(value);
              if (value.trim()) {
                const last = value.split(",").pop()?.trim() ?? "";
                if (last) {
                  setTagSuggestions(await getTagSuggestions(last));
                  setShowTagDropdown(true);
                } else {
                  setShowTagDropdown(false);
                }
              } else {
                setShowTagDropdown(false);
              }
            }}
            onBlur={() => setTimeout(() => setShowTagDropdown(false), 100)}
            onFocus={async (event) => {
              const value = event.currentTarget.value;
              if (value.trim()) {
                const last = value.split(",").pop()?.trim() ?? "";
                if (last) {
                  setTagSuggestions(await getTagSuggestions(last));
                  setShowTagDropdown(true);
                }
              }
            }}
            autocomplete="off"
            style={{ flex: 1 }}
          />
          {showTagDropdown() && tagSuggestions().length > 0 && (
            <div
              class="autocomplete-dropdown"
              style={{
                position: "absolute",
                background: "white",
                border: "1px solid #ccc",
                "z-index": 10,
                "margin-top": "2.2rem",
                "min-width": "180px",
              }}
            >
              {tagSuggestions().map((suggestion: string) => (
                <div
                  style={{ padding: "0.25rem 0.75rem", cursor: "pointer" }}
                  onMouseDown={() => {
                    const current = props.tagInput();
                    const tagsArr = current
                      ? current.split(",").map((t: string) => t.trim())
                      : [];
                    tagsArr[tagsArr.length - 1] = suggestion;
                    props.setTagInput(tagsArr.filter(Boolean).join(", "));
                    setShowTagDropdown(false);
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              "flex-wrap": "wrap",
              margin: "0.5rem 0",
            }}
          >
            {topTags().map((tag: string) => (
              <button
                type="button"
                class="pill"
                style={{
                  padding: "0.25rem 0.75rem",
                  "border-radius": "999px",
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  "font-size": "0.9em",
                }}
                onClick={() => {
                  const current = props.tagInput();
                  const tagsArr = current
                    ? current.split(",").map((t: string) => t.trim())
                    : [];
                  if (!tagsArr.includes(tag)) {
                    props.setTagInput(
                      tagsArr.concat(tag).filter(Boolean).join(", ")
                    );
                  }
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
        <div class="field-group">
          <label for="batch-people-input">People (comma-separated)</label>
          <input
            id="batch-people-input"
            type="text"
            placeholder="John, Mary"
            value={props.peopleInput()}
            onInput={async (event) => {
              const value = event.currentTarget.value;
              props.setPeopleInput(value);
              if (value.trim()) {
                const last = value.split(",").pop()?.trim() ?? "";
                if (last) {
                  setPeopleSuggestions(await getPeopleSuggestions(last));
                  setShowPeopleDropdown(true);
                } else {
                  setShowPeopleDropdown(false);
                }
              } else {
                setShowPeopleDropdown(false);
              }
            }}
            onBlur={() => setTimeout(() => setShowPeopleDropdown(false), 100)}
            onFocus={async (event) => {
              const value = event.currentTarget.value;
              if (value.trim()) {
                const last = value.split(",").pop()?.trim() ?? "";
                if (last) {
                  setPeopleSuggestions(await getPeopleSuggestions(last));
                  setShowPeopleDropdown(true);
                }
              }
            }}
            autocomplete="off"
            style={{ flex: 1 }}
          />
          {showPeopleDropdown() && peopleSuggestions().length > 0 && (
            <div
              class="autocomplete-dropdown"
              style={{
                position: "absolute",
                background: "white",
                border: "1px solid #ccc",
                "z-index": 10,
                "margin-top": "2.2rem",
                "min-width": "180px",
              }}
            >
              {peopleSuggestions().map((suggestion: string) => (
                <div
                  style={{ padding: "0.25rem 0.75rem", cursor: "pointer" }}
                  onMouseDown={() => {
                    const current = props.peopleInput();
                    const peopleArr = current
                      ? current.split(",").map((p: string) => p.trim())
                      : [];
                    peopleArr[peopleArr.length - 1] = suggestion;
                    props.setPeopleInput(peopleArr.filter(Boolean).join(", "));
                    setShowPeopleDropdown(false);
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              "flex-wrap": "wrap",
              margin: "0.5rem 0",
            }}
          >
            {topPeople().map((person: string) => (
              <button
                type="button"
                class="pill"
                style={{
                  padding: "0.25rem 0.75rem",
                  "border-radius": "999px",
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  "font-size": "0.9em",
                }}
                onClick={() => {
                  const current = props.peopleInput();
                  const peopleArr = current
                    ? current.split(",").map((p: string) => p.trim())
                    : [];
                  if (!peopleArr.includes(person)) {
                    props.setPeopleInput(
                      peopleArr.concat(person).filter(Boolean).join(", ")
                    );
                  }
                }}
              >
                {person}
              </button>
            ))}
          </div>
        </div>
        {/* ...existing batch tagging UI from GalleryPage... */}
        {props.children}
      </div>
    </section>
  );
}
