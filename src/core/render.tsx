import React from 'react'
import type {
  AssetResolver,
  DocumentTemplateV1,
  EvalContext,
  ImageElementV1,
  LineElementV1,
  TableElementV1,
  TemplateV1Element,
  TextElementV1,
} from './types'
import { renderTemplateString } from './templateStrings'
import { getPageSizePt, ptToPx } from './units'
import { evalBoolean } from './evaluate'
import { evalExpression } from './expr'

async function resolveImage(imageRef: string, resolver?: AssetResolver): Promise<string> {
  if (!resolver) return imageRef
  const out = resolver(imageRef)
  return typeof out === 'string' ? out : await out
}

function rectStyle(rect: { xPt: number; yPt: number; wPt: number; hPt: number; z?: number }): React.CSSProperties {
  return {
    position: 'absolute',
    left: ptToPx(rect.xPt),
    top: ptToPx(rect.yPt),
    width: ptToPx(rect.wPt),
    height: ptToPx(rect.hPt),
    zIndex: rect.z ?? 1,
    boxSizing: 'border-box',
  }
}

export type PreviewInteraction = {
  selectedId?: string | null
  onElementPointerDown?: (id: string, e: React.PointerEvent) => void
  onElementClick?: (id: string) => void
  onLineEndpointPointerDown?: (id: string, endpoint: 'start' | 'end', e: React.PointerEvent) => void
  alignmentGuidesPt?: { xPts: number[]; yPts: number[] }
  onElementResizePointerDown?: (
    id: string,
    handle: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw',
    e: React.PointerEvent,
  ) => void
}

function getLineEndpointsPt(el: LineElementV1): { x1Pt: number; y1Pt: number; x2Pt: number; y2Pt: number } {
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
}

