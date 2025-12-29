import jsep, { type Expression as JsepExpression } from 'jsep'
import type { EvalContext, FunctionMap } from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function safeGet(obj: unknown, prop: string): unknown {
  if (prop === '__proto__' || prop === 'prototype' || prop === 'constructor') {
    return undefined
  }

  if (isPlainObject(obj)) return obj[prop]
  if (Array.isArray(obj)) {
    const index = Number(prop)
    if (Number.isInteger(index) && index >= 0 && index < obj.length) return obj[index]
    return undefined
  }

  return undefined
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value)
  return Number.NaN
}

export type FunctionDoc = {
  signature: string
  description: string
  examples: string[]
  notes?: string[]
}

export const FUNCTION_DOCS: Record<string, FunctionDoc> = {
  concat: {
    signature: 'concat(...args)',
    description: 'Converts each argument to a string and joins them together.',
    examples: ['concat(inputs.firstName, " ", inputs.lastName)', 'concat("Loan #", inputs.loanNumber)'],
    notes: ['null/undefined become an empty string.'],
  },
  upper: {
    signature: 'upper(value)',
    description: 'Converts a value to a string and uppercases it.',
    examples: ['upper(inputs.borrowerName)', 'upper("hello")'],
    notes: ['null/undefined become an empty string.'],
  },
  lower: {
    signature: 'lower(value)',
    description: 'Converts a value to a string and lowercases it.',
    examples: ['lower(inputs.state)', 'lower("HELLO")'],
    notes: ['null/undefined become an empty string.'],
  },
  trim: {
    signature: 'trim(value)',
    description: 'Converts a value to a string and trims leading/trailing whitespace.',
    examples: ['trim(inputs.borrowerName)', 'trim("  hello  ")'],
    notes: ['null/undefined become an empty string.'],
  },
  padStart: {
    signature: 'padStart(value, length, padChar?)',
    description: 'Pads the start of a string to a target length using the given pad character (default: space).',
    examples: ['padStart(inputs.loanNumber, 10, "0")', 'padStart("7", 3, "0")'],
    notes: ['length is coerced to a number.', 'padChar defaults to a single space.'],
  },
  padEnd: {
    signature: 'padEnd(value, length, padChar?)',
    description: 'Pads the end of a string to a target length using the given pad character (default: space).',
    examples: ['padEnd(inputs.code, 8, " ")', 'padEnd("A", 3, "_")'],
    notes: ['length is coerced to a number.', 'padChar defaults to a single space.'],
  },
  replace: {
    signature: 'replace(value, search, replacement)',
    description: 'Replaces the first occurrence of search with replacement (string search, not regex).',
    examples: ['replace(inputs.name, "-", " ")', 'replace("a-b-c", "-", "_")'],
    notes: ['This is String.replace with a string search (only first match).'],
  },
  substr: {
    signature: 'substr(value, start, length?)',
    description: 'Returns a substring starting at start, optionally for length characters.',
    examples: ['substr(inputs.accountNumber, 0, 4)', 'substr("abcdef", 2)'],
    notes: ['Uses JavaScript substring semantics.', 'start/length are coerced to numbers.'],
  },
  abs: {
    signature: 'abs(number)',
    description: 'Absolute value of a number.',
    examples: ['abs(inputs.delta)', 'abs(-12)'],
    notes: ['If the value is not a number, results may be NaN.'],
  },
  round: {
    signature: 'round(number)',
    description: 'Rounds to the nearest integer.',
    examples: ['round(inputs.rate)', 'round(1.49)', 'round(1.5)'],
    notes: ['If the value is not a number, results may be NaN.'],
  },
  floor: {
    signature: 'floor(number)',
    description: 'Rounds down to the nearest integer.',
    examples: ['floor(inputs.amount)', 'floor(1.99)'],
    notes: ['If the value is not a number, results may be NaN.'],
  },
  ceil: {
    signature: 'ceil(number)',
    description: 'Rounds up to the nearest integer.',
    examples: ['ceil(inputs.amount)', 'ceil(1.01)'],
    notes: ['If the value is not a number, results may be NaN.'],
  },
  min: {
    signature: 'min(...numbers)',
    description: 'Returns the smallest of the provided numbers.',
    examples: ['min(inputs.a, inputs.b, inputs.c)', 'min(1, 2, 3)'],
    notes: ['All args are coerced to numbers; invalid values can produce NaN.'],
  },
  max: {
    signature: 'max(...numbers)',
    description: 'Returns the largest of the provided numbers.',
    examples: ['max(inputs.a, inputs.b, inputs.c)', 'max(1, 2, 3)'],
    notes: ['All args are coerced to numbers; invalid values can produce NaN.'],
  },
  coalesce: {
    signature: 'coalesce(...values)',
    description: 'Returns the first value that is not null and not undefined.',
    examples: ['coalesce(inputs.middleName, "")', 'coalesce(vars.override, inputs.defaultValue)'],
    notes: ['Unlike || it does not treat 0/false/"" as empty.'],
  },
  json: {
    signature: 'json(value)',
    description: 'Converts a value to a JSON string (useful for debugging in previews).',
    examples: ['json(inputs)', 'json(row)'],
    notes: ['Equivalent to JSON.stringify.'],
  },
}

