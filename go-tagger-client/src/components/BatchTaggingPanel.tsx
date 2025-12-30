import { createSignal, createEffect, createMemo } from "solid-js";
import type { Photo } from "../types";
import {
  getTopTags,
  getTopPeople,
  getTagSuggestions,
  getPeopleSuggestions,
  batchUpdatePhotoTags,
  batchUpdatePhotoPeople,
} from "../api";

interface BatchTaggingPanelProps {
  toggleBatchPanel: () => void;
  showBatchPanel: () => boolean;
  selectedPhotoIds: () => number[];
  selectedPhotos: () => Photo[];
  onUpdated: () => void;
  tagInput: () => string;
  setTagInput: (val: string) => void;
  peopleInput: () => string;
  setPeopleInput: (val: string) => void;
  children?: any;
}

type TriState = "none" | "some" | "all";
type OverrideState = "none" | "all";

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

  const [tagOverrides, setTagOverrides] = createSignal<
    Map<string, OverrideState>
  >(new Map());
  const [peopleOverrides, setPeopleOverrides] = createSignal<
    Map<string, OverrideState>
  >(new Map());

  const parseCsv = (value: string): string[] =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const selectedTotal = createMemo(() => props.selectedPhotos().length);

  const tagCounts = createMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of props.selectedPhotos()) {
      const unique = new Set((photo.tags ?? []).map((t) => t.name));
      for (const name of unique) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return counts;
  });

  const peopleCounts = createMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of props.selectedPhotos()) {
      const unique = new Set((photo.people ?? []).map((p) => p.name));
      for (const name of unique) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return counts;
  });

  const baseStateFor = (
    counts: Map<string, number>,
    name: string,
    total: number
  ): TriState => {
    if (total <= 0) return "none";
    const count = counts.get(name) ?? 0;
    if (count <= 0) return "none";
    if (count >= total) return "all";
    return "some";
  };

  const visualStateFor = (
    base: TriState,
    override: OverrideState | undefined
  ): TriState => {
    if (override === "all") return "all";
    if (override === "none") return "none";
    return base;
  };

  const pillClassFor = (state: TriState): string => {
    if (state === "all") return "pill pill--all";
    if (state === "some") return "pill pill--some";
    return "pill";
  };

  const toggleOverride = (
    name: string,
    currentVisual: TriState,
    setOverrides: (next: Map<string, OverrideState>) => void,
    overrides: Map<string, OverrideState>
  ) => {
    const next = new Map(overrides);
    if (currentVisual === "all") {
      next.set(name, "none");
    } else {
      next.set(name, "all");
    }
    setOverrides(next);
  };

  // Fetch top tags/people on mount
  createEffect(() => {
    getTopTags()
      .then(setTopTags)
      .catch(() => setTopTags([]));
    getTopPeople()
      .then(setTopPeople)
      .catch(() => setTopPeople([]));
  });

  // Reset explicit overrides when selection changes
  createEffect(() => {
    const key = props
      .selectedPhotoIds()
      .slice()
      .sort((a, b) => a - b)
      .join(",");
    void key;
    setTagOverrides(new Map());
    setPeopleOverrides(new Map());
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

  const handleUpdateTags = async () => {
    const ids = props.selectedPhotoIds();
    if (!ids.length) {
      alert("No photos selected");
      return;
    }

    const typedAdds = parseCsv(props.tagInput());
    const overrides = tagOverrides();
    const add = Array.from(
      new Set([
        ...typedAdds,
        ...Array.from(overrides.entries())
          .filter(([, v]) => v === "all")
          .map(([k]) => k),
      ])
    );
    const remove = Array.from(
      new Set(
        Array.from(overrides.entries())
          .filter(([, v]) => v === "none")
          .map(([k]) => k)
      )
    );

    if (!add.length && !remove.length) {
      alert("No tag changes selected");
      return;
    }

    try {
      await batchUpdatePhotoTags(ids, { add, remove });
      props.onUpdated();
      props.setTagInput("");
      setTagOverrides(new Map());
    } catch (error) {
      alert(`Failed to update tags: ${error}`);
    }
  };

  const handleUpdatePeople = async () => {
    const ids = props.selectedPhotoIds();
    if (!ids.length) {
      alert("No photos selected");
      return;
    }

    const typedAdds = parseCsv(props.peopleInput());
    const overrides = peopleOverrides();
    const add = Array.from(
      new Set([
        ...typedAdds,
        ...Array.from(overrides.entries())
          .filter(([, v]) => v === "all")
          .map(([k]) => k),
      ])
    );
    const remove = Array.from(
      new Set(
        Array.from(overrides.entries())
          .filter(([, v]) => v === "none")
          .map(([k]) => k)
      )
    );

    if (!add.length && !remove.length) {
      alert("No people changes selected");
      return;
    }

    try {
      await batchUpdatePhotoPeople(ids, { add, remove });
      props.onUpdated();
      props.setPeopleInput("");
      setPeopleOverrides(new Map());
    } catch (error) {
      alert(`Failed to update people: ${error}`);
    }
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
            {topTags().map((tag: string) => {
              const base = baseStateFor(tagCounts(), tag, selectedTotal());
              const override = tagOverrides().get(tag);
              const visual = visualStateFor(base, override);

              return (
                <button
                  type="button"
                  class={pillClassFor(visual)}
                  onClick={() => {
                    toggleOverride(
                      tag,
                      visual,
                      setTagOverrides,
                      tagOverrides()
                    );
                  }}
                  title={
                    base === "all"
                      ? "On all selected"
                      : base === "some"
                      ? "On some selected"
                      : "Not on selected"
                  }
                >
                  {tag}
                </button>
              );
            })}
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
            {topPeople().map((person: string) => {
              const base = baseStateFor(
                peopleCounts(),
                person,
                selectedTotal()
              );
              const override = peopleOverrides().get(person);
              const visual = visualStateFor(base, override);

              return (
                <button
                  type="button"
                  class={pillClassFor(visual)}
                  onClick={() => {
                    toggleOverride(
                      person,
                      visual,
                      setPeopleOverrides,
                      peopleOverrides()
                    );
                  }}
                  title={
                    base === "all"
                      ? "On all selected"
                      : base === "some"
                      ? "On some selected"
                      : "Not on selected"
                  }
                >
                  {person}
                </button>
              );
            })}
          </div>
        </div>
        <div class="batch-actions">
          <button
            type="button"
            class="primary"
            onClick={handleUpdateTags}
            disabled={props.selectedPhotoIds().length === 0}
          >
            Update Tags of Selected ({props.selectedPhotoIds().length})
          </button>
          <button
            type="button"
            class="primary"
            onClick={handleUpdatePeople}
            disabled={props.selectedPhotoIds().length === 0}
          >
            Update People of Selected ({props.selectedPhotoIds().length})
          </button>
        </div>
        {props.children}
      </div>
    </section>
  );
}
