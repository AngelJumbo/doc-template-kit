import React from 'react'
import { TemplateDesigner } from 'doc-template-kit'
import type { DocumentTemplateV1 } from 'doc-template-kit'
import { defaultInputs, defaultTemplate } from '../demo/defaultTemplate'
import { downloadJson } from '../demo/download'

export function DesignerPage() {
  const [template, setTemplate] = React.useState<DocumentTemplateV1>(defaultTemplate)
  const [sampleInputs, setSampleInputs] = React.useState<Record<string, unknown>>(defaultInputs)

  const onSave = (tpl: DocumentTemplateV1) => {
    downloadJson('doc-template.v1.json', tpl)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 style={{ margin: 0 }}>Designer</h2>
      <TemplateDesigner
        template={template}
        onTemplateChange={setTemplate}
        sampleInputs={sampleInputs}
        onSampleInputsChange={setSampleInputs}
        onSave={onSave}
      />
    </div>
  )
}
