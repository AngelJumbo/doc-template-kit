# doc-template-kit

React + TypeScript components for building **JSON-driven document templates**:

- `TemplateDesigner`: visually design a template (drag/move, resize, duplicate, guides, undo/redo) with live preview and **PDF preview**.
- `TemplateEvaluator`: fill inputs, compute vars, preview, and **Print** (opens the generated PDF preview).

Templates support safe template strings like `{{ inputs.name }}` and derived variables.

This package is **ESM-only**.

## Install

```bash
npm i doc-template-kit
```

### Peer dependencies

You must provide these in your app:

- `react`
- `react-dom`

## Quick start

### Designer

```tsx
import * as React from 'react'
import { TemplateDesigner, type DocumentTemplateV1 } from 'doc-template-kit'

export function MyDesigner() {
	const [template, setTemplate] = React.useState<DocumentTemplateV1>(() => ({
		meta: { name: 'My Template' },
		page: { size: 'LETTER', orientation: 'portrait' },
		inputs: [],
		constants: {},
		variables: {},
		elements: [],
	}))

	// Optional: used for previewing computed text while designing.
	const [sampleInputs, setSampleInputs] = React.useState<Record<string, unknown>>({})

	return (
		<TemplateDesigner
			template={template}
			onTemplateChange={setTemplate}
			sampleInputs={sampleInputs}
			onSampleInputsChange={setSampleInputs}
			onSave={(nextTemplate) => {
				// Persist however you want (download, API, DB, etc.)
				console.log('save', nextTemplate)
			}}
		/>
	)
}
```

Notes:

- `sampleInputs` / `onSampleInputsChange` are optional. If you omit `onSampleInputsChange`, the designer manages sample inputs internally.

### Evaluator

```tsx
import * as React from 'react'
import { TemplateEvaluator, type DocumentTemplateV1 } from 'doc-template-kit'

export function MyEvaluator({ template }: { template: DocumentTemplateV1 }) {
	const [inputs, setInputs] = React.useState<Record<string, unknown>>({})

	return (
		<TemplateEvaluator
			template={template}
			inputs={inputs}
			onInputsChange={setInputs}
			onPrintOpen={({ inputs, vars }) => {
				// Useful for persistence/audit logs:
				// - inputs: user-entered values
				// - vars: evaluated variables (computed)
				console.log({ inputs, vars })
			}}
		/>
	)
}
```

Evaluator notes:

- `inputs` / `onInputsChange` can be omitted (uncontrolled mode).
- `readOnly` is supported for re-printing previously saved documents.

## Images

Image elements use an `imageRef` string.

- By default (no resolver), `imageRef` is used as a same-origin URL (e.g. `/logo.png`).
- You can optionally pass `assetResolver` to map a ref to a URL.
- Images support `opacity` for watermark-like effects.

## PDF preview / Print

PDF generation uses `html2pdf.js` (internally `html2canvas` + `jsPDF`) and opens the generated PDF in a new tab.

While generating the PDF from the Designer, selection overlays and guides are suppressed so they won’t appear in the output.

## Expressions

Template strings use `{{ ... }}` and are evaluated in a restricted expression environment.
You can reference:

- `inputs` (user values)
- `constants`
- `vars` (derived variables)

The Designer includes a “Valid operations” modal listing supported operators and helper functions.

## Repo / demo

This repository includes a Vite demo app under `demo/`.

From the repo root:

```bash
npm install
npm run dev
```

Build demo (also builds the library first):

```bash
npm run build:demo
```

Build library only:

```bash
npm run build
```

## Roadmap (non-exhaustive)

- Multi-page templates and page breaks
- Header/footer regions
- Richer table editor
- Font family selection + font embedding strategy
