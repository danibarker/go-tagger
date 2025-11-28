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
  }
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

export const batchTagPhotos = async (
  photoIds: number[],
  tags: string[]
): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/photos/batch/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_ids: photoIds, new_tags: tags }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to batch tag photos");
  }
};

export const batchTagPeople = async (
  photoIds: number[],
  people: string[]
): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/photos/batch/people`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_ids: photoIds, new_people: people }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to batch tag people");
  }
};
