import type { DocumentTemplateV1 } from './types'
import { getPageSizePt } from './units'

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if ((img as HTMLImageElement).complete) return
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      } catch {
        // ignore
      }
    }),
  )

  // Prefer decode() when available
  await Promise.all(
    imgs.map(async (img) => {
      const anyImg = img as any
      if (typeof anyImg.decode === 'function') {
        try {
          await anyImg.decode()
        } catch {
          // ignore
        }
      }
    }),
  )
}

export async function openPdfPreviewFromElement(root: HTMLElement, template: DocumentTemplateV1): Promise<void> {
  // html2pdf.js ships as a UMD-like module; TS typings are not guaranteed.
  const mod: any = await import('html2pdf.js')
  const html2pdf: any = mod?.default ?? mod

  const { wPt, hPt } = getPageSizePt(template.page.size, template.page.orientation, template.page.customSizePt)

  await (document as any).fonts?.ready
  await waitForImages(root)

  const worker = html2pdf()
    .set({
      margin: 0,
      filename: `${template.meta?.name ?? 'document'}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: {
        unit: 'pt',
        format: [wPt, hPt],
        orientation: template.page.orientation,
      },
    })
    .from(root)
    .toPdf()

  const pdf: any = await worker.get('pdf')
  const blob: Blob = pdf.output('blob')

  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}
