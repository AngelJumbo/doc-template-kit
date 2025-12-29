import { type Expression as JsepExpression } from 'jsep';
import type { EvalContext, FunctionMap } from './types';
export type FunctionDoc = {
    signature: string;
    description: string;
    examples: string[];
    notes?: string[];
};
export declare const FUNCTION_DOCS: Record<string, FunctionDoc>;
export declare function defaultFunctions(): FunctionMap;
export declare function parseExpression(expr: string): JsepExpression;
export declare function evalExpression(expr: string, ctx: EvalContext, functions?: FunctionMap): unknown;
//# sourceMappingURL=expr.d.ts.map