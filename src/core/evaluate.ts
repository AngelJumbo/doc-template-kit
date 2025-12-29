import type { DocumentTemplateV1, EvalContext, FunctionMap } from './types'
import { defaultFunctions, evalExpression } from './expr'
import { evaluateVariables } from './vars'

export function buildEvalContext(
  template: DocumentTemplateV1,
  inputs: Record<string, unknown>,
  functions?: FunctionMap,
): { ctx: EvalContext; errors: string[] } {
  const fn = functions ?? defaultFunctions()

  const base = {
    inputs,
    constants: template.constants ?? {},
  }

  const { vars, errors: varErrors } = evaluateVariables(template.variables ?? {}, base, fn)
  return { ctx: { ...base, vars }, errors: [...varErrors] }
}

export function evalBoolean(expr: string | undefined, ctx: EvalContext, functions?: FunctionMap): boolean {
  if (!expr) return true
  const fn = functions ?? defaultFunctions()
  try {
    return Boolean(evalExpression(expr, ctx, fn))
  } catch {
    return false
  }
}
