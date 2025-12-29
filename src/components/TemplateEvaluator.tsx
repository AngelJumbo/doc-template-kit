import React from 'react'
import type { AssetResolver, DocumentTemplateV1 } from '../core/types'
import { buildEvalContext } from '../core/evaluate'
import { DocumentPreview } from '../core/render'
import { openPdfPreviewFromElement } from '../core/pdf'
import { TemplateInputForm } from './TemplateInputForm'

function buildDefaultInputs(template: DocumentTemplateV1): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const def of template.inputs) {
    if (def.defaultValue !== undefined) out[def.key] = def.defaultValue
  }
  return out
}

export function TemplateEvaluator({
  template,
  inputs,
  onInputsChange,
  assetResolver,
  onPrintOpen,
  readOnly,
}: {
  template: DocumentTemplateV1
  inputs?: Record<string, unknown>
  onInputsChange?: (next: Record<string, unknown>) => void
  assetResolver?: AssetResolver
  onPrintOpen?: (payload: { inputs: Record<string, unknown>; vars: Record<string, unknown> }) => void
  readOnly?: boolean
}) {
  const previewWrapRef = React.useRef<HTMLDivElement | null>(null)
  const [uncontrolledInputs, setUncontrolledInputs] = React.useState<Record<string, unknown>>(() =>
    buildDefaultInputs(template),
  )

  React.useEffect(() => {
    // If consumer is not controlling inputs, reset defaults when the template changes.
    if (inputs === undefined) setUncontrolledInputs(buildDefaultInputs(template))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template])

  const currentInputs = inputs ?? uncontrolledInputs
  const { ctx, errors } = React.useMemo(() => buildEvalContext(template, currentInputs), [template, currentInputs])

  const handleInputsChange = (next: Record<string, unknown>) => {
    if (readOnly) return
    if (onInputsChange) {
      onInputsChange(next)
    } else {
      setUncontrolledInputs(next)
    }
  }

  const onPrint = async () => {
    const root = previewWrapRef.current?.querySelector('[data-doc-root]') as HTMLElement | null
    if (!root) return

    try {
      onPrintOpen?.({ inputs: currentInputs, vars: ctx.vars })
    } catch {
      // ignore callback errors
    }

    // Re-use the stable PDF preview path.
    // Users can print from the PDF viewer dialog.
    await openPdfPreviewFromElement(root, template)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onPrint}>Print</button>
        </div>

        <div style={{ padding: 12, border: '1px solid #E5E7EB', borderRadius: 6 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Inputs</div>
          <TemplateInputForm inputs={template.inputs} values={currentInputs} onChange={handleInputsChange} readOnly={readOnly} />
        </div>

        {errors.length > 0 && (
          <div style={{ padding: 12, border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: 6 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Evaluation warnings</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e, i) => (
                <li key={i} style={{ fontSize: 12 }}>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Preview</div>
        <div ref={previewWrapRef} style={{ overflow: 'auto', border: '1px solid #E5E7EB', padding: 12 }}>
          <DocumentPreview template={template} ctx={ctx} assetResolver={assetResolver} />
        </div>
      </section>
    </div>
  )
}
