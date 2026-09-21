class Column {
    public grid: Grid;
    public gridX: number;
    private width: number; // TODO: increase column width to contain transients
    private preset: number|"full"|null; // the preset (index) that `width` corresponds to, kept when the tiling area changes
    private readonly windows: LinkedList<Window>;
    private stacked: boolean;
    private focusTaker: Window|null;
    private syncingMaximized: boolean;
    private static readonly minWidth = 40;

    constructor(grid: Grid, leftColumn: Column|null) {
        this.gridX = 0;
        this.width = 0;
        this.preset = null;
        this.windows = new LinkedList();
        this.stacked = grid.config.stackColumnsByDefault;
        this.focusTaker = null;
        this.syncingMaximized = false;
        this.grid = grid;
        this.grid.onColumnAdded(this, leftColumn);
    }

    public moveToGrid(targetGrid: Grid, leftColumn: Column|null) {
        if (targetGrid === this.grid) {
            this.grid.moveColumn(this, leftColumn);
        } else {
            this.grid.onColumnRemoved(this, this.isFocused() ? FocusPassing.Type.Immediate : FocusPassing.Type.None);
            this.grid = targetGrid;
            targetGrid.onColumnAdded(this, leftColumn);
            for (const window of this.windows.iterator()) {
                window.client.kwinClient.desktops = [targetGrid.desktop.kwinDesktop];
            }
        }
    }

    public isToTheLeftOf(other: Column) {
        return this.gridX < other.gridX;
    }

    public isToTheRightOf(other: Column) {
        return this.gridX > other.gridX;
    }

    public moveWindowUp(window: Window) {
        this.windows.moveBack(window);
        this.grid.desktop.onLayoutChanged();
    }

    public moveWindowDown(window: Window) {
        this.windows.moveForward(window);
        this.grid.desktop.onLayoutChanged();
    }

    public getWindowCount() {
        return this.windows.length();
    }

    public isEmpty() {
        return this.getWindowCount() === 0;
    }

    public getFirstWindow(): Window {
        return this.windows.getFirst()!;
    }

    public getLastWindow(): Window {
        return this.windows.getLast()!;
    }

    public getAboveWindow(window: Window) {
        return this.windows.getPrev(window);
    }

    public getBelowWindow(window: Window) {
        return this.windows.getNext(window);
    }

    public getWidth() {
        if (this.isMaximizedHorizontally()) {
            // occupy the whole tiling area, so that the maximized window can be placed in the column's slot
            return this.getFullWidth();
        }
        return this.width;
    }

    public hasMaximizedWindow() {
        for (const window of this.windows.iterator()) {
            if (window.isMaximized()) {
                return true;
            }
        }
        return false;
    }

    private isMaximizedHorizontally() {
        for (const window of this.windows.iterator()) {
            if (window.isMaximizedHorizontally()) {
                return true;
            }
        }
        return false;
    }

    public getMinWidth() {
        let maxMinWidth = Column.minWidth;
        for (const window of this.windows.iterator()) {
            const minWidth = window.client.kwinClient.minSize.width.ceil();
            if (minWidth > maxMinWidth) {
                maxMinWidth = minWidth;
            }
        }
        return Math.min(maxMinWidth, this.grid.desktop.tilingArea.width); // min width mustn't exceed tilingArea width
    }

    public getMaxWidth() {
        let minMaxWidth = this.grid.desktop.tilingArea.width;
        for (const window of this.windows.iterator()) {
            const maxWidth = window.client.kwinClient.maxSize.width.floor();
            if (maxWidth < minMaxWidth) {
                minMaxWidth = maxWidth;
            }
        }
        return Math.max(minMaxWidth, this.getMinWidth()); // max width mustn't be lower than min width
    }

    public setWidth(width: number, setPreferred: boolean) {
        width = clamp(width, this.getMinWidth(), this.getMaxWidth());
        if (!this.grid.isUserResizing()) {
            width = this.roundToPreset(width);
        }
        this.preset = this.findPreset(width);
        if (!this.isFullWidthValue(width)) {
            for (const window of this.windows.iterator()) {
                window.restoreWidth = width;
            }
        }
        if (width === this.width) {
            this.syncMaximized();
            return;
        }

        this.width = width;
        if (setPreferred) {
            for (const window of this.windows.iterator()) {
                window.client.preferredWidth = width;
            }
        }
        this.grid.onColumnWidthChanged(this);
        this.syncMaximized();
    }

    // same as the "100%" preset width
    public getFullWidth() {
        return Math.floor(this.grid.desktop.tilingArea.width);
    }

    // with `roundWidthToPreset`, returns the preset width nearest to `width`
    private roundToPreset(width: number) {
        if (!this.grid.config.roundWidthToPreset) {
            return width;
        }
        const presetWidths = this.grid.config.getPresetWidths(this.getMinWidth(), this.getMaxWidth(), this.grid.desktop.tilingArea.width);
        if (presetWidths.length === 0) {
            return width;
        }
        if (this.isFullWidthValue(width)) {
            return this.getFullWidth(); // keep maximized windows and 100%-width columns
        }
        let nearestWidth = presetWidths[0];
        for (const presetWidth of presetWidths) {
            if (Math.abs(presetWidth - width) <= Math.abs(nearestWidth - width)) {
                nearestWidth = presetWidth; // ascending order, so ties go to the larger width
            }
        }
        return nearestWidth;
    }

    private findPreset(width: number): number|"full"|null {
        const tolerance = 1; // Kwin may round window sizes by 1px with fractional scaling
        const presetWidths = this.grid.config.getIndexedPresetWidths(this.getMinWidth(), this.getMaxWidth(), this.grid.desktop.tilingArea.width);
        const matches = (index: number) => Math.abs(presetWidths[index] - width) <= tolerance;
        if (typeof this.preset === "number" && matches(this.preset)) {
            return this.preset; // several presets can have the same width (e.g. clamped by the min width), keep the current one
        }
        if (this.isFullWidthValue(width)) {
            return "full";
        }
        const index = presetWidths.findIndex((_, i) => matches(i));
        return index >= 0 ? index : null;
    }

    // if the width corresponds to a preset, re-applies that preset (e.g. after the tiling area has changed)
    public applyPreset() {
        if (this.preset === null) {
            return false;
        }
        const width = this.preset === "full" ?
            this.getFullWidth() :
            this.grid.config.getIndexedPresetWidths(this.getMinWidth(), this.getMaxWidth(), this.grid.desktop.tilingArea.width)[this.preset];
        this.setWidth(width, false);
        return true;
    }

    public snapToPreset() {
        this.setWidth(this.width, true);
    }

    public isFullWidth() {
        return this.isFullWidthValue(this.width);
    }

    private isFullWidthValue(width: number) {
        // tolerate rounding, tilingArea can have a fractional width with fractional scaling
        return width >= this.grid.desktop.tilingArea.width - 1;
    }

    // with `maximizeFullWidthColumns`, a focused window alone in a 100%-width column is maximized, and vice versa
    public syncMaximized() {
        if (!this.grid.config.maximizeFullWidthColumns || this.syncingMaximized || this.windows.length() !== 1) {
            return;
        }
        const window = this.windows.getFirst()!;
        const kwinClient = window.client.kwinClient;
        if (!window.ready || !kwinClient.maximizable || kwinClient.fullScreen) {
            return;
        }
        const fullWidth = this.isFullWidth();
        if (fullWidth === window.isFullyMaximized()) {
            window.pendingMaximizedSync = false;
            return;
        }
        if (!window.isFocused()) {
            window.pendingMaximizedSync = true; // sync when focused
            return;
        }
        window.pendingMaximizedSync = false;
        this.syncingMaximized = true;
        window.client.setMaximize(fullWidth, fullWidth);
        this.syncingMaximized = false;
    }

    public adjustWidth(widthDelta: number, setPreferred: boolean) {
        this.setWidth(this.width + widthDelta, setPreferred);
    }

    public updateWidth() {
        let minErr = Infinity;
        let closestPreferredWidth = this.width;
        for (const window of this.windows.iterator()) {
            const err = Math.abs(window.client.preferredWidth - this.width);
            if (err < minErr) {
                minErr = err;
                closestPreferredWidth = window.client.preferredWidth;
            }
        }
        this.setWidth(closestPreferredWidth, false);
    }

    // returns x position of left edge in grid space
    public getLeft() {
        return this.gridX;
    }

    // returns x position of right edge in grid space
    public getRight() {
        return this.gridX + this.getWidth();
    }

    public onUserResizeWidth(
        startWidth: number,
        currentDelta: number,
        resizingLeftSide: boolean,
        neighbor?: { column: Column, startWidth: number },
    ) {
        const oldColumnWidth = this.getWidth();
        this.setWidth(startWidth + currentDelta, true);
        const actualDelta = this.getWidth() - startWidth;

        let leftEdgeDeltaStep = resizingLeftSide ? oldColumnWidth - this.getWidth() : 0;
        if (neighbor !== undefined) {
            const oldNeighborWidth = neighbor.column.getWidth();
            neighbor.column.setWidth(neighbor.startWidth - actualDelta, true);
            if (resizingLeftSide) {
                leftEdgeDeltaStep -= neighbor.column.getWidth() - oldNeighborWidth;
            }
        }
        this.grid.desktop.adjustScroll(-leftEdgeDeltaStep, true);
    }

    public adjustWindowHeight(window: Window, heightDelta: number, top: boolean) {
        const otherWindow = top ? this.windows.getPrev(window) : this.windows.getNext(window);
        if (otherWindow === null) {
            return;
        }

        window.height += heightDelta;
        otherWindow.height -= heightDelta;

        this.grid.desktop.onLayoutChanged();
    }

    public resizeWindows() {
        const nWindows = this.windows.length();
        if (nWindows === 0) {
            return;
        }
        if (nWindows === 1) {
            this.stacked = this.grid.config.stackColumnsByDefault;
        }

        let remainingPixels = this.grid.desktop.tilingArea.height - (nWindows-1) * this.grid.config.gapsInnerVertical;
        let remainingWindows = nWindows;
        for (const window of this.windows.iterator()) {
            const windowHeight = Math.round(remainingPixels / remainingWindows);
            window.height = windowHeight;
            remainingPixels -= windowHeight;
            remainingWindows--;
        }
        // TODO: respect min height

        this.grid.desktop.onLayoutChanged();
    }

    public getFocusTaker() {
        if (this.focusTaker === null || !this.windows.contains(this.focusTaker)) {
            return null;
        }
        return this.focusTaker;
    }

    public getWindowToFocus() {
        return this.getFocusTaker() ?? this.windows.getFirst()!;
    }

    public isFocused() {
        const lastFocusedWindow = this.grid.getLastFocusedWindow();
        if (lastFocusedWindow === null) {
            return false;
        }
        return lastFocusedWindow.column === this && lastFocusedWindow.isFocused();
    }

    public arrange(x: number, visibleRange: Range, forceOpaque: boolean) {
        if (this.grid.config.offScreenOpacity < 1.0 && !forceOpaque) {
            const opacity = Range.contains(visibleRange, this) ? 100 : this.grid.config.offScreenOpacity;
            for (const window of this.windows.iterator()) {
                window.client.kwinClient.opacity = opacity;
            }
        }

        if (this.stacked && this.windows.length() >= 2) {
            this.arrangeStacked(x);
            return;
        }
        let y = this.grid.desktop.tilingArea.y;
        for (const window of this.windows.iterator()) {
            window.arrange(x, y, this.getWidth(), window.height);
            y += window.height + this.grid.config.gapsInnerVertical;
        }
    }

    public arrangeStacked(x: number) {
        const nWindows = this.windows.length();
        const windowWidth = this.getWidth() - (nWindows - 1) * this.grid.config.stackOffsetX;
        const windowHeight = this.grid.desktop.tilingArea.height - (nWindows - 1) * this.grid.config.stackOffsetY;

        let windowX = x;
        let windowY = this.grid.desktop.tilingArea.y;
        for (const window of this.windows.iterator()) {
            window.arrange(windowX, windowY, windowWidth, windowHeight);
            windowX += this.grid.config.stackOffsetX;
            windowY += this.grid.config.stackOffsetY;
        }

        this.arrangeZ();
    }

    public arrangeZ() {
        for (const window of this.windows.iterator()) {
            if (window === this.focusTaker) {
                break;
            }
            window.raise();
        }
        for (const window of this.windows.iteratorReverse()) {
            window.raise();
            if (window === this.focusTaker) {
                break;
            }
        }
    }

    public toggleStacked() {
        if (this.windows.length() < 2) {
            return;
        }
        this.stacked = !this.stacked;
        this.grid.desktop.onLayoutChanged();
    }

    public onWindowAdded(window: Window, bottom: boolean) {
        if (bottom) {
            this.windows.insertEnd(window);
        } else {
            this.windows.insertStart(window);
        }

        if (this.width === 0) {
            this.setWidth(window.client.preferredWidth, false);
        } else {
            this.setWidth(this.width, false); // re-apply width constraints of the new window
        }

        if (window.isMaximizedHorizontally()) {
            this.grid.onColumnMaximizedChanged(this); // effective width changed
        }

        this.resizeWindows();

        if (window.isFocused()) {
            this.onWindowFocused(window);
        }

        this.grid.desktop.onLayoutChanged();
    }

    public onWindowRemoved(window: Window, passFocus: FocusPassing.Type) {
        const lastWindow = this.windows.length() === 1;
        const windowToFocus = this.getAboveWindow(window) ?? this.getBelowWindow(window);

        this.windows.remove(window);

        if (window === this.focusTaker) {
            this.focusTaker = windowToFocus;
        }

        if (lastWindow) {
            console.assert(this.isEmpty());
            this.destroy(passFocus);
        } else {
            if (window.isMaximizedHorizontally()) {
                this.grid.onColumnMaximizedChanged(this); // effective width changed
            }
            this.resizeWindows();
            this.syncMaximized();
            if (windowToFocus !== null) {
                switch (passFocus) {
                case FocusPassing.Type.Immediate:
                    windowToFocus.focus();
                    break;
                case FocusPassing.Type.OnUnfocus:
                    this.grid.focusPasser.request(windowToFocus.client.kwinClient);
                    break;
                }
            }
        }

        this.grid.desktop.onLayoutChanged();
    }

    public onWindowMaximizedChanged() {
        this.grid.onColumnMaximizedChanged(this);
    }

    public onWindowFocused(window: Window) {
        this.grid.onColumnFocused(this, window);
        this.focusTaker = window;
        if (this.stacked) {
            this.arrangeZ();
        }
    }

    public restoreToTiled(focusedWindow: Window) {
        const lastFocusedWindow = this.getFocusTaker();
        if (lastFocusedWindow !== null && lastFocusedWindow !== focusedWindow) {
            lastFocusedWindow.restoreToTiled();
        }
    }

    private destroy(passFocus: FocusPassing.Type) {
        this.grid.onColumnRemoved(this, passFocus);
    }
}
