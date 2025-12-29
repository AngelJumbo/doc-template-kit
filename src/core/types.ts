export type SchemaVersion = 'docTemplate-v1'
export type PageSize = 'A4' | 'LETTER'
export type PageOrientation = 'portrait' | 'landscape'

export type InputType = 'string' | 'number' | 'boolean' | 'date'

export interface RectPt {
  xPt: number
  yPt: number
  wPt: number
  hPt: number
  z?: number
}

export interface PageMarginsPt {
  topPt: number
  rightPt: number
  bottomPt: number
  leftPt: number
}

export interface TemplateMeta {
  name: string
  description?: string
}

export interface TemplatePage {
  size: PageSize
  orientation: PageOrientation
  marginPt: PageMarginsPt
}

export interface InputDefV1 {
  key: string
  label: string
  type: InputType
  required?: boolean
  defaultValue?: unknown
}

export type ElementType = 'text' | 'image' | 'line' | 'table'

export interface BaseElementV1 {
  id: string
  type: ElementType
  rect: RectPt
  visibleIf?: string
}

export interface TextStyleV1 {
  fontSizePt?: number
  fontWeight?: number | 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  textDecoration?: 'none' | 'underline'
  lineHeight?: number

  // Border (optional). If borderSides is omitted, border applies to all sides.
  borderWidthPt?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  borderSides?: {
    top?: boolean
    right?: boolean
    bottom?: boolean
    left?: boolean
  }
}

export interface TextElementV1 extends BaseElementV1 {
  type: 'text'
  textTpl: string
  style?: TextStyleV1
}

export interface ImageElementV1 extends BaseElementV1 {
  type: 'image'
  imageRef: string
  fit?: 'contain' | 'cover' | 'stretch'
  // Optional opacity for watermark-like usage (0..1)
  opacity?: number
}

export interface LineElementV1 extends BaseElementV1 {
  type: 'line'
  // Optional absolute endpoints in page points (pt). If omitted, the renderer/Designer will
  // fall back to a horizontal/vertical line derived from rect.
  x1Pt?: number
  y1Pt?: number
  x2Pt?: number
  y2Pt?: number
  thicknessPt?: number
  color?: string
  lineStyle?: 'solid' | 'dashed' | 'dotted'
}

export interface TableColumnV1 {
  key: string
  header?: string
  cellTpl: string
  widthPct?: number
}

export interface TableElementV1 extends BaseElementV1 {
  type: 'table'
  rowsExpr: string
  columns: TableColumnV1[]
  headerRow?: boolean
  border?: boolean
  fontSizePt?: number
}

export type TemplateV1Element = TextElementV1 | ImageElementV1 | LineElementV1 | TableElementV1

export interface DocumentTemplateV1 {
  schemaVersion: SchemaVersion
  meta: TemplateMeta
  page: TemplatePage
  inputs: InputDefV1[]
  constants: Record<string, unknown>
  variables: Record<string, string>
  elements: TemplateV1Element[]
}

export interface DocumentTemplatePackageV1 {
  template: DocumentTemplateV1
  assets?: Record<string, { dataUrl: string; mimeType?: string }>
}

export interface EvalContext {
  inputs: Record<string, unknown>
  constants: Record<string, unknown>
  vars: Record<string, unknown>
  row?: unknown
}

export type FunctionMap = Record<string, (...args: unknown[]) => unknown>

export type AssetResolver = (imageRef: string) => Promise<string> | string
