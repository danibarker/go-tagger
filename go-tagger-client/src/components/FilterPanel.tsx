import { createSignal, createEffect } from "solid-js";
import type { Setter, Accessor } from "solid-js";
import { fetchPhotos } from "../api";
import { getTopTags, getTopPeople } from "../api";
import { getTagSuggestions, getPeopleSuggestions } from "../api";
import { AutocompleteInput } from "./AutocompleteInput";
import { TopItemPills } from "./TopItemPills";

interface FilterPanelProps {
  showFilterPanel: Accessor<boolean>;
  toggleFiltersPanel: () => void;
  limit: Accessor<number>;
  setLimit: Setter<number>;
  page: Accessor<number>;
  setPage: Setter<number>;
  setPhotos: Setter<any[]>;
  setPhotosLoading: Setter<boolean>;
  setTotalPages: Setter<number>;
  refreshPhotos: Accessor<boolean>;
  onFilterChange?: (filters: {
    tags: string;
    tagsLogic: string;
    people: string;
    peopleLogic: string;
    name: string;
    fileType: string;
    beforeDate: string;
    beforeTime: string;
    afterDate: string;
    afterTime: string;
    untagged: boolean;
  }) => void;
}

export function FilterPanel({
  showFilterPanel,
  toggleFiltersPanel,
  limit,
  setLimit,
  page,
  setPage,
  setPhotos,
  setPhotosLoading,
  setTotalPages,
  refreshPhotos,
  onFilterChange,
}: FilterPanelProps) {
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
  // Internal filter state
  const [searchTags, setSearchTags] = createSignal("");
  const [tagsLogic, setTagsLogic] = createSignal("and");
  const [searchPeople, setSearchPeople] = createSignal("");
  const [peopleLogic, setPeopleLogic] = createSignal("and");
  const [searchName, setSearchName] = createSignal("");
  const [fileType, setFileType] = createSignal("any");
  const [beforeDate, setBeforeDate] = createSignal("");
  const [beforeTime, setBeforeTime] = createSignal("");
  const [afterDate, setAfterDate] = createSignal("");
  const [afterTime, setAfterTime] = createSignal("");
  const [showUntagged, setShowUntagged] = createSignal(false);

  // Let the page know what filters are active (used for optimistic updates).
  createEffect(() => {
    onFilterChange?.({
      tags: searchTags(),
      tagsLogic: tagsLogic(),
      people: searchPeople(),
      peopleLogic: peopleLogic(),
      name: searchName(),
      fileType: fileType(),
      beforeDate: beforeDate(),
      beforeTime: beforeTime(),
      afterDate: afterDate(),
      afterTime: afterTime(),
      untagged: showUntagged(),
    });
  });

  // Fetch photos when filters, page, limit, or refreshPhotos change
  createEffect(() => {
    // Access refreshPhotos to make this effect reactive to it
    refreshPhotos();

    setPhotosLoading(true);
    fetchPhotos(page(), limit(), {
      tags: searchTags() || undefined,
      tagsOrAnd: tagsLogic(),
      people: searchPeople() || undefined,
      peopleOrAnd: peopleLogic(),
      name: searchName() || undefined,
      fileType: fileType() !== "any" ? fileType() : undefined,
      beforeDate: beforeDate() || undefined,
      beforeTime: beforeTime() || undefined,
      afterDate: afterDate() || undefined,
      afterTime: afterTime() || undefined,
      untagged: showUntagged() || undefined,
    })
      .then((result) => {
        setPhotos(result.data ?? []);
        const total = result.total ?? 0;
        setTotalPages(total > 0 ? Math.ceil(total / limit()) : 1);
        setPhotosLoading(false);
      })
      .catch(() => {
        setPhotos([]);
        setTotalPages(1);
        setPhotosLoading(false);
      });
  });

  const handleSearch = () => {
    setPage(1);
  };
  const handleClear = () => {
    setSearchTags("");
    setTagsLogic("and");
    setSearchPeople("");
    setPeopleLogic("and");
    setSearchName("");
    setFileType("any");
    setBeforeDate("");
    setBeforeTime("");
    setAfterDate("");
    setAfterTime("");
    setShowUntagged(false);
    setPage(1);
  };

  const handleTagClick = (tag: string) => {
    const current = searchTags();
    const tagsArr = current ? current.split(",").map((t) => t.trim()) : [];
    if (!tagsArr.includes(tag)) {
      setSearchTags(tagsArr.concat(tag).filter(Boolean).join(", "));
    }
  };

  const handlePersonClick = (person: string) => {
    const current = searchPeople();
    const peopleArr = current ? current.split(",").map((p) => p.trim()) : [];
    if (!peopleArr.includes(person)) {
      setSearchPeople(peopleArr.concat(person).filter(Boolean).join(", "));
    }
  };

  return (
    <section class="panel" id="filters-panel">
      <div class="panel__header" onClick={toggleFiltersPanel}>
        <h3>Search Filters</h3>
        <div class="panel__header-actions">
          <button id="filters-panel-close-btn" aria-label="Close Filters Panel">
            {showFilterPanel() ? "▲" : "▼"}
          </button>
        </div>
      </div>
      <div class="tag-form">
        <div class="field-group">
          <label for="search-tags">Search by tags (comma-separated)</label>
          <div
            style={{ display: "flex", gap: "0.5rem", "align-items": "center" }}
          >
            <AutocompleteInput
              id="search-tags"
              placeholder="beach, sunset, vacation"
              value={searchTags}
              onValueChange={setSearchTags}
              getSuggestions={getTagSuggestions}
            />
            <select
              value={tagsLogic()}
              onChange={(e) => setTagsLogic(e.currentTarget.value)}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </div>
          <TopItemPills items={topTags()} onItemClick={handleTagClick} />
        </div>
        <div class="field-group">
          <label for="search-people">Search by people (comma-separated)</label>
          <div
            style={{ display: "flex", gap: "0.5rem", "align-items": "center" }}
          >
            <AutocompleteInput
              id="search-people"
              placeholder="John, Mary"
              value={searchPeople}
              onValueChange={setSearchPeople}
              getSuggestions={getPeopleSuggestions}
            />
            <select
              value={peopleLogic()}
              onChange={(e) => setPeopleLogic(e.currentTarget.value)}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </div>
          <TopItemPills items={topPeople()} onItemClick={handlePersonClick} />
        </div>
        <div class="field-group">
          <label for="search-name">Search by name</label>
          <input
            id="search-name"
            type="text"
            placeholder="vacation_2024"
            value={searchName()}
            onInput={(event) => setSearchName(event.currentTarget.value)}
          />
        </div>
        <div class="field-group">
          <label for="file-type">File type</label>
          <select
            id="file-type"
            value={fileType()}
            onChange={(e) => setFileType(e.currentTarget.value)}
          >
            <option value="any">Any</option>
            <option value="image">Images Only</option>
            <option value="video">Videos Only</option>
          </select>
        </div>
        <div class="field-group">
          <label
            style={{
              display: "flex",
              "align-items": "center",
              gap: "0.5rem",
              cursor: "pointer",
            }}
          >
            <input
              id="untagged-filter"
              type="checkbox"
              checked={showUntagged()}
              onChange={(e) => setShowUntagged(e.currentTarget.checked)}
            />
            <span>Show only untagged photos</span>
          </label>
        </div>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "1fr 1fr",
            gap: "1rem",
            "grid-column": "span 2",
          }}
        >
          <div class="field-group">
            <label for="after-date">Taken after</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                id="after-date"
                type="date"
                value={afterDate()}
                onInput={(event) => setAfterDate(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <input
                type="time"
                value={afterTime()}
                onInput={(event) => setAfterTime(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div class="field-group">
            <label for="before-date">Taken before</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                id="before-date"
                type="date"
                value={beforeDate()}
                onInput={(event) => setBeforeDate(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <input
                type="time"
                value={beforeTime()}
                onInput={(event) => setBeforeTime(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "1fr 1fr",
            gap: "1rem",
            "grid-column": "span 2",
          }}
        >
          <div class="field-group">
            <label for="limit">Photos per page</label>
            <input
              id="limit"
              type="range"
              min="10"
              max="1000"
              value={limit()}
              onInput={(e) => setLimit(Number(e.currentTarget.value))}
            />
          </div>
          <p class="limit">Current limit: {limit()}</p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            "flex-wrap": "wrap",
            "grid-column": "span 2",
          }}
        >
          <button type="button" class="primary" onClick={handleSearch}>
            Search
          </button>
          <button type="button" class="ghost" onClick={handleClear}>
            Clear Filters
          </button>
        </div>
      </div>
    </section>
  );
}
