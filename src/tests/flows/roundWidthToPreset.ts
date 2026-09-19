{
    function initRounding(configure: (config: Config) => void = () => {}) {
        const config = getDefaultConfig();
        config.roundWidthToPreset = true;
        config.presetWidths = "25%, 50%, 100%";
        configure(config);
        const result = init(config);
        const preset = (ratio: number) => Math.floor((tilingArea.width + config.gapsInnerHorizontal) * ratio - config.gapsInnerHorizontal);
        const getColumn = (client: MockKwinClient) => getClientManager(result.world).findTiledWindow(client)!.column;
        return { ...result, config, preset, getColumn };
    }

    function assertWidth(client: MockKwinClient, column: Column, width: number) {
        Assert.equal(column.getWidth(), width);
        Assert.equal(client.getActualFrameGeometry().width, width);
    }

    tests.register("Round width: new window", 20, () => {
        const { workspaceMock, preset, getColumn } = initRounding();
        const [a, b] = workspaceMock.createClientsWithWidths(preset(0.25) + 20, preset(0.5) - 30);
        assertWidth(a, getColumn(a), preset(0.25));
        assertWidth(b, getColumn(b), preset(0.5));
    });

    tests.register("Round width: window resizes itself", 20, () => {
        const { workspaceMock, preset, getColumn } = initRounding();
        const [client] = workspaceMock.createClientsWithWidths(preset(0.25));
        const frame = client.getActualFrameGeometry();
        client.frameGeometry = new MockQmlRect(frame.x, frame.y, preset(0.5) - 40, frame.height);
        assertWidth(client, getColumn(client), preset(0.5));
    });

    tests.register("Round width: Kwin rounding by 1px", 20, () => {
        const { workspaceMock, preset, getColumn } = initRounding();
        const [client] = workspaceMock.createClientsWithWidths(preset(0.5));
        const frame = client.getActualFrameGeometry();
        client.frameGeometry = new MockQmlRect(frame.x, frame.y, preset(0.5) + 1, frame.height);
        Assert.equal(getColumn(client).getWidth(), preset(0.5));
    });

    tests.register("Round width: user resize snaps on release", 20, () => {
        const { workspaceMock, preset, getColumn } = initRounding();
        const [client] = workspaceMock.createClientsWithWidths(preset(0.25));
        workspaceMock.resizeWindow(client, false, false, false, new MockQmlSize(50, 0), new MockQmlSize(60, 0));
        assertWidth(client, getColumn(client), preset(0.5));

        workspaceMock.resizeWindow(client, false, false, false, new MockQmlSize(-30, 0));
        assertWidth(client, getColumn(client), preset(0.5));
    });

    tests.register("Round width: increase and decrease step through presets", 20, () => {
        const { qtMock, workspaceMock, preset, getColumn } = initRounding();
        const [client] = workspaceMock.createClientsWithWidths(preset(0.25));

        qtMock.fireShortcut("karousel-column-width-increase");
        assertWidth(client, getColumn(client), preset(0.5));
        qtMock.fireShortcut("karousel-column-width-increase");
        Assert.equal(getColumn(client).getWidth(), tilingArea.width);
        qtMock.fireShortcut("karousel-column-width-increase");
        Assert.equal(getColumn(client).getWidth(), tilingArea.width, { message: "no wrap-around" });

        qtMock.fireShortcut("karousel-column-width-decrease");
        assertWidth(client, getColumn(client), preset(0.5));
        qtMock.fireShortcut("karousel-column-width-decrease");
        assertWidth(client, getColumn(client), preset(0.25));
        qtMock.fireShortcut("karousel-column-width-decrease");
        assertWidth(client, getColumn(client), preset(0.25));
    });

    tests.register("Round width: equalize", 20, () => {
        const { qtMock, workspaceMock, preset, getColumn } = initRounding();
        const clients = workspaceMock.createClientsWithWidths(preset(0.25), preset(0.25), preset(0.25));
        qtMock.fireShortcut("karousel-columns-width-equalize");
        const presets = [preset(0.25), preset(0.5), tilingArea.width];
        for (const client of clients) {
            Assert.assert(presets.includes(getColumn(client).getWidth()), { message: `width ${getColumn(client).getWidth()} is not a preset` });
        }
    });

    tests.register("Round width: full width without 100% preset", 20, () => {
        const { workspaceMock, getColumn } = initRounding(config => {
            config.presetWidths = "25%, 50%";
            config.maximizeFullWidthColumns = true;
        });
        const [client] = workspaceMock.createClientsWithWidths(300);
        client.setMaximize(true, true);
        Assert.equal(client.maximizeMode, MaximizedMode.Maximized);
        Assert.equal(getColumn(client).getWidth(), tilingArea.width);
    });

    tests.register("Round width: disabled", 20, () => {
        const { workspaceMock, getColumn } = initRounding(config => { config.roundWidthToPreset = false; });
        const [client] = workspaceMock.createClientsWithWidths(333);
        assertWidth(client, getColumn(client), 333);
    });
}
