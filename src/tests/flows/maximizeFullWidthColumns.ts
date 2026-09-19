{
    function initFeature(configure: (config: Config) => void = () => {}) {
        const config = getDefaultConfig();
        config.maximizeFullWidthColumns = true;
        config.forceTilingForMaximizedWindows = true;
        config.presetWidths = "50%, 100%";
        configure(config);
        const result = init(config);
        const halfWidth = Math.floor((tilingArea.width + config.gapsInnerHorizontal) * 0.5 - config.gapsInnerHorizontal);
        const getColumn = (client: MockKwinClient) => getClientManager(result.world).findTiledWindow(client)!.column;
        return { ...result, config, halfWidth, getColumn };
    }

    function assertMaximized(client: MockKwinClient, column: Column) {
        Assert.equal(client.maximizeMode, MaximizedMode.Maximized);
        Assert.equalRects(client.getActualFrameGeometry(), screen);
        Assert.equal(column.getWidth(), tilingArea.width);
    }

    function assertTiled(client: MockKwinClient, column: Column, width: number) {
        Assert.equal(client.maximizeMode, MaximizedMode.Unmaximized);
        Assert.equal(column.getWidth(), width);
        Assert.equal(client.getActualFrameGeometry().width, width);
    }

    tests.register("Maximize full width: cycling preset widths", 20, () => {
        const { qtMock, workspaceMock, halfWidth, getColumn } = initFeature();
        const [client] = workspaceMock.createClientsWithWidths(halfWidth);
        assertTiled(client, getColumn(client), halfWidth);

        qtMock.fireShortcut("karousel-cycle-preset-widths");
        assertMaximized(client, getColumn(client));

        qtMock.fireShortcut("karousel-cycle-preset-widths");
        assertTiled(client, getColumn(client), halfWidth);

        qtMock.fireShortcut("karousel-cycle-preset-widths-reverse");
        assertMaximized(client, getColumn(client));

        qtMock.fireShortcut("karousel-cycle-preset-widths-reverse");
        assertTiled(client, getColumn(client), halfWidth);
    });

    tests.register("Maximize full width: manual maximize and unmaximize", 20, () => {
        const { workspaceMock, halfWidth, getColumn } = initFeature();
        const [client] = workspaceMock.createClientsWithWidths(300);
        assertTiled(client, getColumn(client), 300);

        client.setMaximize(true, true);
        assertMaximized(client, getColumn(client));

        client.setMaximize(false, false);
        assertTiled(client, getColumn(client), 300);
    });

    tests.register("Maximize full width: unmaximize without previous width", 20, () => {
        const { workspaceMock, halfWidth, getColumn } = initFeature(config => { config.defaultColumnWidth = "40%"; });
        const client = new MockKwinClient(new MockQmlRect(10, 20, 300, 200));
        client.setMaximize(true, true);
        workspaceMock.createWindows(client);
        assertMaximized(client, getColumn(client));

        client.setMaximize(false, false);
        const defaultWidth = Math.floor((tilingArea.width + getDefaultConfig().gapsInnerHorizontal) * 0.4 - getDefaultConfig().gapsInnerHorizontal);
        assertTiled(client, getColumn(client), defaultWidth);
    });

    tests.register("Maximize full width: invalid default width", 20, () => {
        const originalConsoleLog = console.log;
        console.log = () => {}; // the parse error is expected, don't spam the output
        let result;
        try {
            result = initFeature(config => { config.defaultColumnWidth = "abc"; });
        } finally {
            console.log = originalConsoleLog;
        }
        const { workspaceMock, halfWidth, getColumn } = result;
        const client = new MockKwinClient(new MockQmlRect(10, 20, 300, 200));
        client.setMaximize(true, true);
        workspaceMock.createWindows(client);
        client.setMaximize(false, false);
        assertTiled(client, getColumn(client), halfWidth);
    });

    tests.register("Maximize full width: new full-width window", 20, () => {
        const { workspaceMock, getColumn } = initFeature();
        const [client] = workspaceMock.createClientsWithWidths(tilingArea.width);
        assertMaximized(client, getColumn(client));
    });

    tests.register("Maximize full width: window left alone in full-width column", 20, () => {
        const { qtMock, workspaceMock, halfWidth, getColumn } = initFeature();
        const [a, b] = workspaceMock.createClientsWithWidths(halfWidth, halfWidth);
        qtMock.fireShortcut("karousel-window-move-left");
        Assert.equal(getColumn(a), getColumn(b));
        qtMock.fireShortcut("karousel-cycle-preset-widths");
        Assert.equal(getColumn(a).getWidth(), tilingArea.width);
        Assert.equal(b.maximizeMode, MaximizedMode.Unmaximized, { message: "stacked windows must not be maximized" });

        workspaceMock.activeWindow = a;
        qtMock.fireShortcut("karousel-window-move-right");
        Assert.assert(getColumn(a) !== getColumn(b));
        assertMaximized(a, getColumn(a));
    });

    for (const reMaximize of [false, true]) {
        tests.register(`Maximize full width: focus change (reMaximize=${reMaximize})`, 20, () => {
            const { qtMock, workspaceMock, halfWidth, getColumn } = initFeature(config => { config.reMaximize = reMaximize; });
            const [a, b] = workspaceMock.createClientsWithWidths(halfWidth, halfWidth);
            qtMock.fireShortcut("karousel-cycle-preset-widths");
            assertMaximized(b, getColumn(b));

            workspaceMock.activeWindow = a;
            Assert.equal(b.maximizeMode, MaximizedMode.Unmaximized);
            Assert.equal(getColumn(b).getWidth(), tilingArea.width, { message: "column stays 100% wide" });

            workspaceMock.activeWindow = b;
            if (reMaximize) {
                assertMaximized(b, getColumn(b));
            } else {
                assertTiled(b, getColumn(b), tilingArea.width);
            }
        });
    }

    tests.register("Maximize full width: disabled", 20, () => {
        const { qtMock, workspaceMock, halfWidth, getColumn } = initFeature(config => { config.maximizeFullWidthColumns = false; });
        const [client] = workspaceMock.createClientsWithWidths(halfWidth);
        qtMock.fireShortcut("karousel-cycle-preset-widths");
        assertTiled(client, getColumn(client), tilingArea.width);
    });
}
