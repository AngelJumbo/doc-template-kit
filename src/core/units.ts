import type { PageOrientation, PageSize } from './types'

const A3_PT = { wPt: 841.89, hPt: 1190.55 }
const A4_PT = { wPt: 595.28, hPt: 841.89 }
const A5_PT = { wPt: 419.53, hPt: 595.28 }
const LETTER_PT = { wPt: 612, hPt: 792 }
const LEGAL_PT = { wPt: 612, hPt: 1008 }

const PT_PER_MM = 72 / 25.4

export function getPageSizePt(
  size: PageSize,
  orientation: PageOrientation,
  customSizePt?: { wPt: number; hPt: number },
): { wPt: number; hPt: number } {
  const base =
    size === 'A3'
      ? A3_PT
      : size === 'A4'
        ? A4_PT
        : size === 'A5'
          ? A5_PT
          : size === 'LEGAL'
            ? LEGAL_PT
            : size === 'CUSTOM'
              ? (customSizePt ?? A4_PT)
              : LETTER_PT
  if (orientation === 'portrait') return { ...base }
  return { wPt: base.hPt, hPt: base.wPt }
}

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM
}

export function ptToMm(pt: number): number {
  return pt / PT_PER_MM
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
