import type { AssetResolver, DocumentTemplateV1 } from '../core/types';
export declare function TemplateDesigner({ template, onTemplateChange, sampleInputs, onSampleInputsChange, assetResolver, onSave, }: {
    template: DocumentTemplateV1;
    onTemplateChange: (next: DocumentTemplateV1) => void;
    sampleInputs?: Record<string, unknown>;
    onSampleInputsChange?: (next: Record<string, unknown>) => void;
    assetResolver?: AssetResolver;
    onSave: (template: DocumentTemplateV1) => void;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=CreditTitleDesigner.d.ts.map