import type { AssetResolver, DocumentTemplateV1 } from '../core/types';
export declare function TemplateEvaluator({ template, inputs, onInputsChange, assetResolver, onPrintOpen, readOnly, }: {
    template: DocumentTemplateV1;
    inputs?: Record<string, unknown>;
    onInputsChange?: (next: Record<string, unknown>) => void;
    assetResolver?: AssetResolver;
    onPrintOpen?: (payload: {
        inputs: Record<string, unknown>;
        vars: Record<string, unknown>;
    }) => void;
    readOnly?: boolean;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=CreditTitleEvaluator.d.ts.map