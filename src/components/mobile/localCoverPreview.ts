export function createTemporaryCoverPreview(
  file: Blob,
  createObjectUrl: (value: Blob) => string = URL.createObjectURL,
) {
  return createObjectUrl(file)
}
