import React from 'react'
import { createPortal } from 'react-dom'
import type { AssetResolver, DocumentTemplateV1, LineElementV1, TemplateV1Element, TextStyleV1 } from '../core/types'
import { buildEvalContext } from '../core/evaluate'
import { DocumentPreview } from '../core/render'
import { openPdfPreviewFromElement } from '../core/pdf'
import { TemplateInputForm } from './TemplateInputForm'
import { clampNumber, getPageSizePt, pxToPt } from '../core/units'
import { defaultFunctions, FUNCTION_DOCS } from '../core/expr'

function newId(prefix: string): string {
  const anyCrypto = globalThis.crypto as any
  if (anyCrypto?.randomUUID) return `${prefix}_${anyCrypto.randomUUID()}`
  return `${prefix}_${Math.random().toString(16).slice(2)}`
}

function updateElement(template: DocumentTemplateV1, el: TemplateV1Element): DocumentTemplateV1 {
  return {
    ...template,
    elements: template.elements.map((e) => (e.id === el.id ? el : e)),
  }
}

function removeElement(template: DocumentTemplateV1, id: string): DocumentTemplateV1 {
  return { ...template, elements: template.elements.filter((e) => e.id !== id) }
}

function uniqKey(prefix: string, existing: Set<string>): string {
  if (!existing.has(prefix)) return prefix
  let i = 2
  while (existing.has(`${prefix}${i}`)) i += 1
  return `${prefix}${i}`
}

function parseJsonOrString(raw: string): unknown {
  const text = raw.trim()
  if (!text) return ''
  try {
    return JSON.parse(text)
  } catch {
    return raw
  }
}

type DragState = {
  id: string
  startClientX: number
  startClientY: number
  baseXPt: number
  baseYPt: number
  pageWPt: number
  pageHPt: number
  baseLine?: { x1Pt: number; y1Pt: number; x2Pt: number; y2Pt: number }
}

type LineEndpointDragState = {
  id: string
  endpoint: 'start' | 'end'
  startClientX: number
  startClientY: number
  baseLine: { x1Pt: number; y1Pt: number; x2Pt: number; y2Pt: number }
  pageWPt: number
  pageHPt: number
}

type ResizeDragState = {
  id: string
  handle: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
  startClientX: number
  startClientY: number
  baseRect: { xPt: number; yPt: number; wPt: number; hPt: number; z?: number }
  pageWPt: number
  pageHPt: number
}

