export type ToolName = string | undefined

export function normalizeToolName(toolName: ToolName): string {
  const trimmed = toolName?.trim().toLowerCase()
  if (!trimmed) return ""
  const withoutIndex = trimmed.replace(/:\d+$/, "")
  const segments = withoutIndex.split(".").filter(Boolean)
  const name = segments[segments.length - 1] ?? withoutIndex
  return ["file_patch", "file_write", "file_edit", "file_view_image"].includes(name) ? name.slice(5) : name
}
