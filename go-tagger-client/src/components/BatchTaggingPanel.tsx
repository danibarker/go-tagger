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
import { AutocompleteInput } from "./AutocompleteInput";

import type { Setter } from "solid-js";
import { useToast } from "./ToastProvider";

interface BatchTaggingPanelProps {
  toggleBatchPanel: () => void;
  showBatchPanel: () => boolean;
  selectedPhotoIds: () => number[];
  selectedPhotos: () => Photo[];
  onApplyChanges: (change: {
    entity: "tags" | "people";
    photoIds: number[];
    add: string[];
    remove: string[];
  }) => { rollback: () => void; commit: () => void };
  tagInput: () => string;
  setTagInput: Setter<string>;
  peopleInput: () => string;
  setPeopleInput: Setter<string>;
  children?: any;
}

type TriState = "none" | "some" | "all";
type OverrideState = "none" | "all";

export function BatchTaggingPanel(props: BatchTaggingPanelProps) {
  const { pushToast } = useToast();

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
    total: number,
  ): TriState => {
    if (total <= 0) return "none";
    const count = counts.get(name) ?? 0;
    if (count <= 0) return "none";
    if (count >= total) return "all";
    return "some";
  };

  const visualStateFor = (
    base: TriState,
    override: OverrideState | undefined,
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
    overrides: Map<string, OverrideState>,
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

  const handleUpdateTags = async () => {
    const ids = props.selectedPhotoIds();
    if (!ids.length) {
      pushToast({ kind: "info", message: "No photos selected" });
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
      ]),
    );
    const remove = Array.from(
      new Set(
        Array.from(overrides.entries())
          .filter(([, v]) => v === "none")
          .map(([k]) => k),
      ),
    );

    if (!add.length && !remove.length) {
      pushToast({ kind: "info", message: "No tag changes selected" });
      return;
    }

    const { rollback, commit } = props.onApplyChanges({
      entity: "tags",
      photoIds: ids,
      add,
      remove,
    });

    try {
      await batchUpdatePhotoTags(ids, { add, remove });
      commit();
      props.setTagInput("");
      setTagOverrides(new Map());
    } catch (error) {
      rollback();
      const msg = error instanceof Error ? error.message : String(error);
      pushToast({ kind: "error", message: `Failed to update tags: ${msg}` });
    }
  };

  const handleUpdatePeople = async () => {
    const ids = props.selectedPhotoIds();
    if (!ids.length) {
      pushToast({ kind: "info", message: "No photos selected" });
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
      ]),
    );
    const remove = Array.from(
      new Set(
        Array.from(overrides.entries())
          .filter(([, v]) => v === "none")
          .map(([k]) => k),
      ),
    );

    if (!add.length && !remove.length) {
      pushToast({ kind: "info", message: "No people changes selected" });
      return;
    }

    const { rollback, commit } = props.onApplyChanges({
      entity: "people",
      photoIds: ids,
      add,
      remove,
    });

    try {
      await batchUpdatePhotoPeople(ids, { add, remove });
      commit();
      props.setPeopleInput("");
      setPeopleOverrides(new Map());
    } catch (error) {
      rollback();
      const msg = error instanceof Error ? error.message : String(error);
      pushToast({ kind: "error", message: `Failed to update people: ${msg}` });
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
          <AutocompleteInput
            id="batch-tag-input"
            placeholder="beach, sunset, vacation"
            value={props.tagInput}
            onValueChange={props.setTagInput}
            getSuggestions={getTagSuggestions}
          />
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
                      tagOverrides(),
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
          <AutocompleteInput
            id="batch-people-input"
            placeholder="John, Mary"
            value={props.peopleInput}
            onValueChange={props.setPeopleInput}
            getSuggestions={getPeopleSuggestions}
          />
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
                selectedTotal(),
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
                      peopleOverrides(),
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
