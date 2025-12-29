import type { EvalContext, FunctionMap } from './types';
export declare function evaluateVariables(variableExprs: Record<string, string>, ctxBase: Omit<EvalContext, 'vars'>, functions?: FunctionMap): {
    vars: Record<string, unknown>;
    errors: string[];
};
//# sourceMappingURL=vars.d.ts.map