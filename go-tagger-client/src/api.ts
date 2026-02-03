import type { PhotosResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export const fetchPhotos = async (
  page: number,
  limit: number,
  filters?: {
    tags?: string;
    tagsOrAnd?: string;
    people?: string;
    peopleOrAnd?: string;
    name?: string;
    fileType?: string;
    beforeDate?: string;
    beforeTime?: string;
    afterDate?: string;
    afterTime?: string;
    untagged?: boolean;
  },
): Promise<PhotosResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (filters?.tags) params.append("tags", filters.tags);
  if (filters?.tagsOrAnd) params.append("tags_or_and", filters.tagsOrAnd);
  if (filters?.people) params.append("people", filters.people);
  if (filters?.peopleOrAnd) params.append("people_or_and", filters.peopleOrAnd);
  if (filters?.name) params.append("name", filters.name);
  if (filters?.fileType) params.append("file_type", filters.fileType);
  if (filters?.beforeDate) params.append("before_date", filters.beforeDate);
  if (filters?.beforeTime) params.append("before_time", filters.beforeTime);
  if (filters?.afterDate) params.append("after_date", filters.afterDate);
  if (filters?.afterTime) params.append("after_time", filters.afterTime);
  if (filters?.untagged) params.append("untagged", "true");

  const res = await fetch(`${API_BASE}/api/photos?${params.toString()}`);
  if (!res.ok) {
    let message = "Failed to fetch photos";
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // ignore JSON parse errors and bubble default message
    }
    throw new Error(message);
  }

  return (await res.json()) as PhotosResponse;
};

export const triggerIndexing = async (): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/index`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to start indexing");
  }
};

export const triggerUpdateIndex = async (): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/index`, { method: "PATCH" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to update index");
  }
};

export const resetAndReindex = async (): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/index`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to reset and reindex");
  }
};

export const batchTagPhotos = async (
  photoIds: number[],
  tags: string[],
): Promise<void> => {
  await batchUpdatePhotoTags(photoIds, { add: tags });
};

export const batchTagPeople = async (
  photoIds: number[],
  people: string[],
): Promise<void> => {
  await batchUpdatePhotoPeople(photoIds, { add: people });
};

export const batchUpdatePhotoTags = async (
  photoIds: number[],
  changes: { add?: string[]; remove?: string[] },
): Promise<void> => {
  const add = (changes.add ?? []).map((t) => t.trim()).filter(Boolean);
  const remove = (changes.remove ?? []).map((t) => t.trim()).filter(Boolean);

  const res = await fetch(`${API_BASE}/api/photos/batch/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photo_ids: photoIds,
      add_tags: add,
      remove_tags: remove,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to batch update photo tags");
  }
};

export const batchUpdatePhotoPeople = async (
  photoIds: number[],
  changes: { add?: string[]; remove?: string[] },
): Promise<void> => {
  const add = (changes.add ?? []).map((p) => p.trim()).filter(Boolean);
  const remove = (changes.remove ?? []).map((p) => p.trim()).filter(Boolean);

  const res = await fetch(`${API_BASE}/api/photos/batch/people`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photo_ids: photoIds,
      add_people: add,
      remove_people: remove,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to batch update photo people");
  }
};

export const getTagSuggestions = async (query: string): Promise<string[]> => {
  const params = new URLSearchParams({ q: query });
  const res = await fetch(
    `${API_BASE}/api/tags/autocomplete?${params.toString()}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to fetch tag suggestions");
  }
  return (await res.json()) as string[];
};

export const getTopTags = async (): Promise<string[]> => {
  const res = await fetch(`${API_BASE}/api/tags`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to fetch top tags");
  }
  return (await res.json()) as string[];
};

export const getPeopleSuggestions = async (
  query: string,
): Promise<string[]> => {
  const params = new URLSearchParams({ q: query });
  const res = await fetch(
    `${API_BASE}/api/people/autocomplete?${params.toString()}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to fetch people suggestions");
  }
  return (await res.json()) as string[];
};

export const getTopPeople = async (): Promise<string[]> => {
  const res = await fetch(`${API_BASE}/api/people`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to fetch top people");
  }
  return (await res.json()) as string[];
};

export const deletePhotos = async (photoIds: number[]): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/photos`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_ids: photoIds }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete photos");
  }
};

export const getPerfMonitoring = async (): Promise<{ enabled: boolean }> => {
  const res = await fetch(`${API_BASE}/api/perf-monitoring`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ?? "Failed to fetch performance monitoring status",
    );
  }
  return (await res.json()) as { enabled: boolean };
};

export const setPerfMonitoring = async (enabled: boolean): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/perf-monitoring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to set performance monitoring");
  }
};