export function defaultFunctions(): FunctionMap {
  return {
    concat: (...args) => args.map((a) => (a == null ? '' : String(a))).join(''),
    upper: (s) => (s == null ? '' : String(s).toUpperCase()),
    lower: (s) => (s == null ? '' : String(s).toLowerCase()),
    trim: (s) => (s == null ? '' : String(s).trim()),
    padStart: (s, len, ch) => String(s ?? '').padStart(Number(len ?? 0), String(ch ?? ' ')),
    padEnd: (s, len, ch) => String(s ?? '').padEnd(Number(len ?? 0), String(ch ?? ' ')),
    replace: (s, search, repl) => String(s ?? '').replace(String(search ?? ''), String(repl ?? '')),
    substr: (s, start, len) => {
      const str = String(s ?? '')
      const st = Number(start ?? 0)
      if (len == null) return str.substring(st)
      return str.substring(st, st + Number(len))
    },
    abs: (n) => Math.abs(toNumber(n)),
    round: (n) => Math.round(toNumber(n)),
    floor: (n) => Math.floor(toNumber(n)),
    ceil: (n) => Math.ceil(toNumber(n)),
    min: (...nums) => Math.min(...nums.map((n) => toNumber(n))),
    max: (...nums) => Math.max(...nums.map((n) => toNumber(n))),
    coalesce: (...vals) => vals.find((v) => v !== null && v !== undefined),
    json: (v) => JSON.stringify(v),
  }
}

export function parseExpression(expr: string): JsepExpression {
  return jsep(expr)
}

export function evalExpression(expr: string, ctx: EvalContext, functions?: FunctionMap): unknown {
  const ast = parseExpression(expr)
  return evalAst(ast, ctx, functions ?? defaultFunctions())
}

function evalAst(node: JsepExpression, ctx: EvalContext, functions: FunctionMap): unknown {
  switch (node.type) {
    case 'Literal':
      return (node as any).value

    case 'Identifier': {
      const name = (node as any).name as string
      if (name === 'true') return true
      if (name === 'false') return false
      if (name === 'null') return null
      if (name === 'undefined') return undefined

      if (name === 'inputs') return ctx.inputs
      if (name === 'constants') return ctx.constants
      if (name === 'vars') return ctx.vars
      if (name === 'row') return ctx.row

      if (Object.prototype.hasOwnProperty.call(functions, name)) return functions[name]

      return undefined
    }

    case 'UnaryExpression': {
      const { operator, argument } = node as any
      const arg = evalAst(argument, ctx, functions)
      switch (operator) {
        case '!':
          return !arg
        case '+':
          return +toNumber(arg)
        case '-':
          return -toNumber(arg)
        default:
          throw new Error(`Unsupported unary operator: ${operator}`)
      }
    }

    case 'BinaryExpression': {
      const { operator, left, right } = node as any
      const l = evalAst(left, ctx, functions)
      const r = evalAst(right, ctx, functions)
      switch (operator) {
        case '+':
          return (l as any) + (r as any)
        case '-':
          return toNumber(l) - toNumber(r)
        case '*':
          return toNumber(l) * toNumber(r)
        case '/':
          return toNumber(l) / toNumber(r)
        case '%':
          return toNumber(l) % toNumber(r)
        case '==':
          return (l as any) == (r as any)
        case '!=':
          return (l as any) != (r as any)
        case '===':
          return l === r
        case '!==':
          return l !== r
        case '<':
          return (l as any) < (r as any)
        case '<=':
          return (l as any) <= (r as any)
        case '>':
          return (l as any) > (r as any)
        case '>=':
          return (l as any) >= (r as any)
        default:
          throw new Error(`Unsupported binary operator: ${operator}`)
      }
    }

    case 'LogicalExpression': {
      const { operator, left, right } = node as any
      if (operator === '&&') {
        const l = evalAst(left, ctx, functions)
        return l ? evalAst(right, ctx, functions) : l
      }
      if (operator === '||') {
        const l = evalAst(left, ctx, functions)
        return l ? l : evalAst(right, ctx, functions)
      }
      throw new Error(`Unsupported logical operator: ${operator}`)
    }

    case 'ConditionalExpression': {
      const { test, consequent, alternate } = node as any
      return evalAst(test, ctx, functions) ? evalAst(consequent, ctx, functions) : evalAst(alternate, ctx, functions)
    }

    case 'MemberExpression': {
      const { object, property, computed } = node as any
      if (computed) throw new Error('Computed member access is not allowed')

      const objVal = evalAst(object, ctx, functions)
      const propName = property?.name as string
      return safeGet(objVal, propName)
    }

    case 'CallExpression': {
      const { callee, arguments: args } = node as any
      if (callee.type !== 'Identifier') throw new Error('Only direct function calls are allowed')

      const fn = evalAst(callee, ctx, functions)
      if (typeof fn !== 'function') throw new Error(`Unknown function: ${(callee as any).name}`)

      const evaluatedArgs = (args as JsepExpression[]).map((a) => evalAst(a, ctx, functions))
      return fn(...evaluatedArgs)
    }

    case 'ArrayExpression': {
      const { elements } = node as any
      return (elements as JsepExpression[]).map((e) => evalAst(e, ctx, functions))
    }

    case 'ObjectExpression': {
      const { properties } = node as any
      const out: Record<string, unknown> = {}
      for (const p of properties as any[]) {
        if (p.type !== 'Property') throw new Error('Unsupported object property type')
        if (p.computed) throw new Error('Computed object keys are not allowed')
        const key = p.key.type === 'Identifier' ? p.key.name : String(p.key.value)
        out[key] = evalAst(p.value, ctx, functions)
      }
      return out
    }

    default:
      throw new Error(`Unsupported expression node type: ${(node as any).type}`)
  }
}
