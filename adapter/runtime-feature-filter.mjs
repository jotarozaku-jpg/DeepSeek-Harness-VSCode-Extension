const SAFE_PLUGIN_ID = /^[a-z0-9][a-z0-9/_-]{0,127}$/i

export function parseDisabledPluginIds(rawValue) {
  if (!rawValue) return []
  let parsed
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return [...new Set(parsed
    .filter(item => typeof item === 'string' && SAFE_PLUGIN_ID.test(item))
    .slice(0, 100))]
}

export function filterCordisPlugins(source, disabledPluginIds) {
  const disabled = new Set(Array.isArray(disabledPluginIds) ? disabledPluginIds : [])
  if (!disabled.size) return String(source)
  const output = []
  let skip = false
  for (const line of String(source).split(/\r?\n/)) {
    const topLevelId = line.match(/^- id:\s*['"]?([^'"\s]+)['"]?\s*$/)
    if (topLevelId) skip = disabled.has(topLevelId[1])
    if (!skip) output.push(line)
  }
  return output.join('\n')
}
