import React from 'react'
import { TemplateEvaluator } from 'doc-template-kit'
import type { DocumentTemplateV1 } from 'doc-template-kit'
import { defaultInputs, defaultTemplate } from '../demo/defaultTemplate'

function isTemplateV1(x: any): x is DocumentTemplateV1 {
  return x && typeof x === 'object' && x.schemaVersion === 'docTemplate-v1'
}

export function EvaluatorPage() {
  const [template, setTemplate] = React.useState<DocumentTemplateV1>(defaultTemplate)
  const [inputs, setInputs] = React.useState<Record<string, unknown>>(defaultInputs)

  const onImportFile = async (file: File) => {
    const text = await file.text()
    const parsed = JSON.parse(text)

    if (isTemplateV1(parsed)) {
      setTemplate(parsed)
      return
    }

    throw new Error('Unsupported JSON format (expected template v1 or package v1)')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 style={{ margin: 0 }}>Evaluator</h2>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Import template/package JSON</div>
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                await onImportFile(file)
              } catch (err) {
                alert((err as Error).message)
              } finally {
                e.target.value = ''
              }
            }}
          />
        </label>
        <button
          onClick={() => {
            setTemplate(defaultTemplate)
            setInputs(defaultInputs)
          }}
        >
          Reset demo
        </button>
      </div>

      <TemplateEvaluator
        template={template}
        inputs={inputs}
        onInputsChange={setInputs}
        onPrintOpen={(payload:any) => {
          // Example hook: persist payload.inputs + payload.vars to your backend/DB.
          console.log('print payload', payload)
        }}
      />
    </div>
  )
}
