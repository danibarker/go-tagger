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
  const [selectedTagIndex, setSelectedTagIndex] = createSignal(-1);
  const [peopleSuggestions, setPeopleSuggestions] = createSignal<string[]>([]);
  const [showPeopleDropdown, setShowPeopleDropdown] = createSignal(false);
  const [selectedPersonIndex, setSelectedPersonIndex] = createSignal(-1);
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

  const acceptTagSuggestion = (suggestion: string) => {
    const current = props.tagInput();
    const tagsArr = current
      ? current.split(",").map((t: string) => t.trim())
      : [];
    tagsArr[tagsArr.length - 1] = suggestion;
    props.setTagInput(tagsArr.filter(Boolean).join(", "));
    setShowTagDropdown(false);
    setSelectedTagIndex(-1);
  };

  const acceptPersonSuggestion = (suggestion: string) => {
    const current = props.peopleInput();
    const peopleArr = current
      ? current.split(",").map((p: string) => p.trim())
      : [];
    peopleArr[peopleArr.length - 1] = suggestion;
    props.setPeopleInput(peopleArr.filter(Boolean).join(", "));
    setShowPeopleDropdown(false);
    setSelectedPersonIndex(-1);
  };
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
            {props.showBatchPanel() ? "▲" : "▼"}
          </button>
        </div>
      </div>
      <div class="tag-form">
        <div class="field-group">
          <label for="batch-tag-input">Tags (comma-separated)</label>
          <div class="autocomplete-wrapper">
            <input
              id="batch-tag-input"
              type="text"
              placeholder="beach, sunset, vacation"
              value={props.tagInput()}
              onInput={async (event) => {
                const value = event.currentTarget.value;
                props.setTagInput(value);
                setSelectedTagIndex(-1);
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
              onKeyDown={(event) => {
                if (!showTagDropdown() || tagSuggestions().length === 0) return;

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedTagIndex((prev) =>
                    prev < tagSuggestions().length - 1 ? prev + 1 : prev
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedTagIndex((prev) => (prev > 0 ? prev - 1 : -1));
                } else if (event.key === "Enter" || event.key === "Tab") {
                  const idx = selectedTagIndex();
                  if (idx >= 0 && idx < tagSuggestions().length) {
                    event.preventDefault();
                    acceptTagSuggestion(tagSuggestions()[idx]);
                  }
                } else if (event.key === "Escape") {
                  setShowTagDropdown(false);
                  setSelectedTagIndex(-1);
                }
              }}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
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
            />
            {showTagDropdown() && tagSuggestions().length > 0 && (
              <div class="autocomplete-dropdown">
                {tagSuggestions().map((suggestion: string, index: number) => (
                  <div
                    class={`autocomplete-item ${
                      selectedTagIndex() === index ? "selected" : ""
                    }`}
                    onMouseDown={() => acceptTagSuggestion(suggestion)}
                    onMouseEnter={() => setSelectedTagIndex(index)}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <div class="autocomplete-wrapper">
            <input
              id="batch-people-input"
              type="text"
              placeholder="John, Mary"
              value={props.peopleInput()}
              onInput={async (event) => {
                const value = event.currentTarget.value;
                props.setPeopleInput(value);
                setSelectedPersonIndex(-1);
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
              onKeyDown={(event) => {
                if (!showPeopleDropdown() || peopleSuggestions().length === 0)
                  return;

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedPersonIndex((prev) =>
                    prev < peopleSuggestions().length - 1 ? prev + 1 : prev
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedPersonIndex((prev) => (prev > 0 ? prev - 1 : -1));
                } else if (event.key === "Enter" || event.key === "Tab") {
                  const idx = selectedPersonIndex();
                  if (idx >= 0 && idx < peopleSuggestions().length) {
                    event.preventDefault();
                    acceptPersonSuggestion(peopleSuggestions()[idx]);
                  }
                } else if (event.key === "Escape") {
                  setShowPeopleDropdown(false);
                  setSelectedPersonIndex(-1);
                }
              }}
              onBlur={() => setTimeout(() => setShowPeopleDropdown(false), 150)}
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
            />
            {showPeopleDropdown() && peopleSuggestions().length > 0 && (
              <div class="autocomplete-dropdown">
                {peopleSuggestions().map(
                  (suggestion: string, index: number) => (
                    <div
                      class={`autocomplete-item ${
                        selectedPersonIndex() === index ? "selected" : ""
                      }`}
                      onMouseDown={() => acceptPersonSuggestion(suggestion)}
                      onMouseEnter={() => setSelectedPersonIndex(index)}
                    >
                      {suggestion}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
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
