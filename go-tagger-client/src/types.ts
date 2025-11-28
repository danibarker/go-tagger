export type Photo = {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  DeletedAt: string | null;
  file_path: string;
  file_hash: string;
  thumbnail_path: string | null;
  width: number;
  height: number;
  file_type: string;
  taken_at?: string;
};

export type PhotosResponse = {
  data: Photo[];
  total: number;
  page: number;
  limit: number;
};
