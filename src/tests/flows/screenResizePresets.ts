{
    function initPresets(roundWidthToPreset: boolean, presetWidths = "25%, 50%, 100%", configure: (config: Config) => void = () => {}) {
        const config = getDefaultConfig();
        config.roundWidthToPreset = roundWidthToPreset;
        config.presetWidths = presetWidths;
        configure(config);
        const result = init(config);
        const preset = (ratio: number, areaWidth: number) => Math.floor((areaWidth + config.gapsInnerHorizontal) * ratio - config.gapsInnerHorizontal);
        const areaOf = (screenWidth: number) => screenWidth - config.gapsOuterLeft - config.gapsOuterRight;
        const getWidth = (client: MockKwinClient) => getClientManager(result.world).findTiledWindow(client)!.column.getWidth();
        const resizeScreen = (width: number) => {
            screen = new MockQmlRect(0, 0, width, screen.height);
            result.workspaceMock.virtualScreenSizeChanged.fire();
            return areaOf(width);
        };
        return { ...result, preset, areaOf, getWidth, resizeScreen };
    }

    for (const roundWidthToPreset of [false, true]) {
        tests.register(`Screen resize keeps presets (roundWidthToPreset: ${roundWidthToPreset})`, 20, () => {
            const { workspaceMock, preset, getWidth, resizeScreen } = initPresets(roundWidthToPreset);
            const oldArea = tilingArea.width;
            const [quarter, half, full] = workspaceMock.createClientsWithWidths(preset(0.25, oldArea), preset(0.5, oldArea), oldArea);

            for (const screenWidth of [1600, 1000, 800]) {
                const area = resizeScreen(screenWidth);
                Assert.equal(getWidth(quarter), preset(0.25, area));
                Assert.equal(getWidth(half), preset(0.5, area));
                Assert.equal(getWidth(full), area);
                Assert.equal(half.getActualFrameGeometry().width, preset(0.5, area));
            }
        });
    }

    for (const roundWidthToPreset of [false, true]) {
        tests.register(`Screen resize ignores Kwin resizing windows (roundWidthToPreset: ${roundWidthToPreset})`, 20, () => {
            const { workspaceMock, preset, areaOf, getWidth } = initPresets(roundWidthToPreset, "50%, 83.33334%, 100%");

            // Kwin fits windows into the new screen before Karousel gets notified
            const changeScreen = (width: number, clientWidth: number) => {
                screen = new MockQmlRect(0, 0, width, screen.height);
                const frame = client.getActualFrameGeometry();
                client.frameGeometry = new MockQmlRect(0, frame.y, clientWidth, frame.height);
                workspaceMock.virtualScreenSizeChanged.fire();
            };

            const [client] = workspaceMock.createClientsWithWidths(preset(0.8333334, tilingArea.width));
            changeScreen(1600, preset(0.8333334, tilingArea.width));
            Assert.equal(getWidth(client), preset(0.8333334, areaOf(1600)));
            changeScreen(800, 800);
            Assert.equal(getWidth(client), preset(0.8333334, areaOf(800)));
            changeScreen(1600, 800);
            Assert.equal(getWidth(client), preset(0.8333334, areaOf(1600)));
        });
    }

    tests.register("Reconnecting a monitor keeps presets", 20, () => {
        const { workspaceMock, preset, getWidth, resizeScreen } = initPresets(true, "16.66666%, 50%, 83.33334%, 100%");
        const monitor = workspaceMock.activeScreen;
        const monitorArea = resizeScreen(1600);
        const [client] = workspaceMock.createClientsWithWidths(preset(0.8333334, monitorArea));
        const restoredFrame = client.getActualFrameGeometry();

        // Kwin replaces the disconnected monitor with a placeholder screen
        const placeholder: Output = { __brand: "Output" };
        workspaceMock.activeScreen = placeholder;
        client.output = placeholder;
        timeControl(addTime => {
            const placeholderArea = resizeScreen(1000);
            workspaceMock.screensChanged.fire();
            Assert.equal(getWidth(client), preset(0.8333334, placeholderArea));
            addTime(10000);

            // on reconnect, Kwin moves the window back to the monitor before emitting `screensChanged`
            workspaceMock.screenAreas.set(placeholder, new MockQmlRect(0, 0, 1000, screen.height)); // the placeholder is still there
            workspaceMock.activeScreen = monitor;
            screen = new MockQmlRect(0, 0, 1600, screen.height);
            client.output = monitor;
            client.frameGeometry = restoredFrame;
            workspaceMock.virtualScreenSizeChanged.fire();
            workspaceMock.screensChanged.fire();
            Assert.equal(getWidth(client), preset(0.8333334, monitorArea));
        });
    });

    tests.register("Kwin restoring the unmaximized state on another screen keeps 100% columns", 20, () => {
        const { qtMock, workspaceMock, preset, areaOf, getWidth } = initPresets(true, "16.66666%, 50%, 100%", config => {
            config.maximizeFullWidthColumns = true;
            config.forceTilingForMaximizedWindows = true;
        });
        const [client] = workspaceMock.createClientsWithWidths(preset(1/6, tilingArea.width));
        qtMock.fireShortcut("karousel-column-width-increase");
        qtMock.fireShortcut("karousel-column-width-increase");
        Assert.equal(client.maximizeMode, MaximizedMode.Maximized);

        timeControl(addTime => {
            for (const screenWidth of [1000, 800]) {
                addTime(10000);
                // Kwin restores the window's state saved for this screen setup before notifying us
                screen = new MockQmlRect(0, 0, screenWidth, screen.height);
                client.setMaximize(false, false);
                workspaceMock.virtualScreenSizeChanged.fire();
                workspaceMock.screensChanged.fire();
                Assert.equal(getWidth(client), areaOf(screenWidth));
                Assert.equal(client.maximizeMode, MaximizedMode.Maximized);
            }
        });
    });

    tests.register("Screen resize keeps preset clamped to full width by min width", 20, () => {
        const { workspaceMock, preset, getWidth, resizeScreen } = initPresets(false, "50%, 83.33334%, 100%");
        let area = resizeScreen(1600);
        const [client] = workspaceMock.createClientsWithWidths(preset(0.8333334, area));
        client.minSize = new MockQmlSize(1000, 100);
        area = resizeScreen(800);
        Assert.equal(getWidth(client), area);
        area = resizeScreen(1600);
        Assert.equal(getWidth(client), preset(0.8333334, area));
    });

    tests.register("Screen resize keeps non-preset width", 20, () => {
        const { workspaceMock, getWidth, resizeScreen } = initPresets(false);
        const [client] = workspaceMock.createClientsWithWidths(300);
        resizeScreen(1600);
        Assert.equal(getWidth(client), 300);
    });

    tests.register("Pinning keeps presets", 20, () => {
        const { workspaceMock, preset, areaOf, getWidth } = initPresets(false);
        const fullArea = tilingArea.width;
        const [pinned, client] = workspaceMock.createClientsWithWidths(100, preset(0.5, fullArea));

        pinned.pin(new MockQmlRect(0, 0, screen.width / 2, screen.height));
        Assert.equal(getWidth(client), preset(0.5, areaOf(screen.width / 2)));

        pinned.unpin();
        Assert.equal(getWidth(client), preset(0.5, fullArea));
    });
}
