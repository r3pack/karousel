interface LayoutConfig {
    gapsInnerHorizontal: number;
    gapsInnerVertical: number;
    stackOffsetX: number;
    stackOffsetY: number;
    offScreenOpacity: number;
    stackColumnsByDefault: boolean;
    resizeNeighborColumn: boolean;
    forceTilingForMaximizedWindows: boolean;
    maximizeFullWidthColumns: boolean;
    roundWidthToPreset: boolean;
    getPresetWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number[];
    getIndexedPresetWidths: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number[];
    getDefaultColumnWidth: (minWidth: number, maxWidth: number, tilingAreaWidth: number) => number;
    reMaximize: boolean;
    skipSwitcher: boolean;
    tiledKeepBelow: boolean;
    maximizedKeepAbove: boolean;
    untileOnDrag: boolean;
}
