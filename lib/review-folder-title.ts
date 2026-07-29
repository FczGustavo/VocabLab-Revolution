export function reviewFolderTitle(
  sourceName: string,
  curatedFolderNames: readonly string[] = [],
) {
  const trimmed = sourceName.trim() || "Folder"
  const isCurated = curatedFolderNames.some(
    (name) => name.trim().toLocaleLowerCase("en-US") === trimmed.toLocaleLowerCase("en-US"),
  )
  const displayName = isCurated ? trimmed.split(/\s+/)[0] : trimmed
  return `Review of "${displayName}"`
}
