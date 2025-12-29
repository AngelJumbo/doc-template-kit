import type { DocumentTemplateV1 } from 'doc-template-kit'

export const defaultTemplate: DocumentTemplateV1 = {
  schemaVersion: 'docTemplate-v1',
  meta: {
    name: 'Document Template Demo',
    description: 'Demo template for Designer/Evaluator',
  },
  page: {
    size: 'LETTER',
    orientation: 'portrait',
    marginPt: { topPt: 36, rightPt: 36, bottomPt: 36, leftPt: 36 },
  },
  inputs: [
    { key: 'borrowerName', label: 'Borrower Name', type: 'string', required: true },
    { key: 'loanNumber', label: 'Loan Number', type: 'string', required: true },
    { key: 'issueDate', label: 'Issue Date', type: 'date', required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
  ],
  constants: {
    companyName: 'Contoso Lending',
    addressLine1: '1 Microsoft Way',
    addressLine2: 'Redmond, WA',
  },
  variables: {
    titleLine: "concat(constants.companyName, ' — Loan ', inputs.loanNumber)",
    amountLine: "concat('Amount: $', inputs.amount)",
  },
  elements: [
    {
      id: 'img_logo',
      type: 'image',
      imageRef: '/logo.png',
      rect: { xPt: 36, yPt: 36, wPt: 140, hPt: 42, z: 1 },
      fit: 'contain',
    },
    {
      id: 'txt_title',
      type: 'text',
      rect: { xPt: 36, yPt: 90, wPt: 540, hPt: 28, z: 2 },
      textTpl: '{{ vars.titleLine }}',
      style: { fontSizePt: 16, fontWeight: 'bold', textAlign: 'left' },
    },
    {
      id: 'ln_div',
      type: 'line',
      rect: { xPt: 36, yPt: 125, wPt: 540, hPt: 1, z: 1 },
      thicknessPt: 1,
      color: '#111827',
    },
    {
      id: 'txt_borrower',
      type: 'text',
      rect: { xPt: 36, yPt: 145, wPt: 540, hPt: 22, z: 1 },
      textTpl: 'Borrower: {{ inputs.borrowerName }}',
      style: { fontSizePt: 12 },
    },
    {
      id: 'txt_issue',
      type: 'text',
      rect: { xPt: 36, yPt: 168, wPt: 540, hPt: 22, z: 1 },
      textTpl: 'Issued: {{ inputs.issueDate }}',
      style: { fontSizePt: 12 },
    },
    {
      id: 'txt_amount',
      type: 'text',
      rect: { xPt: 36, yPt: 191, wPt: 540, hPt: 22, z: 1 },
      textTpl: '{{ vars.amountLine }}',
      style: { fontSizePt: 12 },
    },
    {
      id: 'txt_address',
      type: 'text',
      rect: { xPt: 36, yPt: 235, wPt: 540, hPt: 60, z: 1 },
      textTpl: '{{ constants.addressLine1 }}\n{{ constants.addressLine2 }}',
      style: { fontSizePt: 10, color: '#374151' },
    },
  ],
}

export const defaultInputs: Record<string, unknown> = {
  borrowerName: 'Ada Lovelace',
  loanNumber: 'LN-100045',
  issueDate: '2025-12-29',
  amount: 250000,
}
