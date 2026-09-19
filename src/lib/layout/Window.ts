class Window {
    public column: Column;
    public readonly client: ClientWrapper;
    public height: number;
    public readonly focusedState: Window.State;
    private skipArrange: boolean;
    public restoreWidth: number | undefined; // last column width below 100%, restored after manual unmaximization
    private wasFullyMaximized: boolean;
    public pendingMaximizedSync: boolean;
    public ready: boolean; // whether signals of the client are handled, so it's safe to change its state

    constructor(client: ClientWrapper, column: Column) {
        this.client = client;
        this.height = client.kwinClient.frameGeometry.height.round();

        let maximizedMode = this.client.getMaximizedMode();
        if (maximizedMode === undefined) {
            maximizedMode = MaximizedMode.Unmaximized; // defaulting to unmaximized, as this is set in Tiled.prepareClientForTiling
        }
        this.focusedState = {
            fullScreen: this.client.kwinClient.fullScreen,
            maximizedMode: maximizedMode,
        };

        this.skipArrange = this.client.kwinClient.fullScreen || maximizedMode !== MaximizedMode.Unmaximized;
        this.restoreWidth = undefined;
        this.wasFullyMaximized = this.isFullyMaximized();
        this.ready = false;
        this.pendingMaximizedSync = false;
        this.column = column;
        column.onWindowAdded(this, true);
        if (column.grid.config.maximizeFullWidthColumns && this.wasFullyMaximized) {
            column.setWidth(column.getFullWidth(), false);
        }
    }

    public onReady() {
        this.ready = true;
        this.column.syncMaximized();
    }

    public moveToColumn(targetColumn: Column, bottom: boolean, passFocus: FocusPassing.Type) {
        if (targetColumn === this.column) {
            return;
        }
        this.column.onWindowRemoved(this, passFocus);
        this.column = targetColumn;
        targetColumn.onWindowAdded(this, bottom);
    }

    public arrange(x: number, y: number, width: number, height: number) {
        if (this.skipArrange) {
            // window is maximized or fullscreen, only move it to its column's slot,
            // so that its horizontal position reflects the column order (e.g. for task manager sorting)
            this.moveMaximized(x);
            return;
        }

        let maximized = false;
        if (this.column.grid.config.reMaximize && this.isFocused()) {
            // do this here rather than in `onFocused` to ensure it happens after placement
            // (otherwise placement may not happen at all)
            if (this.focusedState.maximizedMode !== MaximizedMode.Unmaximized) {
                this.client.setMaximize(
                    this.focusedState.maximizedMode === MaximizedMode.Horizontally || this.focusedState.maximizedMode === MaximizedMode.Maximized,
                    this.focusedState.maximizedMode === MaximizedMode.Vertically || this.focusedState.maximizedMode === MaximizedMode.Maximized,
                );
                maximized = true;
            }
            if (this.focusedState.fullScreen) {
                this.client.setFullScreen(true);
                maximized = true;
            }
        }
        if (!maximized) {
            this.client.place(x, y, width, height);
        }
    }

    private moveMaximized(x: number) {
        const kwinClient = this.client.kwinClient;
        if (kwinClient.maximizeMode !== undefined && kwinClient.maximizeMode !== this.client.getMaximizedMode()) {
            // Kwin hasn't finished (un)maximizing yet, moving now would cancel it
            // (the window is re-arranged on `maximizedChanged`)
            return;
        }
        if (this.isMaximizedHorizontally()) {
            const desktop = this.column.grid.desktop;
            const homeArea = Workspace.clientArea(
                kwinClient.fullScreen ? ClientAreaOption.FullScreenArea : ClientAreaOption.MaximizeArea,
                kwinClient.output,
                desktop.kwinDesktop,
            );
            let targetX = homeArea.x + x - desktop.tilingArea.x;
            if (Math.abs(targetX - homeArea.x) < 2) {
                targetX = homeArea.x; // ignore rounding errors of fractional tiling area width
            }
            this.client.moveX(targetX);
        } else {
            this.client.moveX(x);
        }
    }

    public isFullyMaximized() {
        return !this.client.kwinClient.fullScreen && this.client.getMaximizedMode() === MaximizedMode.Maximized;
    }

    public isMaximized() {
        return this.client.kwinClient.fullScreen || this.client.getMaximizedMode() !== MaximizedMode.Unmaximized;
    }

    // maximized windows must always have a column of their own
    public canShareColumn(targetColumn: Column) {
        if (targetColumn === this.column) {
            return true;
        }
        return !this.isMaximized() && !targetColumn.hasMaximizedWindow();
    }

    private ensureOwnColumnIfMaximized() {
        if (this.isMaximized() && this.column.getWindowCount() > 1) {
            const passFocus = FocusPassing.Type.None;
            this.moveToColumn(new Column(this.column.grid, this.column), true, passFocus);
        }
    }

    public isMaximizedHorizontally() {
        const maximizedMode = this.client.getMaximizedMode();
        return this.client.kwinClient.fullScreen ||
            maximizedMode === MaximizedMode.Horizontally ||
            maximizedMode === MaximizedMode.Maximized;
    }

    public focus() {
        this.client.focus();
        const kwinClient = this.client.kwinClient;
        if (!this.isFocused()) {
            // in some situations focus assignment just doesn't work, let's do it later
            this.column.grid.focusPasser.request(kwinClient);
        }
    }

    public isFocused() {
        return this.client.isFocused();
    }

    public onFocused() {
        if (this.column.grid.config.reMaximize && (
            this.focusedState.maximizedMode !== MaximizedMode.Unmaximized ||
            this.focusedState.fullScreen
        )) {
            // We need to maximize/fullscreen this window, but we can't do it here.
            // We need to do it in `arrange` to ensure it happens after placement.
            this.column.grid.desktop.forceArrange();
        }
        this.column.onWindowFocused(this);
        if (this.pendingMaximizedSync) {
            this.column.syncMaximized();
        }
    }

    public raise() {
        this.client.raise();
    }

    public restoreToTiled() {
        if (this.isFocused()) {
            return;
        }
        this.client.setFullScreen(false);
        this.client.setMaximize(false, false);
    }

    public onMaximizedChanged(maximizedMode: MaximizedMode) {
        const maximized = this.client.kwinClient.fullScreen || maximizedMode !== MaximizedMode.Unmaximized;
        this.skipArrange = maximized;
        if (this.column.grid.config.tiledKeepBelow) {
            this.client.kwinClient.keepBelow = !maximized;
        }
        if (this.column.grid.config.maximizedKeepAbove) {
            this.client.kwinClient.keepAbove = maximized;
        }
        if (this.isFocused()) {
            this.focusedState.maximizedMode = maximizedMode;
        }
        this.ensureOwnColumnIfMaximized();
        if (this.column.grid.config.maximizeFullWidthColumns) {
            this.syncWidthWithMaximized(maximizedMode);
        }
        this.column.onWindowMaximizedChanged();
    }

    // maximized windows are treated as 100%-width columns
    private syncWidthWithMaximized(maximizedMode: MaximizedMode) {
        const fullyMaximized = maximizedMode === MaximizedMode.Maximized && !this.client.kwinClient.fullScreen;
        const column = this.column;
        const tilingAreaWidth = column.grid.desktop.tilingArea.width;
        if (fullyMaximized) {
            column.setWidth(column.getFullWidth(), false);
        } else if (this.wasFullyMaximized && maximizedMode === MaximizedMode.Unmaximized && !this.client.isManipulatingGeometry(null)) {
            // unmaximized by the user (not by Karousel), restore the previous width
            const width = this.restoreWidth ?? column.grid.config.getDefaultColumnWidth(column.getMinWidth(), column.getMaxWidth(), tilingAreaWidth);
            column.setWidth(width, true);
        }
        this.wasFullyMaximized = fullyMaximized;
    }

    public onFullScreenChanged(fullScreen: boolean) {
        this.skipArrange = fullScreen;
        if (this.column.grid.config.tiledKeepBelow) {
            this.client.kwinClient.keepBelow = !fullScreen;
        }
        if (this.column.grid.config.maximizedKeepAbove) {
            this.client.kwinClient.keepAbove = fullScreen;
        }
        if (this.isFocused()) {
            this.focusedState.fullScreen = fullScreen;
        }
        this.ensureOwnColumnIfMaximized();
        this.column.onWindowMaximizedChanged();
    }

    public onFrameGeometryChanged() {
        const newGeometry = this.client.kwinClient.frameGeometry;
        this.column.setWidth(newGeometry.width.round(), true);
        this.column.grid.desktop.onLayoutChanged();
    }

    public destroy(passFocus: FocusPassing.Type) {
        this.column.onWindowRemoved(this, passFocus);
    }
}

namespace Window {
    export interface State {
        fullScreen: boolean;
        maximizedMode: MaximizedMode;
    }
}
