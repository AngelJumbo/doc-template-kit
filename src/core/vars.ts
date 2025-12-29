import type { EvalContext, FunctionMap } from './types'
import { parseExpression, evalExpression } from './expr'

function collectVarDeps(expr: string): Set<string> {
  const deps = new Set<string>()
  const ast = parseExpression(expr)

  const visit = (node: any) => {
    if (!node) return

    if (node.type === 'MemberExpression' && !node.computed) {
      if (node.object?.type === 'Identifier' && node.object?.name === 'vars' && node.property?.type === 'Identifier') {
        deps.add(node.property.name)
      }
    }

    for (const key of Object.keys(node)) {
      const value = (node as any)[key]
      if (!value) continue
      if (Array.isArray(value)) {
        for (const v of value) if (v && typeof v === 'object') visit(v)
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        visit(value)
      }
    }
  }

  visit(ast as any)
  return deps
}

export function evaluateVariables(
  variableExprs: Record<string, string>,
  ctxBase: Omit<EvalContext, 'vars'>,
  functions?: FunctionMap,
): { vars: Record<string, unknown>; errors: string[] } {
  const errors: string[] = []
  const depsByVar = new Map<string, Set<string>>()

  for (const [key, expr] of Object.entries(variableExprs)) {
    try {
      depsByVar.set(key, collectVarDeps(expr))
    } catch (e) {
      errors.push(`vars.${key}: ${(e as Error).message}`)
      depsByVar.set(key, new Set())
    }
  }

  const vars: Record<string, unknown> = {}
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const evalVar = (key: string) => {
    if (visited.has(key)) return
    if (visiting.has(key)) {
      errors.push(`Cycle detected in vars: ${key}`)
      return
    }

    visiting.add(key)
    for (const dep of depsByVar.get(key) ?? []) {
      if (Object.prototype.hasOwnProperty.call(variableExprs, dep)) evalVar(dep)
    }

    try {
      vars[key] = evalExpression(variableExprs[key]!, { ...ctxBase, vars }, functions)
    } catch (e) {
      errors.push(`vars.${key}: ${(e as Error).message}`)
    }

    visiting.delete(key)
    visited.add(key)
  }

  for (const key of Object.keys(variableExprs)) evalVar(key)

  return { vars, errors }
}
