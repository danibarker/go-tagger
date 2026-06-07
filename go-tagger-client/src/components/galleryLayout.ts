import type { Photo } from "../types";

export const GALLERY_COLUMN_COUNT = 4;
const ESTIMATED_COLUMN_WIDTH = 240;
const ESTIMATED_CARD_CHROME_HEIGHT = 84;

export type GalleryColumnItem = {
  photo: Photo;
  index: number;
};

function estimatePhotoCardHeight(photo: Photo) {
  if (photo.width > 0 && photo.height > 0) {
    return (
      ESTIMATED_CARD_CHROME_HEIGHT +
      (ESTIMATED_COLUMN_WIDTH * photo.height) / photo.width
    );
  }

  return ESTIMATED_CARD_CHROME_HEIGHT + ESTIMATED_COLUMN_WIDTH;
}

function getShortestColumnIndex(columnHeights: number[]) {
  let shortestIndex = 0;

  for (let index = 1; index < columnHeights.length; index += 1) {
    if (columnHeights[index] < columnHeights[shortestIndex]) {
      shortestIndex = index;
    }
  }

  return shortestIndex;
}

export function buildPhotoColumns(photos: Photo[]) {
  const columns = Array.from(
    { length: GALLERY_COLUMN_COUNT },
    () => [] as GalleryColumnItem[],
  );
  const columnHeights = Array.from({ length: GALLERY_COLUMN_COUNT }, () => 0);

  photos.forEach((photo, index) => {
    const columnIndex = getShortestColumnIndex(columnHeights);
    columns[columnIndex].push({ photo, index });
    columnHeights[columnIndex] += estimatePhotoCardHeight(photo);
  });

  return columns;
}
