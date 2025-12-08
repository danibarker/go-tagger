import { createSignal, createEffect } from "solid-js";
import type { Setter, Accessor } from "solid-js";
import { fetchPhotos } from "../api";
import { getTopTags, getTopPeople } from "../api";
import { getTagSuggestions, getPeopleSuggestions } from "../api";

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
}: FilterPanelProps) {
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

  // Fetch photos when filters, page, limit, or refreshPhotos change
  createEffect(() => {
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
  }, [
    searchTags,
    tagsLogic,
    searchPeople,
    peopleLogic,
    fileType,
    beforeDate,
    beforeTime,
    afterDate,
    afterTime,
    limit,
    page,
    refreshPhotos,
  ]);

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
    setPage(1);
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
            <input
              id="search-tags"
              type="text"
              placeholder="beach, sunset, vacation"
              value={searchTags()}
              onInput={async (event) => {
                const value = event.currentTarget.value;
                setSearchTags(value);
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
                {tagSuggestions().map((suggestion) => (
                  <div
                    style={{ padding: "0.25rem 0.75rem", cursor: "pointer" }}
                    onMouseDown={() => {
                      const current = searchTags();
                      const tagsArr = current
                        ? current.split(",").map((t) => t.trim())
                        : [];
                      tagsArr[tagsArr.length - 1] = suggestion;
                      setSearchTags(tagsArr.filter(Boolean).join(", "));
                      setShowTagDropdown(false);
                    }}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
            <select
              value={tagsLogic()}
              onChange={(e) => setTagsLogic(e.currentTarget.value)}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              "flex-wrap": "wrap",
              margin: "0.5rem 0",
            }}
          >
            {topTags().map((tag) => (
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
                  const current = searchTags();
                  const tagsArr = current
                    ? current.split(",").map((t) => t.trim())
                    : [];
                  if (!tagsArr.includes(tag)) {
                    setSearchTags(
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
          <label for="search-people">Search by people (comma-separated)</label>
          <div
            style={{ display: "flex", gap: "0.5rem", "align-items": "center" }}
          >
            <input
              id="search-people"
              type="text"
              placeholder="John, Mary"
              value={searchPeople()}
              onInput={async (event) => {
                const value = event.currentTarget.value;
                setSearchPeople(value);
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
                {peopleSuggestions().map((suggestion) => (
                  <div
                    style={{ padding: "0.25rem 0.75rem", cursor: "pointer" }}
                    onMouseDown={() => {
                      const current = searchPeople();
                      const peopleArr = current
                        ? current.split(",").map((p) => p.trim())
                        : [];
                      peopleArr[peopleArr.length - 1] = suggestion;
                      setSearchPeople(peopleArr.filter(Boolean).join(", "));
                      setShowPeopleDropdown(false);
                    }}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
            <select
              value={peopleLogic()}
              onChange={(e) => setPeopleLogic(e.currentTarget.value)}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              "flex-wrap": "wrap",
              margin: "0.5rem 0",
            }}
          >
            {topPeople().map((person) => (
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
                  const current = searchPeople();
                  const peopleArr = current
                    ? current.split(",").map((p) => p.trim())
                    : [];
                  if (!peopleArr.includes(person)) {
                    setSearchPeople(
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
