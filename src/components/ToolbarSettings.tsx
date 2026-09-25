import { useCallback, useEffect, useState } from "react"

import * as storage from "@/services/storage"
import { getLocalIconUrl } from "@/services/color"
import { detectLocale, t, type Locale } from "@/services/i18n"
import type { ToolbarConfig, ToolbarSearchEngine, ToolbarTriggerMode, ToolbarLayout, TabOpenMode } from "@/types"

function getFaviconUrl(urlTemplate: string): string {
  try {
    const domain = new URL(urlTemplate.replace("{q}", "")).hostname
    return `https://${domain}/favicon.ico`
  } catch {
    return ""
  }
}

export function ToolbarSettings({ locale: localeProp }: { locale?: Locale } = {}) {
  const locale = localeProp || detectLocale()
  const L = t(locale)
  const [config, setConfig] = useState<ToolbarConfig | null>(null)
  const [showSettings, setShowSettings] = useState(true)
  const [newEngineName, setNewEngineName] = useState("")
  const [newEngineUrl, setNewEngineUrl] = useState("")
  const [newEngineIcon, setNewEngineIcon] = useState("")
  const [editingEngineId, setEditingEngineId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editUrl, setEditUrl] = useState("")
  const [editIcon, setEditIcon] = useState("")
  const [blacklistInput, setBlacklistInput] = useState("")
  const [whitelistInput, setWhitelistInput] = useState("")
  const [iconCache, setIconCache] = useState<Record<string, string>>({})
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const cfg = await storage.getToolbarConfig()
    setConfig(cfg)
    setBlacklistInput(cfg.blacklist.join("\n"))
    setWhitelistInput(cfg.whitelist.join("\n"))
    const caches = await storage.getAllEngineIconCaches()
    setIconCache(caches)
    // Prefetch missing icons in background
    for (const engine of cfg.engines) {
      if (!caches[engine.id]) {
        storage.prefetchEngineIcon(engine).then((ok) => {
          if (ok) {
            storage.getEngineIconCache(engine.id).then((data) => {
              if (data) {
                setIconCache((prev) => ({ ...prev, [engine.id]: data }))
              }
            })
          }
        })
      }
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (next: ToolbarConfig) => {
    setConfig(next)
    await storage.saveToolbarConfig(next)
  }, [])

  const updatePartial = useCallback((partial: Partial<ToolbarConfig>) => {
    setConfig((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...partial }
      storage.saveToolbarConfig(next)
      return next
    })
  }, [])

  const updateStyle = useCallback((partial: Partial<ToolbarConfig["style"]>) => {
    setConfig((prev) => {
      if (!prev) return prev
      const next = { ...prev, style: { ...prev.style, ...partial } }
      storage.saveToolbarConfig(next)
      return next
    })
  }, [])

  const addEngine = () => {
    const name = newEngineName.trim()
    let url = newEngineUrl.trim()
    const icon = newEngineIcon.trim()
    if (!name || !url) return
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      alert(L.urlMustStartWithHttp)
      return
    }
    if (!url.includes("%s") && !url.includes("{POSTARGS}")) {
      alert(L.urlMustContainPlaceholder)
      return
    }
    const isPost = url.includes("{POSTARGS}")
    const engine: ToolbarSearchEngine = {
      id: crypto.randomUUID(),
      name,
      urlTemplate: url,
      method: isPost ? "POST" : "GET",
      favicon: icon || undefined,
      enabled: true
    }
    const next = { ...config!, engines: [...config!.engines, engine] }
    save(next)
    setNewEngineName("")
    setNewEngineUrl("")
    setNewEngineIcon("")
    // Auto-download icon
    storage.prefetchEngineIcon(engine).then((ok) => {
      if (ok) {
        storage.getEngineIconCache(engine.id).then((data) => {
          if (data) setIconCache((prev) => ({ ...prev, [engine.id]: data }))
        })
      }
    })
  }

  const removeEngine = (id: string) => {
    const next = { ...config!, engines: config!.engines.filter((e) => e.id !== id) }
    save(next)
    storage.removeEngineIconCache(id)
    setIconCache((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  const startEditEngine = (engine: ToolbarSearchEngine) => {
    setEditingEngineId(engine.id)
    setEditName(engine.name)
    setEditUrl(engine.urlTemplate)
    setEditIcon(engine.favicon || "")
  }

  const saveEditEngine = () => {
    if (!editingEngineId || !config) return
    const name = editName.trim()
    let url = editUrl.trim()
    const icon = editIcon.trim()
    if (!name || !url) return
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      alert(L.urlMustStartWithHttp)
      return
    }
    if (!url.includes("%s") && !url.includes("{POSTARGS}")) {
      alert(L.urlMustContainPlaceholder)
      return
    }
    const isPost = url.includes("{POSTARGS}")
    const updatedEngine: ToolbarSearchEngine = {
      id: editingEngineId,
      name,
      urlTemplate: url,
      method: isPost ? "POST" : "GET",
      favicon: icon || undefined,
      enabled: config.engines.find((e) => e.id === editingEngineId)?.enabled ?? true
    }
    const next = {
      ...config,
      engines: config.engines.map((e) =>
        e.id === editingEngineId ? updatedEngine : e
      )
    }
    save(next)
    setEditingEngineId(null)
    setEditName("")
    setEditUrl("")
    setEditIcon("")
    // Re-download icon since engine config changed
    storage.removeEngineIconCache(updatedEngine.id)
    storage.prefetchEngineIcon(updatedEngine).then((ok) => {
      if (ok) {
        storage.getEngineIconCache(updatedEngine.id).then((data) => {
          if (data) setIconCache((prev) => ({ ...prev, [updatedEngine.id]: data }))
        })
      }
    })
  }

  const cancelEditEngine = () => {
    setEditingEngineId(null)
    setEditName("")
    setEditUrl("")
    setEditIcon("")
  }

  const toggleEngine = (id: string) => {
    const next = {
      ...config!,
      engines: config!.engines.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
    }
    save(next)
  }

  const moveEngine = (id: string, direction: -1 | 1) => {
    const engines = [...config!.engines]
    const idx = engines.findIndex((e) => e.id === id)
    if (idx < 0) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= engines.length) return
    const [item] = engines.splice(idx, 1)
    engines.splice(newIdx, 0, item)
    save({ ...config!, engines })
  }

  const applyLists = () => {
    const blacklist = blacklistInput.split("\n").map((s) => s.trim()).filter(Boolean)
    const whitelist = whitelistInput.split("\n").map((s) => s.trim()).filter(Boolean)
    updatePartial({ blacklist, whitelist })
  }

  const resetToDefaults = () => {
    if (!confirm(L.resetConfirm)) return
    const defaults = storage.getDefaultToolbarConfig()
    save(defaults)
    setBlacklistInput(defaults.blacklist.join("\n"))
    setWhitelistInput(defaults.whitelist.join("\n"))
    setNewEngineIcon("")
  }

  if (!config) return null

  return (
    <div className="border-b border-gray-100 shrink-0">
      <button
        onClick={() => setShowSettings((v) => !v)}
        className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-600 hover:bg-gray-50"
      >
        <span className="font-medium">{L.floatingMenuSettings}</span>
        <span className="text-gray-400">{showSettings ? "▲" : "▼"}</span>
      </button>

      {showSettings && (
        <div className="px-4 pb-3 space-y-3 text-xs">
          {/* Master switch */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => updatePartial({ enabled: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{L.enableFloatingMenu}</span>
          </label>

          {/* Trigger mode */}
          <div className="space-y-1">
            <span className="text-gray-500">{L.triggerMode}</span>
            <select
              value={config.triggerMode}
              onChange={(e) => updatePartial({ triggerMode: e.target.value as ToolbarTriggerMode })}
              className="w-full border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="select">{L.triggerSelect}</option>
              <option value="middle-click">{L.triggerMiddleClick}</option>
              <option value="ctrl">{L.triggerCtrl}</option>
              <option value="alt">{L.triggerAlt}</option>
              <option value="shift">{L.triggerShift}</option>
            </select>
          </div>

          {/* Layout */}
          <div className="space-y-1">
            <span className="text-gray-500">{L.layout}</span>
            <select
              value={config.layout}
              onChange={(e) => updatePartial({ layout: e.target.value as ToolbarLayout })}
              className="w-full border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="horizontal">{L.layoutHorizontal}</option>
              <option value="grid">{L.layoutGrid}</option>
            </select>
          </div>

          {/* Tab open mode */}
          <div className="space-y-1">
            <span className="text-gray-500">{L.openMode}</span>
            <select
              value={config.tabOpenMode}
              onChange={(e) => updatePartial({ tabOpenMode: e.target.value as TabOpenMode })}
              className="w-full border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="new-tab">{L.openNewTab}</option>
              <option value="new-background-tab">{L.openNewBackgroundTab}</option>
              <option value="current">{L.openCurrent}</option>
              <option value="pinned">{L.openPinned}</option>
            </select>
          </div>

          {/* Toggles */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showAnnotations}
                onChange={(e) => updatePartial({ showAnnotations: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{L.showAnnotationButtons}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showFaviconOnly}
                onChange={(e) => updatePartial({ showFaviconOnly: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{L.showFaviconOnly}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoClose}
                onChange={(e) => updatePartial({ autoClose: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>{L.autoCloseAfterSearch}</span>
            </label>
          </div>

          {/* Auto-close delay */}
          {config.autoClose && (
            <div className="space-y-1">
              <span className="text-gray-500">{L.autoCloseDelay(config.autoCloseDelay / 1000)}</span>
              <input
                type="range"
                min={500}
                max={10000}
                step={500}
                value={config.autoCloseDelay}
                onChange={(e) => updatePartial({ autoCloseDelay: Number(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>0.5{L.seconds}</span>
                <span>10{L.seconds}</span>
              </div>
            </div>
          )}

          {/* Style */}
          <div className="space-y-2 border border-gray-100 rounded p-2">
            <span className="text-gray-500 font-medium">{L.appearanceStyle}</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-400">{L.backgroundColor}</span>
                <input
                  type="color"
                  value={config.style.backgroundColor}
                  onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                  className="w-full h-6 rounded border border-gray-200"
                />
              </div>
              <div>
                <span className="text-gray-400">{L.textColor}</span>
                <input
                  type="color"
                  value={config.style.textColor}
                  onChange={(e) => updateStyle({ textColor: e.target.value })}
                  className="w-full h-6 rounded border border-gray-200"
                />
              </div>
              <div>
                <span className="text-gray-400">{L.borderRadius(config.style.borderRadius)}</span>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={config.style.borderRadius}
                  onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <span className="text-gray-400">{L.buttonSize(config.style.buttonSize)}</span>
                <input
                  type="range"
                  min={16}
                  max={48}
                  value={config.style.buttonSize}
                  onChange={(e) => updateStyle({ buttonSize: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <span className="text-gray-400">{L.gap(config.style.gap)}</span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={config.style.gap}
                  onChange={(e) => updateStyle({ gap: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <span className="text-gray-400">{L.padding(config.style.padding)}</span>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={config.style.padding}
                  onChange={(e) => updateStyle({ padding: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <span className="text-gray-400">{L.shadowCss}</span>
              <input
                type="text"
                value={config.style.shadow}
                onChange={(e) => updateStyle({ shadow: e.target.value })}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Engines */}
          <div className="space-y-2 border border-gray-100 rounded p-2">
            <span className="text-gray-500 font-medium">{L.searchEngines}</span>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {config.engines.map((engine) => (
                <div key={engine.id} className="flex items-center gap-1 bg-gray-50 rounded px-2 py-1">
                  {editingEngineId === engine.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={L.engineNamePlaceholder}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px]"
                      />
                      <input
                        type="text"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder={L.engineUrlPlaceholder}
                        className="flex-[2] border border-gray-200 rounded px-2 py-1 text-[11px]"
                      />
                      <input
                        type="text"
                        value={editIcon}
                        onChange={(e) => setEditIcon(e.target.value)}
                        placeholder={L.engineIconPlaceholder}
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px]"
                      />
                      <button
                        onClick={saveEditEngine}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-[11px]"
                      >
                        {L.save}
                      </button>
                      <button
                        onClick={cancelEditEngine}
                        className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-[11px]"
                      >
                        {L.cancel}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={engine.enabled}
                        onChange={() => toggleEngine(engine.id)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      <span className="w-4 h-4 flex items-center justify-center text-xs relative">
                        {engine.favicon && !engine.favicon.startsWith("http") && !engine.favicon.startsWith("data:") ? engine.favicon : (
                          <>
                            <span className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold">
                              {engine.name.charAt(0).toUpperCase()}
                            </span>
                            <img
                              src={iconCache[engine.id] || getLocalIconUrl(engine.id)}
                              alt=""
                              className="w-4 h-4 relative z-10 bg-gray-50 object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                if (iconCache[engine.id]) {
                                  target.style.display = "none"
                                  return
                                }
                                const fallback = engine.favicon || getFaviconUrl(engine.urlTemplate)
                                if (fallback && target.src !== fallback) {
                                  target.src = fallback
                                } else {
                                  target.style.display = "none"
                                }
                              }}
                            />
                          </>
                        )}
                      </span>
                      <span className="flex-1 truncate">{engine.name}</span>
                      <button
                        onClick={async () => {
                          if (downloadingId) return
                          setDownloadingId(engine.id)
                          const ok = await storage.prefetchEngineIcon(engine)
                          if (ok) {
                            const data = await storage.getEngineIconCache(engine.id)
                            if (data) setIconCache((prev) => ({ ...prev, [engine.id]: data }))
                          }
                          setDownloadingId(null)
                        }}
                        disabled={downloadingId === engine.id}
                        className={`px-1 ${downloadingId === engine.id ? "text-blue-400 animate-pulse" : "text-gray-400 hover:text-blue-600"}`}
                        title={L.downloadIcon}
                      >
                        {downloadingId === engine.id ? "⏳" : "⬇"}
                      </button>
                      <button
                        onClick={() => startEditEngine(engine)}
                        className="text-gray-400 hover:text-blue-600 px-1"
                        title={L.edit}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => moveEngine(engine.id, -1)}
                        className="text-gray-400 hover:text-gray-600 px-1"
                        title={L.moveUp}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveEngine(engine.id, 1)}
                        className="text-gray-400 hover:text-gray-600 px-1"
                        title={L.moveDown}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeEngine(engine.id)}
                        className="text-red-400 hover:text-red-600 px-1"
                        title={L.delete}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={newEngineName}
                onChange={(e) => setNewEngineName(e.target.value)}
                placeholder={L.engineNamePlaceholder}
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px]"
              />
              <input
                type="text"
                value={newEngineUrl}
                onChange={(e) => setNewEngineUrl(e.target.value)}
                placeholder={L.engineUrlPlaceholder}
                className="flex-[2] border border-gray-200 rounded px-2 py-1 text-[11px]"
              />
              <input
                type="text"
                value={newEngineIcon}
                onChange={(e) => setNewEngineIcon(e.target.value)}
                placeholder={L.engineIconPlaceholder}
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-[11px]"
              />
              <button
                onClick={addEngine}
                disabled={!newEngineName.trim() || !newEngineUrl.trim()}
                className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] disabled:opacity-50"
              >
                {L.add}
              </button>
            </div>
          </div>

          {/* Blacklist / Whitelist */}
          <div className="space-y-2 border border-gray-100 rounded p-2">
            <span className="text-gray-500 font-medium">{L.blacklistWhitelist}</span>
            <div>
              <span className="text-gray-400">{L.blacklist}</span>
              <textarea
                value={blacklistInput}
                onChange={(e) => setBlacklistInput(e.target.value)}
                placeholder="example.com&#10;github.com"
                className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] h-16 resize-none"
              />
            </div>
            <div>
              <span className="text-gray-400">{L.whitelist}</span>
              <textarea
                value={whitelistInput}
                onChange={(e) => setWhitelistInput(e.target.value)}
                placeholder="example.com"
                className="w-full border border-gray-200 rounded px-2 py-1 text-[11px] h-16 resize-none"
              />
            </div>
            <button
              onClick={applyLists}
              className="px-3 py-1 bg-gray-800 text-white rounded text-[11px] hover:bg-gray-700"
            >
              {L.applyLists}
            </button>
          </div>

          <button
            onClick={resetToDefaults}
            className="w-full px-3 py-1.5 border border-red-200 text-red-600 rounded text-[11px] hover:bg-red-50"
          >
            {L.resetToDefault}
          </button>
        </div>
      )}
    </div>
  )
}