function TextEl({
  el,
  ctx,
  interaction,
}: {
  el: TextElementV1
  ctx: EvalContext
  interaction?: PreviewInteraction
}) {
  const borderWidthPt = el.style?.borderWidthPt
  const borderWidthPx = borderWidthPt != null ? ptToPx(borderWidthPt) : undefined
  const borderStyle = el.style?.borderStyle ?? 'solid'
  const borderColor = el.style?.borderColor ?? '#111827'
  const borderSides = el.style?.borderSides

  const style: React.CSSProperties = {
    ...rectStyle(el.rect),
    fontSize: el.style?.fontSizePt ? ptToPx(el.style.fontSizePt) : undefined,
    fontWeight: el.style?.fontWeight,
    fontStyle: el.style?.fontStyle,
    textAlign: el.style?.textAlign,
    color: el.style?.color,
    lineHeight: el.style?.lineHeight,
    textDecoration: el.style?.textDecoration,
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    outline: interaction?.selectedId === el.id ? '2px solid #6366F1' : undefined,
    outlineOffset: 1,
    cursor: interaction ? 'move' : undefined,
  }

  if (borderWidthPx != null && borderWidthPx > 0) {
    const sideValue = `${borderWidthPx}px ${borderStyle} ${borderColor}`
    if (!borderSides) {
      style.border = sideValue
    } else {
      style.borderTop = borderSides.top ? sideValue : 'none'
      style.borderRight = borderSides.right ? sideValue : 'none'
      style.borderBottom = borderSides.bottom ? sideValue : 'none'
      style.borderLeft = borderSides.left ? sideValue : 'none'
    }
  }

  const text = renderTemplateString(el.textTpl, ctx)
  return (
    <div
      style={style}
      onPointerDown={(e) => interaction?.onElementPointerDown?.(el.id, e)}
      onClick={() => interaction?.onElementClick?.(el.id)}
    >
      {text}

      {interaction?.selectedId === el.id && interaction.onElementResizePointerDown && (
        <>
          {(
            [
              { key: 'nw', left: 0, top: 0, cursor: 'nwse-resize' },
              { key: 'n', left: '50%', top: 0, cursor: 'ns-resize' },
              { key: 'ne', left: '100%', top: 0, cursor: 'nesw-resize' },
              { key: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
              { key: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
              { key: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
              { key: 'sw', left: 0, top: '100%', cursor: 'nesw-resize' },
              { key: 'w', left: 0, top: '50%', cursor: 'ew-resize' },
            ] as const
          ).map((h) => (
            <div
              key={h.key}
              onPointerDown={(e) => interaction.onElementResizePointerDown?.(el.id, h.key, e)}
              style={{
                position: 'absolute',
                left: h.left,
                top: h.top,
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: 999,
                background: '#ffffff',
                border: '2px solid #6366F1',
                boxSizing: 'border-box',
                cursor: h.cursor,
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}

function LineEl({ el, interaction }: { el: LineElementV1; interaction?: PreviewInteraction }) {
  const thicknessPt = el.thicknessPt ?? 1
  const thicknessPx = ptToPx(thicknessPt)
  const color = el.color ?? '#111827'
  const lineStyle = el.lineStyle ?? 'solid'

  const { x1Pt, y1Pt, x2Pt, y2Pt } = getLineEndpointsPt(el)
  const x1 = ptToPx(x1Pt - el.rect.xPt)
  const y1 = ptToPx(y1Pt - el.rect.yPt)
  const x2 = ptToPx(x2Pt - el.rect.xPt)
  const y2 = ptToPx(y2Pt - el.rect.yPt)

  const dashPx = Math.max(6, thicknessPx * 4)
  const gapPx = Math.max(4, thicknessPx * 2)
  const dotPx = Math.max(2, thicknessPx)
  const strokeDasharray =
    lineStyle === 'solid' ? undefined : lineStyle === 'dashed' ? `${dashPx} ${gapPx}` : `${dotPx} ${gapPx}`

  const style: React.CSSProperties = {
    ...rectStyle(el.rect),
    width: ptToPx(el.rect.wPt),
    height: ptToPx(el.rect.hPt),
    outline: interaction?.selectedId === el.id ? '2px solid #6366F1' : undefined,
    outlineOffset: 1,
    cursor: interaction ? 'move' : undefined,
  }

  return (
    <div
      style={style}
      onPointerDown={(e) => interaction?.onElementPointerDown?.(el.id, e)}
      onClick={() => interaction?.onElementClick?.(el.id)}
    >
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        {/* Invisible hit line for easier selection */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="transparent"
          strokeWidth={Math.max(12, thicknessPx)}
          style={{ pointerEvents: 'stroke' }}
        />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={thicknessPx}
          strokeDasharray={strokeDasharray}
          strokeLinecap={lineStyle === 'dotted' ? 'round' : 'butt'}
          style={{ pointerEvents: 'none' }}
        />
      </svg>

      {interaction?.selectedId === el.id && interaction.onLineEndpointPointerDown && (
        <>
          {(
            [
              { key: 'start', left: x1, top: y1 },
              { key: 'end', left: x2, top: y2 },
            ] as const
          ).map((h) => (
            <div
              key={h.key}
              onPointerDown={(e) => interaction.onLineEndpointPointerDown?.(el.id, h.key, e)}
              style={{
                position: 'absolute',
                left: h.left - 6,
                top: h.top - 6,
                width: 12,
                height: 12,
                borderRadius: 999,
                background: '#ffffff',
                border: '2px solid #6366F1',
                boxSizing: 'border-box',
                cursor: 'crosshair',
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}

function TableEl({ el, ctx, interaction }: { el: TableElementV1; ctx: EvalContext; interaction?: PreviewInteraction }) {
  let rows: unknown[] = []
  try {
    const v = evalExpression(el.rowsExpr, ctx)
    if (Array.isArray(v)) rows = v
  } catch {
    rows = []
  }

  const fontSizePx = el.fontSizePt ? ptToPx(el.fontSizePt) : undefined
  const cols = el.columns

  return (
    <div
      style={{
        ...rectStyle(el.rect),
        overflow: 'hidden',
        outline: interaction?.selectedId === el.id ? '2px solid #6366F1' : undefined,
        outlineOffset: 1,
        cursor: interaction ? 'move' : undefined,
      }}
      onPointerDown={(e) => interaction?.onElementPointerDown?.(el.id, e)}
      onClick={() => interaction?.onElementClick?.(el.id)}
    >
      <table
        style={{
          width: '100%',
          height: '100%',
          borderCollapse: 'collapse',
          fontSize: fontSizePx,
        }}
      >
        {el.headerRow !== false && (
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  style={{
                    border: el.border === false ? 'none' : '1px solid #E5E7EB',
                    textAlign: 'left',
                    padding: '4px',
                    width: c.widthPct ? `${c.widthPct}%` : undefined,
                  }}
                >
                  {c.header ?? c.key}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {cols.map((c) => (
                <td
                  key={c.key}
                  style={{
                    border: el.border === false ? 'none' : '1px solid #E5E7EB',
                    padding: '4px',
                    verticalAlign: 'top',
                  }}
                >
                  {renderTemplateString(c.cellTpl, { ...ctx, row })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImageEl({ el, url, interaction }: { el: ImageElementV1; url: string; interaction?: PreviewInteraction }) {
  const fit = el.fit ?? 'contain'
  const objectFit: React.CSSProperties['objectFit'] = fit === 'stretch' ? 'fill' : fit
  const opacity = typeof el.opacity === 'number' ? Math.max(0, Math.min(1, el.opacity)) : 1

  return (
    <div
      style={{
        ...rectStyle(el.rect),
        outline: interaction?.selectedId === el.id ? '2px solid #6366F1' : undefined,
        outlineOffset: 1,
        cursor: interaction ? 'move' : undefined,
      }}
      onPointerDown={(e) => interaction?.onElementPointerDown?.(el.id, e)}
      onClick={() => interaction?.onElementClick?.(el.id)}
    >
      <img
        src={url}
        alt={el.imageRef}
        style={{ width: '100%', height: '100%', objectFit, display: 'block', opacity }}
        crossOrigin="anonymous"
      />

      {interaction?.selectedId === el.id && interaction.onElementResizePointerDown && (
        <>
          {(
            [
              { key: 'nw', left: 0, top: 0, cursor: 'nwse-resize' },
              { key: 'n', left: '50%', top: 0, cursor: 'ns-resize' },
              { key: 'ne', left: '100%', top: 0, cursor: 'nesw-resize' },
              { key: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
              { key: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
              { key: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
              { key: 'sw', left: 0, top: '100%', cursor: 'nesw-resize' },
              { key: 'w', left: 0, top: '50%', cursor: 'ew-resize' },
            ] as const
          ).map((h) => (
            <div
              key={h.key}
              onPointerDown={(e) => interaction.onElementResizePointerDown?.(el.id, h.key, e)}
              style={{
                position: 'absolute',
                left: h.left,
                top: h.top,
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: 999,
                background: '#ffffff',
                border: '2px solid #6366F1',
                boxSizing: 'border-box',
                cursor: h.cursor,
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}

function sortElements(elements: TemplateV1Element[]): TemplateV1Element[] {
  return [...elements].sort((a, b) => (a.rect.z ?? 0) - (b.rect.z ?? 0))
}

export function DocumentPreview({
  template,
  ctx,
  assetResolver,
  className,
  interaction,
}: {
  template: DocumentTemplateV1
  ctx: EvalContext
  assetResolver?: AssetResolver
  className?: string
  interaction?: PreviewInteraction
}) {
  const { wPt, hPt } = getPageSizePt(template.page.size, template.page.orientation, template.page.customSizePt)
  const wPx = ptToPx(wPt)
  const hPx = ptToPx(hPt)

  const [imageUrls, setImageUrls] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      const refs = new Set<string>()
      for (const el of template.elements) {
        if (el.type === 'image') refs.add(el.imageRef)
      }

      const entries = await Promise.all(
        [...refs].map(async (ref) => {
          try {
            const url = await resolveImage(ref, assetResolver)
            return [ref, url] as const
          } catch {
            return [ref, ''] as const
          }
        }),
      )

      if (!cancelled) setImageUrls(Object.fromEntries(entries))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [template, assetResolver])

  return (
    <div
      data-doc-root
      className={className}
      style={{
        width: wPx,
        height: hPx,
        background: 'white',
        position: 'relative',
        border: '1px solid #E5E7EB',
        overflow: 'hidden',
      }}
    >
      {interaction?.alignmentGuidesPt?.xPts?.map((xPt, i) => (
        <div
          key={`gx_${i}`}
          style={{
            position: 'absolute',
            left: ptToPx(xPt),
            top: 0,
            width: 1,
            height: '100%',
            background: '#6366F1',
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        />
      ))}
      {interaction?.alignmentGuidesPt?.yPts?.map((yPt, i) => (
        <div
          key={`gy_${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: ptToPx(yPt),
            width: '100%',
            height: 1,
            background: '#6366F1',
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        />
      ))}

      {sortElements(template.elements).map((el) => {
        if (!evalBoolean(el.visibleIf, ctx)) return null

        if (el.type === 'text') return <TextEl key={el.id} el={el} ctx={ctx} interaction={interaction} />
        if (el.type === 'line') return <LineEl key={el.id} el={el} interaction={interaction} />
        if (el.type === 'table') return <TableEl key={el.id} el={el} ctx={ctx} interaction={interaction} />
        if (el.type === 'image') {
          const url = imageUrls[el.imageRef]
          return url ? <ImageEl key={el.id} el={el} url={url} interaction={interaction} /> : null
        }

        return null
      })}
    </div>
  )
}