export function TemplateDesigner({
  template,
  onTemplateChange,
  sampleInputs,
  onSampleInputsChange,
  assetResolver,
  onSave,
}: {
  template: DocumentTemplateV1
  onTemplateChange: (next: DocumentTemplateV1) => void
  sampleInputs?: Record<string, unknown>
  onSampleInputsChange?: (next: Record<string, unknown>) => void
  assetResolver?: AssetResolver
  onSave: (template: DocumentTemplateV1) => void
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(template.elements[0]?.id ?? null)
  const previewWrapRef = React.useRef<HTMLDivElement | null>(null)
  const templateRef = React.useRef(template)

  const isSampleInputsControlled = typeof onSampleInputsChange === 'function'
  const [uncontrolledSampleInputs, setUncontrolledSampleInputs] = React.useState<Record<string, unknown>>(
    () => sampleInputs ?? {},
  )
  const effectiveSampleInputs = isSampleInputsControlled ? (sampleInputs ?? {}) : uncontrolledSampleInputs
  const setSampleInputs = React.useCallback(
    (next: Record<string, unknown>) => {
      if (isSampleInputsControlled) {
        onSampleInputsChange?.(next)
      } else {
        setUncontrolledSampleInputs(next)
      }
    },
    [isSampleInputsControlled, onSampleInputsChange],
  )

  React.useEffect(() => {
    if (!isSampleInputsControlled) return
    setUncontrolledSampleInputs(sampleInputs ?? {})
  }, [isSampleInputsControlled, sampleInputs])

  const historyRef = React.useRef<{ past: DocumentTemplateV1[]; future: DocumentTemplateV1[] }>({
    past: [],
    future: [],
  })
  const dragMoveHistoryRef = React.useRef<{ base: DocumentTemplateV1 | null; didMove: boolean }>({
    base: null,
    didMove: false,
  })
  const lineEndpointHistoryRef = React.useRef<{ base: DocumentTemplateV1 | null; didMove: boolean }>({
    base: null,
    didMove: false,
  })
  const resizeHistoryRef = React.useRef<{ base: DocumentTemplateV1 | null; didMove: boolean }>({
    base: null,
    didMove: false,
  })

  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [lineEndpointDrag, setLineEndpointDrag] = React.useState<LineEndpointDragState | null>(null)
  const [resizeDrag, setResizeDrag] = React.useState<ResizeDragState | null>(null)
  const [isPdfPreviewing, setIsPdfPreviewing] = React.useState(false)
  const rafRef = React.useRef<number | null>(null)
  const pendingElRef = React.useRef<TemplateV1Element | null>(null)

  React.useEffect(() => {
    templateRef.current = template
  }, [template])

  const pushHistory = React.useCallback((prev: DocumentTemplateV1) => {
    const hist = historyRef.current
    hist.past.push(prev)
    if (hist.past.length > 100) hist.past.shift()
    hist.future = []
  }, [])

  const applyTemplateChange = React.useCallback(
    (next: DocumentTemplateV1) => {
      const prev = templateRef.current
      if (next === prev) return
      pushHistory(prev)
      onTemplateChange(next)
    },
    [onTemplateChange, pushHistory],
  )

  const undo = React.useCallback(() => {
    const hist = historyRef.current
    if (hist.past.length === 0) return

    setDrag(null)
    setLineEndpointDrag(null)
    setResizeDrag(null)

    const current = templateRef.current
    const prev = hist.past.pop()!
    hist.future.push(current)
    onTemplateChange(prev)
  }, [onTemplateChange])

  const redo = React.useCallback(() => {
    const hist = historyRef.current
    if (hist.future.length === 0) return

    setDrag(null)
    setLineEndpointDrag(null)
    setResizeDrag(null)

    const current = templateRef.current
    const next = hist.future.pop()!
    hist.past.push(current)
    onTemplateChange(next)
  }, [onTemplateChange])

  const selected = template.elements.find((e) => e.id === selectedId) ?? null

  const elementsByZ = React.useMemo(() => {
    return [...template.elements].sort((a, b) => (a.rect.z ?? 0) - (b.rect.z ?? 0))
  }, [template.elements])

  const applyZOrder = React.useCallback(
    (orderedIds: string[]) => {
      const latest = templateRef.current
      const byId = new Map(latest.elements.map((e) => [e.id, e] as const))
      const nextElements = orderedIds
        .map((id, idx) => {
          const el = byId.get(id)
          if (!el) return null
          return { ...el, rect: { ...el.rect, z: idx + 1 } } as TemplateV1Element
        })
        .filter(Boolean) as TemplateV1Element[]

      // Keep any elements not present (shouldn't happen) appended.
      for (const el of latest.elements) {
        if (!orderedIds.includes(el.id)) nextElements.push({ ...el, rect: { ...el.rect, z: nextElements.length + 1 } })
      }

      applyTemplateChange({ ...latest, elements: nextElements })
    },
    [applyTemplateChange],
  )

  const moveInZOrder = React.useCallback(
    (id: string, dir: -1 | 1) => {
      const ordered = elementsByZ.map((e) => e.id)
      const idx = ordered.indexOf(id)
      if (idx < 0) return
      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= ordered.length) return
      const next = [...ordered]
      ;[next[idx], next[nextIdx]] = [next[nextIdx], next[idx]]
      applyZOrder(next)
    },
    [applyZOrder, elementsByZ],
  )

  const { ctx, errors } = React.useMemo(
    () => buildEvalContext(template, effectiveSampleInputs),
    [template, effectiveSampleInputs],
  )

  const alignmentGuidesPt = React.useMemo(() => {
    if (!selected) return { xPts: [], yPts: [] }

    const tolPt = 2
    const xPts = new Set<number>()
    const yPts = new Set<number>()

    const selLeft = selected.rect.xPt
    const selRight = selected.rect.xPt + selected.rect.wPt
    const selCenterX = selected.rect.xPt + selected.rect.wPt / 2

    const selTop = selected.rect.yPt
    const selBottom = selected.rect.yPt + selected.rect.hPt
    const selCenterY = selected.rect.yPt + selected.rect.hPt / 2

    const selXs = [selLeft, selCenterX, selRight]
    const selYs = [selTop, selCenterY, selBottom]

    for (const other of template.elements) {
      if (other.id === selected.id) continue

      const oLeft = other.rect.xPt
      const oRight = other.rect.xPt + other.rect.wPt
      const oCenterX = other.rect.xPt + other.rect.wPt / 2
      const oTop = other.rect.yPt
      const oBottom = other.rect.yPt + other.rect.hPt
      const oCenterY = other.rect.yPt + other.rect.hPt / 2

      const oXs = [oLeft, oCenterX, oRight]
      const oYs = [oTop, oCenterY, oBottom]

      for (const sx of selXs) {
        for (const ox of oXs) {
          if (Math.abs(sx - ox) <= tolPt) xPts.add(ox)
        }
      }
      for (const sy of selYs) {
        for (const oy of oYs) {
          if (Math.abs(sy - oy) <= tolPt) yPts.add(oy)
        }
      }
    }

    return { xPts: [...xPts].sort((a, b) => a - b), yPts: [...yPts].sort((a, b) => a - b) }
  }, [selected, template.elements])

  const getLineEndpointsPt = React.useCallback((el: LineElementV1) => {
    const hasExplicit =
      typeof el.x1Pt === 'number' &&
      typeof el.y1Pt === 'number' &&
      typeof el.x2Pt === 'number' &&
      typeof el.y2Pt === 'number'

    if (hasExplicit) {
      return { x1Pt: el.x1Pt!, y1Pt: el.y1Pt!, x2Pt: el.x2Pt!, y2Pt: el.y2Pt! }
    }

    const isHorizontal = el.rect.wPt >= el.rect.hPt
    if (isHorizontal) {
      return {
        x1Pt: el.rect.xPt,
        y1Pt: el.rect.yPt,
        x2Pt: el.rect.xPt + el.rect.wPt,
        y2Pt: el.rect.yPt,
      }
    }

    return {
      x1Pt: el.rect.xPt,
      y1Pt: el.rect.yPt,
      x2Pt: el.rect.xPt,
      y2Pt: el.rect.yPt + el.rect.hPt,
    }
  }, [])

  const normalizeLineFromEndpoints = React.useCallback(
    (el: LineElementV1, endpoints: { x1Pt: number; y1Pt: number; x2Pt: number; y2Pt: number }): LineElementV1 => {
      const minX = Math.min(endpoints.x1Pt, endpoints.x2Pt)
      const minY = Math.min(endpoints.y1Pt, endpoints.y2Pt)
      const maxX = Math.max(endpoints.x1Pt, endpoints.x2Pt)
      const maxY = Math.max(endpoints.y1Pt, endpoints.y2Pt)
      const wPt = Math.max(1, maxX - minX)
      const hPt = Math.max(1, maxY - minY)

      return {
        ...el,
        x1Pt: endpoints.x1Pt,
        y1Pt: endpoints.y1Pt,
        x2Pt: endpoints.x2Pt,
        y2Pt: endpoints.y2Pt,
        rect: { ...el.rect, xPt: minX, yPt: minY, wPt, hPt },
      }
    },
    [],
  )

  const clampLineToPage = React.useCallback(
    (el: LineElementV1, pageWPt: number, pageHPt: number): LineElementV1 => {
      const endpoints = getLineEndpointsPt(el)
      const normalized = normalizeLineFromEndpoints(el, endpoints)
      const maxX = Math.max(0, pageWPt - normalized.rect.wPt)
      const maxY = Math.max(0, pageHPt - normalized.rect.hPt)
      const clampedX = clampNumber(normalized.rect.xPt, 0, maxX)
      const clampedY = clampNumber(normalized.rect.yPt, 0, maxY)
      const dx = clampedX - normalized.rect.xPt
      const dy = clampedY - normalized.rect.yPt

      if (dx === 0 && dy === 0) return normalized
      return normalizeLineFromEndpoints(
        normalized,
        {
          x1Pt: (normalized.x1Pt ?? endpoints.x1Pt) + dx,
          y1Pt: (normalized.y1Pt ?? endpoints.y1Pt) + dy,
          x2Pt: (normalized.x2Pt ?? endpoints.x2Pt) + dx,
          y2Pt: (normalized.y2Pt ?? endpoints.y2Pt) + dy,
        },
      )
    },
    [getLineEndpointsPt, normalizeLineFromEndpoints],
  )

  const { wPt: pageWPt, hPt: pageHPt } = React.useMemo(
    () => getPageSizePt(template.page.size, template.page.orientation),
    [template.page.size, template.page.orientation],
  )

  const nudgeSelectedBy = React.useCallback(
    (dxPt: number, dyPt: number) => {
      if (!selected) return

      const latest = templateRef.current
      const el = latest.elements.find((e) => e.id === selected.id)
      if (!el) return

      if (el.type === 'line') {
        const base = getLineEndpointsPt(el)
        const moved = normalizeLineFromEndpoints(el, {
          x1Pt: base.x1Pt + dxPt,
          y1Pt: base.y1Pt + dyPt,
          x2Pt: base.x2Pt + dxPt,
          y2Pt: base.y2Pt + dyPt,
        })
        const clamped = clampLineToPage(moved, pageWPt, pageHPt)
        applyTemplateChange(updateElement(latest, clamped))
        return
      }

      const maxX = Math.max(0, pageWPt - el.rect.wPt)
      const maxY = Math.max(0, pageHPt - el.rect.hPt)
      const xPt = clampNumber(el.rect.xPt + dxPt, 0, maxX)
      const yPt = clampNumber(el.rect.yPt + dyPt, 0, maxY)
      applyTemplateChange(updateElement(latest, { ...el, rect: { ...el.rect, xPt, yPt } } as any))
    },
    [
      applyTemplateChange,
      clampLineToPage,
      getLineEndpointsPt,
      normalizeLineFromEndpoints,
      pageHPt,
      pageWPt,
      selected,
    ],
  )

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      const isTypingTarget =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (t as any)?.isContentEditable === true

      if (isTypingTarget) return

      const key = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }

      if (!selected) return

      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgeSelectedBy(-step, 0)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgeSelectedBy(step, 0)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        nudgeSelectedBy(0, -step)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        nudgeSelectedBy(0, step)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nudgeSelectedBy, redo, selected, undo])

  React.useEffect(() => {
    if (!drag) return

    const onMove = (ev: PointerEvent) => {
      const current = templateRef.current
      const el = current.elements.find((e) => e.id === drag.id)
      if (!el) return

      const dxPt = pxToPt(ev.clientX - drag.startClientX)
      const dyPt = pxToPt(ev.clientY - drag.startClientY)

      let nextEl: TemplateV1Element
      if (el.type === 'line') {
        const base = drag.baseLine ?? getLineEndpointsPt(el)
        const moved = normalizeLineFromEndpoints(el, {
          x1Pt: base.x1Pt + dxPt,
          y1Pt: base.y1Pt + dyPt,
          x2Pt: base.x2Pt + dxPt,
          y2Pt: base.y2Pt + dyPt,
        })
        nextEl = clampLineToPage(moved, drag.pageWPt, drag.pageHPt)
      } else {
        const maxX = Math.max(0, drag.pageWPt - el.rect.wPt)
        const maxY = Math.max(0, drag.pageHPt - el.rect.hPt)
        const xPt = clampNumber(drag.baseXPt + dxPt, 0, maxX)
        const yPt = clampNumber(drag.baseYPt + dyPt, 0, maxY)
        nextEl = { ...el, rect: { ...el.rect, xPt, yPt } } as any
      }

      if (dxPt !== 0 || dyPt !== 0) {
        dragMoveHistoryRef.current.didMove = true
      }

      pendingElRef.current = nextEl
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const pending = pendingElRef.current
        if (!pending) return

        const latest = templateRef.current
        onTemplateChange(updateElement(latest, pending))
      })
    }

    const onUp = () => {
      const { base, didMove } = dragMoveHistoryRef.current
      if (base && didMove) {
        pushHistory(base)
      }
      dragMoveHistoryRef.current.base = null
      dragMoveHistoryRef.current.didMove = false
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, onTemplateChange, pushHistory])

  React.useEffect(() => {
    if (!lineEndpointDrag) return

    const onMove = (ev: PointerEvent) => {
      const current = templateRef.current
      const el = current.elements.find((e) => e.id === lineEndpointDrag.id)
      if (!el || el.type !== 'line') return

      const dxPt = pxToPt(ev.clientX - lineEndpointDrag.startClientX)
      const dyPt = pxToPt(ev.clientY - lineEndpointDrag.startClientY)

      const base = lineEndpointDrag.baseLine
      const snapTolPt = 6
      const rawEndpoints =
        lineEndpointDrag.endpoint === 'start'
          ? { x1Pt: base.x1Pt + dxPt, y1Pt: base.y1Pt + dyPt, x2Pt: base.x2Pt, y2Pt: base.y2Pt }
          : { x1Pt: base.x1Pt, y1Pt: base.y1Pt, x2Pt: base.x2Pt + dxPt, y2Pt: base.y2Pt + dyPt }

      // Priority: snap to pure horizontal/vertical when close.
      // We do this by snapping the moving endpoint to share X or Y with the fixed endpoint.
      let endpoints = rawEndpoints
      if (lineEndpointDrag.endpoint === 'start') {
        if (Math.abs(rawEndpoints.x1Pt - rawEndpoints.x2Pt) <= snapTolPt) endpoints = { ...endpoints, x1Pt: rawEndpoints.x2Pt }
        if (Math.abs(rawEndpoints.y1Pt - rawEndpoints.y2Pt) <= snapTolPt) endpoints = { ...endpoints, y1Pt: rawEndpoints.y2Pt }
      } else {
        if (Math.abs(rawEndpoints.x2Pt - rawEndpoints.x1Pt) <= snapTolPt) endpoints = { ...endpoints, x2Pt: rawEndpoints.x1Pt }
        if (Math.abs(rawEndpoints.y2Pt - rawEndpoints.y1Pt) <= snapTolPt) endpoints = { ...endpoints, y2Pt: rawEndpoints.y1Pt }
      }

      const next = clampLineToPage(normalizeLineFromEndpoints(el, endpoints), lineEndpointDrag.pageWPt, lineEndpointDrag.pageHPt)

      if (dxPt !== 0 || dyPt !== 0) {
        lineEndpointHistoryRef.current.didMove = true
      }

      pendingElRef.current = next
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const pending = pendingElRef.current
        if (!pending) return
        const latest = templateRef.current
        onTemplateChange(updateElement(latest, pending))
      })
    }

    const onUp = () => {
      const { base, didMove } = lineEndpointHistoryRef.current
      if (base && didMove) {
        pushHistory(base)
      }
      lineEndpointHistoryRef.current.base = null
      lineEndpointHistoryRef.current.didMove = false
      setLineEndpointDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [clampLineToPage, lineEndpointDrag, normalizeLineFromEndpoints, onTemplateChange, pushHistory])

  React.useEffect(() => {
    if (!resizeDrag) return

    const minWPt = 12
    const minHPt = 8

    const onMove = (ev: PointerEvent) => {
      const current = templateRef.current
      const el = current.elements.find((e) => e.id === resizeDrag.id)
      if (!el || (el.type !== 'text' && el.type !== 'image')) return

      const dxPt = pxToPt(ev.clientX - resizeDrag.startClientX)
      const dyPt = pxToPt(ev.clientY - resizeDrag.startClientY)

      let xPt = resizeDrag.baseRect.xPt
      let yPt = resizeDrag.baseRect.yPt
      let wPt = resizeDrag.baseRect.wPt
      let hPt = resizeDrag.baseRect.hPt

      const h = resizeDrag.handle
      const affectsLeft = h === 'w' || h === 'nw' || h === 'sw'
      const affectsRight = h === 'e' || h === 'ne' || h === 'se'
      const affectsTop = h === 'n' || h === 'nw' || h === 'ne'
      const affectsBottom = h === 's' || h === 'sw' || h === 'se'

      if (affectsLeft) {
        xPt = resizeDrag.baseRect.xPt + dxPt
        wPt = resizeDrag.baseRect.wPt - dxPt
      }
      if (affectsRight) {
        wPt = resizeDrag.baseRect.wPt + dxPt
      }
      if (affectsTop) {
        yPt = resizeDrag.baseRect.yPt + dyPt
        hPt = resizeDrag.baseRect.hPt - dyPt
      }
      if (affectsBottom) {
        hPt = resizeDrag.baseRect.hPt + dyPt
      }

      // Enforce minimum sizes (preserve anchored edge when shrinking past min)
      if (wPt < minWPt) {
        if (affectsLeft) xPt -= minWPt - wPt
        wPt = minWPt
      }
      if (hPt < minHPt) {
        if (affectsTop) yPt -= minHPt - hPt
        hPt = minHPt
      }

      // Clamp within page
      xPt = clampNumber(xPt, 0, Math.max(0, resizeDrag.pageWPt - wPt))
      yPt = clampNumber(yPt, 0, Math.max(0, resizeDrag.pageHPt - hPt))

      const next: TemplateV1Element = {
        ...el,
        rect: { ...el.rect, xPt, yPt, wPt, hPt },
      }

      if (dxPt !== 0 || dyPt !== 0) {
        resizeHistoryRef.current.didMove = true
      }

      pendingElRef.current = next
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const pending = pendingElRef.current
        if (!pending) return
        const latest = templateRef.current
        onTemplateChange(updateElement(latest, pending))
      })
    }

    const onUp = () => {
      const { base, didMove } = resizeHistoryRef.current
      if (base && didMove) {
        pushHistory(base)
      }
      resizeHistoryRef.current.base = null
      resizeHistoryRef.current.didMove = false
      setResizeDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onTemplateChange, pushHistory, resizeDrag])

  const addText = () => {
    const el: TemplateV1Element = {
      id: newId('txt'),
      type: 'text',
      rect: { xPt: 36, yPt: 300, wPt: 300, hPt: 24, z: 1 },
      textTpl: 'New text',
      style: { fontSizePt: 12 },
    }
    const latest = templateRef.current
    const next = { ...latest, elements: [...latest.elements, el] }
    applyTemplateChange(next)
    setSelectedId(el.id)
  }

  const addImage = () => {
    const el: TemplateV1Element = {
      id: newId('img'),
      type: 'image',
      rect: { xPt: 36, yPt: 330, wPt: 120, hPt: 50, z: 1 },
      imageRef: 'logo',
      fit: 'contain',
    }
    const latest = templateRef.current
    const next = { ...latest, elements: [...latest.elements, el] }
    applyTemplateChange(next)
    setSelectedId(el.id)
  }

  const addLine = () => {
    const el: TemplateV1Element = {
      id: newId('ln'),
      type: 'line',
      rect: { xPt: 36, yPt: 390, wPt: 300, hPt: 1, z: 1 },
      x1Pt: 36,
      y1Pt: 390,
      x2Pt: 36 + 300,
      y2Pt: 390,
      thicknessPt: 1,
      color: '#111827',
    }
    const latest = templateRef.current
    const next = { ...latest, elements: [...latest.elements, el] }
    applyTemplateChange(next)
    setSelectedId(el.id)
  }

  const duplicateElement = (el: TemplateV1Element) => {
    const dxPt = 12
    const dyPt = 12
    const latest = templateRef.current
    const { wPt, hPt } = getPageSizePt(latest.page.size, latest.page.orientation)

    const cloneBase: TemplateV1Element = {
      ...(el as any),
      id: newId(el.type.slice(0, 3)),
      rect: { ...el.rect, xPt: el.rect.xPt + dxPt, yPt: el.rect.yPt + dyPt },
    }

    const clone: TemplateV1Element =
      cloneBase.type === 'line'
        ? (() => {
            const basePts = getLineEndpointsPt(el as LineElementV1)
            const next = normalizeLineFromEndpoints(cloneBase, {
              x1Pt: basePts.x1Pt + dxPt,
              y1Pt: basePts.y1Pt + dyPt,
              x2Pt: basePts.x2Pt + dxPt,
              y2Pt: basePts.y2Pt + dyPt,
            })
            return clampLineToPage(next, wPt, hPt) as any
          })()
        : cloneBase

    applyTemplateChange({ ...latest, elements: [...latest.elements, clone] })
    setSelectedId(clone.id)
  }

  const duplicateSelected = () => {
    if (!selected) return
    duplicateElement(selected)
  }

  const duplicateById = (id: string) => {
    const latest = templateRef.current
    const el = latest.elements.find((x) => x.id === id)
    if (!el) return
    duplicateElement(el)
  }

  const openPdf = async () => {
    const prevSelectedId = selectedId
    try {
      setIsPdfPreviewing(true)
      setSelectedId(null)
      setDrag(null)
      setLineEndpointDrag(null)
      setResizeDrag(null)

      // Wait for React to commit the DOM updates before capturing.
      await new Promise<void>((r) => window.requestAnimationFrame(() => r()))
      await new Promise<void>((r) => window.requestAnimationFrame(() => r()))

      const root = previewWrapRef.current?.querySelector('[data-doc-root]') as HTMLElement | null
      if (!root) return
      await openPdfPreviewFromElement(root, templateRef.current)
    } finally {
      setIsPdfPreviewing(false)
      setSelectedId(prevSelectedId)
    }
  }

  const onElementPointerDown = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    setSelectedId(id)

    const latest = templateRef.current
    const el = latest.elements.find((x) => x.id === id)
    if (!el) return

    const { wPt, hPt } = getPageSizePt(latest.page.size, latest.page.orientation)

    dragMoveHistoryRef.current.base = latest
    dragMoveHistoryRef.current.didMove = false
    setDrag({
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseXPt: el.rect.xPt,
      baseYPt: el.rect.yPt,
      pageWPt: wPt,
      pageHPt: hPt,
      baseLine: el.type === 'line' ? getLineEndpointsPt(el) : undefined,
    })
  }

  const updateInputDef = (index: number, next: any) => {
    const latest = templateRef.current
    const nextInputs = latest.inputs.map((d, i) => (i === index ? next : d))
    applyTemplateChange({ ...latest, inputs: nextInputs })
  }

  const renameInputKey = (index: number, newKey: string) => {
    const latest = templateRef.current
    const currentDef = latest.inputs[index]
    if (!currentDef) return

    const prevKey = currentDef.key
    const nextDef = { ...currentDef, key: newKey }
    const nextInputs = latest.inputs.map((d, i) => (i === index ? nextDef : d))
    applyTemplateChange({ ...latest, inputs: nextInputs })

    if (prevKey !== newKey) {
      const nextValues: Record<string, unknown> = { ...effectiveSampleInputs }
      if (Object.prototype.hasOwnProperty.call(nextValues, prevKey) && !Object.prototype.hasOwnProperty.call(nextValues, newKey)) {
        nextValues[newKey] = nextValues[prevKey]
        delete nextValues[prevKey]
        setSampleInputs(nextValues)
      }
    }
  }

  const addInput = () => {
    const latest = templateRef.current
    const existing = new Set(latest.inputs.map((i) => i.key))
    const key = uniqKey('field', existing)
    const next = {
      key,
      label: 'New Field',
      type: 'string' as const,
      required: false,
    }
    applyTemplateChange({ ...latest, inputs: [...latest.inputs, next] })
    setSampleInputs({ ...effectiveSampleInputs, [key]: '' })
  }

  const removeInput = (index: number) => {
    const latest = templateRef.current
    const def = latest.inputs[index]
    if (!def) return
    const nextInputs = latest.inputs.filter((_, i) => i !== index)
    applyTemplateChange({ ...latest, inputs: nextInputs })

    const nextValues: Record<string, unknown> = { ...effectiveSampleInputs }
    delete nextValues[def.key]
    setSampleInputs(nextValues)
  }

  const addConstant = () => {
    const latest = templateRef.current
    const existing = new Set(Object.keys(latest.constants ?? {}))
    const key = uniqKey('const', existing)
    applyTemplateChange({
      ...latest,
      constants: { ...(latest.constants ?? {}), [key]: '' },
    })
  }

  const renameConstantKey = (prevKey: string, nextKey: string) => {
    const latest = templateRef.current
    const constants = { ...(latest.constants ?? {}) }
    if (!Object.prototype.hasOwnProperty.call(constants, prevKey)) return
    const value = constants[prevKey]
    delete constants[prevKey]
    constants[nextKey] = value
    applyTemplateChange({ ...latest, constants })
  }

  const updateConstantValue = (key: string, raw: string) => {
    const latest = templateRef.current
    applyTemplateChange({
      ...latest,
      constants: { ...(latest.constants ?? {}), [key]: parseJsonOrString(raw) },
    })
  }

  const removeConstant = (key: string) => {
    const latest = templateRef.current
    const constants = { ...(latest.constants ?? {}) }
    delete constants[key]
    applyTemplateChange({ ...latest, constants })
  }

  const addVar = () => {
    const latest = templateRef.current
    const existing = new Set(Object.keys(latest.variables ?? {}))
    const key = uniqKey('var', existing)
    applyTemplateChange({
      ...latest,
      variables: { ...(latest.variables ?? {}), [key]: "''" },
    })
  }

  const renameVarKey = (prevKey: string, nextKey: string) => {
    const latest = templateRef.current
    const vars = { ...(latest.variables ?? {}) }
    if (!Object.prototype.hasOwnProperty.call(vars, prevKey)) return
    const value = vars[prevKey]
    delete vars[prevKey]
    vars[nextKey] = value
    applyTemplateChange({ ...latest, variables: vars })
  }

  const updateVarExpr = (key: string, expr: string) => {
    const latest = templateRef.current
    applyTemplateChange({
      ...latest,
      variables: { ...(latest.variables ?? {}), [key]: expr },
    })
  }

  const removeVar = (key: string) => {
    const latest = templateRef.current
    const vars = { ...(latest.variables ?? {}) }
    delete vars[key]
    applyTemplateChange({ ...latest, variables: vars })
  }

  type TabKey = 'Template' | 'Inspector' | 'Inputs' | 'Constants' | 'Variables' | 'Test inputs'
  const tabs: TabKey[] = ['Template', 'Inspector', 'Inputs', 'Constants', 'Variables', 'Test inputs']
  const [activeTab, setActiveTab] = React.useState<TabKey>('Inspector')
  const [showOpsModal, setShowOpsModal] = React.useState(false)
  const functionNames = React.useMemo(() => Object.keys(defaultFunctions()).sort(), [])

  React.useEffect(() => {
    if (!showOpsModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOpsModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showOpsModal])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 16, alignItems: 'start' }}>
      <aside
        style={{
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr',
          gap: 12,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={openPdf}>Preview PDF</button>
          <button
            onClick={() => {
              onSave(templateRef.current)
            }}
          >
            Save
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: '6px 8px',
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #E5E7EB',
                background: activeTab === t ? '#EEF2FF' : '#ffffff',
                color: '#111827',
                lineHeight: 1.2,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div
          style={{
            overflowY: 'auto',
            paddingRight: 4,
            minHeight: 0,
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            background: '#ffffff',
            padding: 12,
          }}
        >
          {activeTab === 'Template' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Name</div>
                <input
                  value={template.meta.name}
                  onChange={(e) => {
                    const latest = templateRef.current
                    applyTemplateChange({ ...latest, meta: { ...latest.meta, name: e.target.value } })
                  }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Size</div>
                  <select
                    value={template.page.size}
                    onChange={(e) =>
                      (() => {
                        const latest = templateRef.current
                        applyTemplateChange({
                          ...latest,
                          page: { ...latest.page, size: e.target.value as any },
                        })
                      })()
                    }
                  >
                    <option value="LETTER">LETTER</option>
                    <option value="A4">A4</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Orientation</div>
                  <select
                    value={template.page.orientation}
                    onChange={(e) =>
                      (() => {
                        const latest = templateRef.current
                        applyTemplateChange({
                          ...latest,
                          page: { ...latest.page, orientation: e.target.value as any },
                        })
                      })()
                    }
                  >
                    <option value="portrait">portrait</option>
                    <option value="landscape">landscape</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'Inspector' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={addText}>+ Text</button>
                <button onClick={addImage}>+ Image</button>
                <button onClick={addLine}>+ Line</button>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Elements</div>
                  <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto', paddingRight: 2 }}>
                    {elementsByZ.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          display: 'flex',
                          alignItems: 'stretch',
                          border: '1px solid #E5E7EB',
                          borderRadius: 8,
                          background: selectedId === e.id ? '#EEF2FF' : '#ffffff',
                          color: '#111827',
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(e.id)}
                          style={{
                            //flex: 1,
                            width: '70%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            border: 0,
                            background: 'transparent',
                            color: 'inherit',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{e.type.toUpperCase()}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>{e.id}</div>
                        </button>

                        <div
                          style={{
                            flex: 1,
                            borderLeft: '1px solid #E5E7EB',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            alignItems: 'stretch',
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Move back"
                            title="Move back"
                            onClick={(ev) => {
                              ev.preventDefault()
                              ev.stopPropagation()
                              moveInZOrder(e.id, -1)
                            }}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: 'inherit',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label="Move front"
                            title="Move front"
                            onClick={(ev) => {
                              ev.preventDefault()
                              ev.stopPropagation()
                              moveInZOrder(e.id, 1)
                            }}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: 'inherit',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            aria-label="Duplicate"
                            title="Duplicate"
                            onClick={(ev) => {
                              ev.preventDefault()
                              ev.stopPropagation()
                              duplicateById(e.id)
                            }}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: 'inherit',
                              fontSize: 14,
                              lineHeight: 1,
                              display: 'flex',
                              placeItems: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <svg id="Copy_24" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <rect width="24" height="24" stroke="none" fill="#000000" opacity="0" />
                              <path
                                d="M 4 2 C 2.895 2 2 2.895 2 4 L 2 18 L 4 18 L 4 4 L 18 4 L 18 2 L 4 2 z M 8 6 C 6.895 6 6 6.895 6 8 L 6 20 C 6 21.105 6.895 22 8 22 L 20 22 C 21.105 22 22 21.105 22 20 L 22 8 C 22 6.895 21.105 6 20 6 L 8 6 z M 8 8 L 20 8 L 20 20 L 8 20 L 8 8 z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Selected</div>
                  {!selected ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Select an element (or click one in the preview).</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{selected.id}</div>
                        <button onClick={duplicateSelected}>Duplicate</button>
                        <button
                          onClick={() => {
                            const latest = templateRef.current
                            applyTemplateChange(removeElement(latest, selected.id))
                            setSelectedId(null)
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      <label style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Visible if (expression)</div>
                        <input
                          value={selected.visibleIf ?? ''}
                          placeholder="e.g. inputs.amount > 0"
                          onChange={(e) =>
                            (() => {
                              const latest = templateRef.current
                              const el = latest.elements.find((x) => x.id === selected.id)
                              if (!el) return
                              applyTemplateChange(updateElement(latest, { ...el, visibleIf: e.target.value || undefined } as any))
                            })()
                          }
                        />
                      </label>

                      {selected.type !== 'line' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {([
                            ['xPt', selected.rect.xPt],
                            ['yPt', selected.rect.yPt],
                            ['wPt', selected.rect.wPt],
                            ['hPt', selected.rect.hPt],
                          ] as const).map(([k, v]) => (
                            <label key={k} style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{k}</div>
                              <input
                                type="number"
                                value={v}
                                onChange={(e) =>
                                  (() => {
                                    const latest = templateRef.current
                                    const el = latest.elements.find((x) => x.id === selected.id)
                                    if (!el || el.type === 'line') return
                                    applyTemplateChange(
                                      updateElement(latest, {
                                        ...el,
                                        rect: { ...el.rect, [k]: Number(e.target.value) },
                                      } as any),
                                    )
                                  })()
                                }
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Tip: drag the endpoints in the preview.</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {(() => {
                              const pts = getLineEndpointsPt(selected)
                              const apply = (nextPts: { x1Pt: number; y1Pt: number; x2Pt: number; y2Pt: number }) => {
                                const latest = templateRef.current
                                const el = latest.elements.find((x) => x.id === selected.id)
                                if (!el || el.type !== 'line') return
                                const { wPt, hPt } = getPageSizePt(latest.page.size, latest.page.orientation)
                                const next = clampLineToPage(normalizeLineFromEndpoints(el, nextPts), wPt, hPt)
                                applyTemplateChange(updateElement(latest, next))
                              }

                              return (
                                <>
                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>x1Pt</div>
                                    <input
                                      type="number"
                                      value={pts.x1Pt}
                                      onChange={(e) => apply({ ...pts, x1Pt: Number(e.target.value) })}
                                    />
                                  </label>
                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>y1Pt</div>
                                    <input
                                      type="number"
                                      value={pts.y1Pt}
                                      onChange={(e) => apply({ ...pts, y1Pt: Number(e.target.value) })}
                                    />
                                  </label>
                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>x2Pt</div>
                                    <input
                                      type="number"
                                      value={pts.x2Pt}
                                      onChange={(e) => apply({ ...pts, x2Pt: Number(e.target.value) })}
                                    />
                                  </label>
                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>y2Pt</div>
                                    <input
                                      type="number"
                                      value={pts.y2Pt}
                                      onChange={(e) => apply({ ...pts, y2Pt: Number(e.target.value) })}
                                    />
                                  </label>
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      )}

                      {selected.type === 'text' && (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <label style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Text template</div>
                            <textarea
                              rows={4}
                              value={selected.textTpl}
                              onChange={(e) => {
                                const latest = templateRef.current
                                const el = latest.elements.find((x) => x.id === selected.id)
                                if (!el || el.type !== 'text') return
                                applyTemplateChange(updateElement(latest, { ...el, textTpl: e.target.value }))
                              }}
                            />
                          </label>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Formatting</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {([
                                  {
                                    key: 'bold',
                                    label: 'B',
                                    active: selected.style?.fontWeight === 'bold' || selected.style?.fontWeight === 700,
                                    onToggle: () => {
                                      const isBold =
                                        selected.style?.fontWeight === 'bold' || selected.style?.fontWeight === 700
                                      const nextFontWeight: TextStyleV1['fontWeight'] = isBold ? 'normal' : 'bold'
                                      const nextStyle: TextStyleV1 = { ...(selected.style ?? {}), fontWeight: nextFontWeight }
                                      const latest = templateRef.current
                                      const el = latest.elements.find((x) => x.id === selected.id)
                                      if (!el || el.type !== 'text') return
                                      applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                    },
                                  },
                                  {
                                    key: 'italic',
                                    label: 'I',
                                    active: selected.style?.fontStyle === 'italic',
                                    onToggle: () => {
                                      const nextFontStyle: TextStyleV1['fontStyle'] =
                                        selected.style?.fontStyle === 'italic' ? 'normal' : 'italic'
                                      const nextStyle: TextStyleV1 = { ...(selected.style ?? {}), fontStyle: nextFontStyle }
                                      const latest = templateRef.current
                                      const el = latest.elements.find((x) => x.id === selected.id)
                                      if (!el || el.type !== 'text') return
                                      applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                    },
                                  },
                                  {
                                    key: 'underline',
                                    label: 'U',
                                    active: selected.style?.textDecoration === 'underline',
                                    onToggle: () => {
                                      const nextTextDecoration: TextStyleV1['textDecoration'] =
                                        selected.style?.textDecoration === 'underline' ? 'none' : 'underline'
                                      const nextStyle: TextStyleV1 = {
                                        ...(selected.style ?? {}),
                                        textDecoration: nextTextDecoration,
                                      }
                                      const latest = templateRef.current
                                      const el = latest.elements.find((x) => x.id === selected.id)
                                      if (!el || el.type !== 'text') return
                                      applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                    },
                                  },
                                ] as const).map((b) => (
                                  <button
                                    key={b.key}
                                    type="button"
                                    aria-pressed={b.active}
                                    onClick={b.onToggle}
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: 12,
                                      borderRadius: 8,
                                      border: '1px solid #E5E7EB',
                                      background: b.active ? '#EEF2FF' : '#ffffff',
                                      color: '#111827',
                                      fontWeight: b.key === 'bold' ? 800 : 700,
                                      fontStyle: b.key === 'italic' ? 'italic' : undefined,
                                      textDecoration: b.key === 'underline' ? 'underline' : undefined,
                                      lineHeight: 1.1,
                                      minWidth: 36,
                                    }}
                                  >
                                    {b.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <label style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>Alignment</div>
                              <select
                                value={selected.style?.textAlign ?? 'left'}
                                onChange={(e) => {
                                  const nextAlign = e.target.value as NonNullable<TextStyleV1['textAlign']>
                                  const nextStyle: TextStyleV1 = { ...(selected.style ?? {}), textAlign: nextAlign }
                                  const latest = templateRef.current
                                  const el = latest.elements.find((x) => x.id === selected.id)
                                  if (!el || el.type !== 'text') return
                                  applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                }}
                              >
                                <option value="left">left</option>
                                <option value="center">center</option>
                                <option value="right">right</option>
                              </select>
                            </label>
                          </div>

                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Border</div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={(selected.style?.borderWidthPt ?? 0) > 0}
                                onChange={(e) => {
                                  const latest = templateRef.current
                                  const el = latest.elements.find((x) => x.id === selected.id)
                                  if (!el || el.type !== 'text') return

                                  const cur = el.style ?? {}
                                  const nextStyle: TextStyleV1 = e.target.checked
                                    ? {
                                        ...cur,
                                        borderWidthPt: cur.borderWidthPt && cur.borderWidthPt > 0 ? cur.borderWidthPt : 0.75,
                                        borderStyle: cur.borderStyle ?? 'solid',
                                        borderColor: cur.borderColor ?? '#111827',
                                        borderSides: cur.borderSides,
                                      }
                                    : {
                                        ...cur,
                                        borderWidthPt: undefined,
                                        borderStyle: undefined,
                                        borderColor: undefined,
                                        borderSides: undefined,
                                      }

                                  applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                }}
                              />
                              <div style={{ fontSize: 12 }}>Enable border</div>
                            </label>

                            {(selected.style?.borderWidthPt ?? 0) > 0 && (
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>Width (pt)</div>
                                    <input
                                      type="number"
                                      step={0.25}
                                      min={0}
                                      value={selected.style?.borderWidthPt ?? 0}
                                      onChange={(e) => {
                                        const latest = templateRef.current
                                        const el = latest.elements.find((x) => x.id === selected.id)
                                        if (!el || el.type !== 'text') return
                                        const nextWidth = Number(e.target.value)
                                        const cur = el.style ?? {}
                                        const nextStyle: TextStyleV1 = {
                                          ...cur,
                                          borderWidthPt: Number.isFinite(nextWidth) ? nextWidth : cur.borderWidthPt,
                                        }
                                        applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                      }}
                                    />
                                  </label>

                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>Color</div>
                                    <input
                                      value={selected.style?.borderColor ?? '#111827'}
                                      onChange={(e) => {
                                        const latest = templateRef.current
                                        const el = latest.elements.find((x) => x.id === selected.id)
                                        if (!el || el.type !== 'text') return
                                        const cur = el.style ?? {}
                                        const nextStyle: TextStyleV1 = { ...cur, borderColor: e.target.value }
                                        applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                      }}
                                    />
                                  </label>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>Style</div>
                                    <select
                                      value={selected.style?.borderStyle ?? 'solid'}
                                      onChange={(e) => {
                                        const latest = templateRef.current
                                        const el = latest.elements.find((x) => x.id === selected.id)
                                        if (!el || el.type !== 'text') return
                                        const cur = el.style ?? {}
                                        const nextStyle: TextStyleV1 = {
                                          ...cur,
                                          borderStyle: e.target.value as NonNullable<TextStyleV1['borderStyle']>,
                                        }
                                        applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                      }}
                                    >
                                      <option value="solid">solid</option>
                                      <option value="dashed">dashed</option>
                                      <option value="dotted">dotted</option>
                                    </select>
                                  </label>

                                  <label style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600 }}>Sides</div>
                                    <select
                                      value={selected.style?.borderSides ? 'custom' : 'all'}
                                      onChange={(e) => {
                                        const latest = templateRef.current
                                        const el = latest.elements.find((x) => x.id === selected.id)
                                        if (!el || el.type !== 'text') return
                                        const cur = el.style ?? {}
                                        const nextStyle: TextStyleV1 =
                                          e.target.value === 'all'
                                            ? { ...cur, borderSides: undefined }
                                            : {
                                                ...cur,
                                                borderSides: cur.borderSides ?? {
                                                  top: true,
                                                  right: true,
                                                  bottom: true,
                                                  left: true,
                                                },
                                              }
                                        applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                      }}
                                    >
                                      <option value="all">all</option>
                                      <option value="custom">custom</option>
                                    </select>
                                  </label>
                                </div>

                                {selected.style?.borderSides && (
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {(
                                      [
                                        { k: 'top', label: 'Top' },
                                        { k: 'right', label: 'Right' },
                                        { k: 'bottom', label: 'Bottom' },
                                        { k: 'left', label: 'Left' },
                                      ] as const
                                    ).map((s) => {
                                      const isOn = (selected.style?.borderSides as any)?.[s.k] !== false
                                      return (
                                        <button
                                          key={s.k}
                                          type="button"
                                          aria-pressed={isOn}
                                          onClick={() => {
                                            const latest = templateRef.current
                                            const el = latest.elements.find((x) => x.id === selected.id)
                                            if (!el || el.type !== 'text') return
                                            const cur = el.style ?? {}
                                            const currentSides = cur.borderSides ?? {
                                              top: true,
                                              right: true,
                                              bottom: true,
                                              left: true,
                                            }

                                            const nextSides = { ...currentSides, [s.k]: !isOn }
                                            const anyOn = !!(nextSides.top || nextSides.right || nextSides.bottom || nextSides.left)
                                            if (!anyOn) return

                                            const allOn = !!(nextSides.top && nextSides.right && nextSides.bottom && nextSides.left)
                                            const nextStyle: TextStyleV1 = {
                                              ...cur,
                                              borderSides: allOn ? undefined : nextSides,
                                            }
                                            applyTemplateChange(updateElement(latest, { ...el, style: nextStyle } as any))
                                          }}
                                          style={
                                            {
                                              padding: '6px 10px',
                                              fontSize: 12,
                                              borderRadius: 8,
                                              border: '1px solid #E5E7EB',
                                              background: isOn ? '#EEF2FF' : '#ffffff',
                                              color: '#111827',
                                            } as any
                                          }
                                        >
                                          {s.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {selected.type === 'image' && (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <label style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Image ref</div>
                            <input
                              value={selected.imageRef}
                              onChange={(e) => {
                                const latest = templateRef.current
                                const el = latest.elements.find((x) => x.id === selected.id)
                                if (!el || el.type !== 'image') return
                                applyTemplateChange(updateElement(latest, { ...el, imageRef: e.target.value }))
                              }}
                            />
                          </label>

                          <label style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Opacity</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={typeof selected.opacity === 'number' ? selected.opacity : 1}
                                onChange={(e) => {
                                  const latest = templateRef.current
                                  const el = latest.elements.find((x) => x.id === selected.id)
                                  if (!el || el.type !== 'image') return
                                  applyTemplateChange(updateElement(latest, { ...el, opacity: Number(e.target.value) }))
                                }}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="number"
                                min={0}
                                max={1}
                                step={0.05}
                                value={typeof selected.opacity === 'number' ? selected.opacity : 1}
                                onChange={(e) => {
                                  const latest = templateRef.current
                                  const el = latest.elements.find((x) => x.id === selected.id)
                                  if (!el || el.type !== 'image') return
                                  const raw = e.target.value
                                  const opacity = raw === '' ? 1 : Number(raw)
                                  const clamped = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1
                                  applyTemplateChange(updateElement(latest, { ...el, opacity: clamped }))
                                }}
                                style={{ width: 90 }}
                              />
                            </div>
                          </label>
                        </div>
                      )}

                      {selected.type === 'line' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <label style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Thickness (pt)</div>
                            <input
                              type="number"
                              value={selected.thicknessPt ?? 1}
                              onChange={(e) => {
                                const latest = templateRef.current
                                const el = latest.elements.find((x) => x.id === selected.id)
                                if (!el || el.type !== 'line') return
                                applyTemplateChange(updateElement(latest, { ...el, thicknessPt: Number(e.target.value) }))
                              }}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Color</div>
                            <input
                              value={selected.color ?? ''}
                              onChange={(e) => {
                                const latest = templateRef.current
                                const el = latest.elements.find((x) => x.id === selected.id)
                                if (!el || el.type !== 'line') return
                                applyTemplateChange(updateElement(latest, { ...el, color: e.target.value }))
                              }}
                            />
                          </label>

                          <label style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Style</div>
                            <select
                              value={selected.lineStyle ?? 'solid'}
                              onChange={(e) => {
                                const next = e.target.value as 'solid' | 'dashed' | 'dotted'
                                const latest = templateRef.current
                                const el = latest.elements.find((x) => x.id === selected.id)
                                if (!el || el.type !== 'line') return
                                applyTemplateChange(updateElement(latest, { ...el, lineStyle: next }))
                              }}
                            >
                              <option value="solid">solid</option>
                              <option value="dashed">dashed</option>
                              <option value="dotted">dotted</option>
                            </select>
                          </label>
                        </div>
                      )}

                      {selected.type === 'table' && (
                        <div style={{ fontSize: 12, opacity: 0.75 }}>Table editing isn’t implemented yet.</div>
                      )}
                    </div>
                  )}
                </div>

                {errors.length > 0 && (
                  <div style={{ padding: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Evaluation warnings</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {errors.map((e, i) => (
                        <li key={i} style={{ fontSize: 12 }}>
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Inputs' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.75, flex: 1 }}>Define the input fields used by the template.</div>
                <button onClick={addInput}>+ Add</button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {template.inputs.map((def, idx) => (
                  <div key={`${def.key}_${idx}`} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Key</div>
                        <input value={def.key} onChange={(e) => renameInputKey(idx, e.target.value)} />
                      </label>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Label</div>
                        <input
                          value={def.label}
                          onChange={(e) => updateInputDef(idx, { ...def, label: e.target.value })}
                        />
                      </label>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 90px',
                        gap: 8,
                        marginTop: 8,
                        alignItems: 'end',
                      }}
                    >
                      <label style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Type</div>
                        <select
                          value={def.type}
                          onChange={(e) => updateInputDef(idx, { ...def, type: e.target.value })}
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="date">date</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(def.required)}
                          onChange={(e) => updateInputDef(idx, { ...def, required: e.target.checked })}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Required</span>
                      </label>

                      <button onClick={() => removeInput(idx)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Constants' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.75, flex: 1 }}>Static values available as constants.*</div>
                <button onClick={addConstant}>+ Add</button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {Object.entries(template.constants ?? {}).map(([k, v]) => (
                  <div key={k} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'end' }}>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Key</div>
                        <input value={k} onChange={(e) => renameConstantKey(k, e.target.value)} />
                      </label>
                      <button onClick={() => removeConstant(k)}>Remove</button>
                    </div>
                    <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>Value (JSON)</div>
                      <textarea
                        rows={3}
                        value={typeof v === 'string' ? v : JSON.stringify(v)}
                        onChange={(e) => updateConstantValue(k, e.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Variables' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.75, flex: 1 }}>Derived values computed from expressions.</div>
                <button
                  onClick={() => setShowOpsModal(true)}
                  style={{
                    padding: '6px 8px',
                    fontSize: 12,
                    borderRadius: 8,
                  }}
                >
                  Valid operations
                </button>
                <button onClick={addVar}>+ Add</button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {Object.entries(template.variables ?? {}).map(([k, expr]) => (
                  <div key={k} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'end' }}>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Key</div>
                        <input value={k} onChange={(e) => renameVarKey(k, e.target.value)} />
                      </label>
                      <button onClick={() => removeVar(k)}>Remove</button>
                    </div>
                    <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>Expression</div>
                      <textarea rows={3} value={expr} onChange={(e) => updateVarExpr(k, e.target.value)} />
                    </label>
                  </div>
                ))}
              </div>

              {showOpsModal &&
                createPortal(
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Valid expression operations"
                    onMouseDown={() => setShowOpsModal(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(17, 24, 39, 0.35)',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 16,
                      zIndex: 9999,
                    }}
                  >
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: 'min(780px, 100%)',
                        maxHeight: 'min(80vh, 760px)',
                        overflow: 'auto',
                        border: '1px solid #E5E7EB',
                        borderRadius: 12,
                        background: '#ffffff',
                        color: '#111827',
                        padding: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ fontWeight: 800, flex: 1 }}>Valid expression operations</div>
                        <button
                          onClick={() => setShowOpsModal(false)}
                          style={{ padding: '6px 8px', fontSize: 12, borderRadius: 8 }}
                        >
                          Close
                        </button>
                      </div>

                      <div style={{ display: 'grid', gap: 12, fontSize: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Available identifiers</div>
                          <div style={{ opacity: 0.85, lineHeight: 1.5 }}>
                            <code>inputs</code>, <code>constants</code>, <code>vars</code>, <code>row</code>, plus literals{' '}
                            <code>true</code>, <code>false</code>, <code>null</code>, <code>undefined</code>.
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Operators</div>
                          <div style={{ display: 'grid', gap: 6, opacity: 0.95, lineHeight: 1.5 }}>
                            <div>
                              <span style={{ fontWeight: 700 }}>Unary:</span> <code>!</code>, <code>+</code>, <code>-</code>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700 }}>Math:</span> <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>,{' '}
                              <code>%</code>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700 }}>Compare:</span> <code>&lt;</code>, <code>&lt;=</code>,{' '}
                              <code>&gt;</code>, <code>&gt;=</code>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700 }}>Equality:</span> <code>==</code>, <code>!=</code>,{' '}
                              <code>===</code>, <code>!==</code>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700 }}>Logical:</span> <code>&amp;&amp;</code>, <code>||</code>
                            </div>
                            <div>
                              <span style={{ fontWeight: 700 }}>Conditional:</span> <code>condition ? a : b</code>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Access & calls</div>
                          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5, opacity: 0.95 }}>
                            <li>
                              Dot member access only: <code>inputs.borrowerName</code> (no computed access like{' '}
                              <code>obj["x"]</code>).
                            </li>
                            <li>
                              Direct function calls only: <code>upper(inputs.name)</code> (no calling results of expressions).
                            </li>
                            <li>
                              Arrays and objects are supported: <code>[1, 2, 3]</code>, <code>{'{"a": 1}'}</code>.
                            </li>
                          </ul>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>Functions</div>
                          <div style={{ opacity: 0.85, marginBottom: 6 }}>
                            Use them like <code>fn(arg1, arg2)</code>. Examples: <code>coalesce(inputs.a, "n/a")</code>,{' '}
                            <code>json(vars.someObject)</code>.
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                              gap: 6,
                            }}
                          >
                            {functionNames.map((name) => (
                              <div
                                key={name}
                                style={{
                                  border: '1px solid #E5E7EB',
                                  borderRadius: 8,
                                  padding: '6px 8px',
                                  background: '#ffffff',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                  <code style={{ fontWeight: 800 }}>{name}</code>
                                  <span style={{ fontSize: 12, opacity: 0.8 }}>
                                    <code>{FUNCTION_DOCS[name]?.signature ?? `${name}(...)`}</code>
                                  </span>
                                </div>

                                <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                                  {FUNCTION_DOCS[name]?.description ?? 'No documentation available yet.'}
                                </div>

                                {FUNCTION_DOCS[name]?.examples?.length ? (
                                  <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>Examples</div>
                                    <div style={{ display: 'grid', gap: 4 }}>
                                      {FUNCTION_DOCS[name]!.examples.map((ex) => (
                                        <div
                                          key={ex}
                                          style={{
                                            border: '1px solid #E5E7EB',
                                            borderRadius: 8,
                                            padding: '6px 8px',
                                            background: '#ffffff',
                                          }}
                                        >
                                          <code>{ex}</code>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {FUNCTION_DOCS[name]?.notes?.length ? (
                                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                                    {FUNCTION_DOCS[name]!.notes.map((n) => (
                                      <div key={n}>• {n}</div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>,
                  document.body,
                )}
            </div>
          )}

          {activeTab === 'Test inputs' && (
            <TemplateInputForm inputs={template.inputs} values={effectiveSampleInputs} onChange={setSampleInputs} />
          )}
        </div>
      </aside>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>Live preview</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Tip: drag elements to move them.</div>
        </div>
        <div ref={previewWrapRef} style={{ overflow: 'auto', border: '1px solid #E5E7EB', padding: 12 }}>
          <DocumentPreview
            template={template}
            ctx={ctx}
            assetResolver={assetResolver}
            interaction={{
              selectedId: isPdfPreviewing ? null : selectedId,
              onElementPointerDown,
              onElementClick: (id) => setSelectedId(id),
              alignmentGuidesPt: isPdfPreviewing ? undefined : alignmentGuidesPt,
              onElementResizePointerDown: (id, handle, e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()

                const latest = templateRef.current
                const el = latest.elements.find((x) => x.id === id)
                if (!el || (el.type !== 'text' && el.type !== 'image')) return

                setSelectedId(id)
                setDrag(null)
                setLineEndpointDrag(null)

                resizeHistoryRef.current.base = latest
                resizeHistoryRef.current.didMove = false

                const { wPt, hPt } = getPageSizePt(latest.page.size, latest.page.orientation)
                setResizeDrag({
                  id,
                  handle,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  baseRect: { ...el.rect },
                  pageWPt: wPt,
                  pageHPt: hPt,
                })
              },
              onLineEndpointPointerDown: (id, endpoint, e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()

                const latest = templateRef.current
                const el = latest.elements.find((x) => x.id === id)
                if (!el || el.type !== 'line') return

                setSelectedId(id)

                setDrag(null)
                setResizeDrag(null)

                lineEndpointHistoryRef.current.base = latest
                lineEndpointHistoryRef.current.didMove = false

                const { wPt, hPt } = getPageSizePt(latest.page.size, latest.page.orientation)
                setLineEndpointDrag({
                  id,
                  endpoint,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  baseLine: getLineEndpointsPt(el),
                  pageWPt: wPt,
                  pageHPt: hPt,
                })
              },
            }}
          />
        </div>
      </section>
    </div>
  )
}
