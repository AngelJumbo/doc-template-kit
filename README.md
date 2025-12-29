# Document Template Kit (V1) — Designer + Evaluator + HTML2PDF

This workspace contains:

- A reusable library you can import into other React projects.
- A small demo app (Vite) that hosts the Designer (`/designer`) and Evaluator (`/evaluator`).

The library provides:

- `TemplateDesigner`: interactive editor (move/resize/duplicate, guides, undo/redo) with a live preview and PDF preview.
- `TemplateEvaluator`: runtime view to load a template/package, enter inputs, and preview HTML/PDF.

Templates are JSON-driven and support safe expression evaluation and template strings like `{{ inputs.name }}`.

## Run the demo

From the `app/` folder:

```bash
npm install
npm run dev
```

## Build the library

```bash
npm run build:lib
```

Outputs:

- `dist-lib/` (ESM bundle)
- `dist-types/` (TypeScript declarations)

## Using the library in another project

This repo currently builds the library locally. In another React app, you typically:

```ts
import React from 'react'
import { TemplateDesigner, type DocumentTemplateV1 } from 'doc-template-kit'

export function MyDesigner() {
	const [template, setTemplate] = React.useState<DocumentTemplateV1>(/* load or create */)
	const [sampleInputs, setSampleInputs] = React.useState<Record<string, unknown>>({})

	return (
		<TemplateDesigner
			template={template}
			onTemplateChange={setTemplate}
			sampleInputs={sampleInputs}
			onSampleInputsChange={setSampleInputs}
		/>
	)
}
```

And for runtime rendering:

```ts
import React from 'react'
import { TemplateEvaluator, type DocumentTemplateV1 } from 'doc-template-kit'

export function MyPreview({ template }: { template: DocumentTemplateV1 }) {
	const [inputs, setInputs] = React.useState<Record<string, unknown>>({})
	return (
		<TemplateEvaluator
			template={template}
			inputs={inputs}
			onInputsChange={setInputs}
		/>
	)
}
```

## Notes

- PDF generation uses `html2pdf.js` (internally `html2canvas` + `jsPDF`) and opens the generated PDF in a new tab.
- While previewing PDF from the Designer, selection overlays and alignment guides are suppressed so they don’t appear in the exported PDF.

## TODO (missing features)

- Multi-page templates and page breaks
- Header/footer regions
- Richer table editor (columns UI, row styling, borders)
- Font family selection + font embedding strategy
- Better image asset packaging workflow (bundle/import helpers)
- More shapes (rectangles, circles) and gradients
- Optional snapping (not just guides) for alignment
