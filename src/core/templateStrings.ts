import type { EvalContext, FunctionMap } from './types'
import { evalExpression } from './expr'

export function renderTemplateString(tpl: string, ctx: EvalContext, functions?: FunctionMap): string {
  if (!tpl.includes('{{')) return tpl

  return tpl.replace(/\{\{([\s\S]*?)\}\}/g, (_m, inner) => {
    const expr = String(inner ?? '').trim()
    if (!expr) return ''
    try {
      const value = evalExpression(expr, ctx, functions)
      return value == null ? '' : String(value)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Keep rendering; show the error inline so users can fix the expression.
      return `[expr error: ${message}]`
    }
  })
}
