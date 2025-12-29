import type { PageOrientation, PageSize } from './types';
export declare function getPageSizePt(size: PageSize, orientation: PageOrientation): {
    wPt: number;
    hPt: number;
};
export declare function ptToPx(pt: number): number;
export declare function pxToPt(px: number): number;
export declare function clampNumber(value: number, min: number, max: number): number;
//# sourceMappingURL=units.d.ts.map