import type { PageOrientation, PageSize } from './types'

const A4_PT = { wPt: 595.28, hPt: 841.89 }
const LETTER_PT = { wPt: 612, hPt: 792 }

export function getPageSizePt(size: PageSize, orientation: PageOrientation): { wPt: number; hPt: number } {
  const base = size === 'A4' ? A4_PT : LETTER_PT
  if (orientation === 'portrait') return { ...base }
  return { wPt: base.hPt, hPt: base.wPt }
}

export function ptToPx(pt: number): number {
  return (pt * 96) / 72
}

export function pxToPt(px: number): number {
  return (px * 72) / 96
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
