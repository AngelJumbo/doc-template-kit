import React from 'react';
import type { AssetResolver, DocumentTemplateV1, EvalContext } from './types';
export type PreviewInteraction = {
    selectedId?: string | null;
    onElementPointerDown?: (id: string, e: React.PointerEvent) => void;
    onElementClick?: (id: string) => void;
    onLineEndpointPointerDown?: (id: string, endpoint: 'start' | 'end', e: React.PointerEvent) => void;
    alignmentGuidesPt?: {
        xPts: number[];
        yPts: number[];
    };
    spacingGuidesPt?: {
        lines: Array<{
            x1Pt: number;
            y1Pt: number;
            x2Pt: number;
            y2Pt: number;
            label: string;
        }>;
    };
    onElementResizePointerDown?: (id: string, handle: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw', e: React.PointerEvent) => void;
};
export declare function DocumentPreview({ template, ctx, assetResolver, className, interaction, }: {
    template: DocumentTemplateV1;
    ctx: EvalContext;
    assetResolver?: AssetResolver;
    className?: string;
    interaction?: PreviewInteraction;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=render.d.ts.map