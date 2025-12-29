import type { DocumentTemplateV1, EvalContext, FunctionMap } from './types';
export declare function buildEvalContext(template: DocumentTemplateV1, inputs: Record<string, unknown>, functions?: FunctionMap): {
    ctx: EvalContext;
    errors: string[];
};
export declare function evalBoolean(expr: string | undefined, ctx: EvalContext, functions?: FunctionMap): boolean;
//# sourceMappingURL=evaluate.d.ts.map