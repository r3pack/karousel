for (const floatingAbove of [false, true]) {
    for (const reMaximize of [false, true]) {
        tests.register(`Force tiling allows real maximization (above=${floatingAbove}, reMaximize=${reMaximize})`, 20, () => {
            const config = getDefaultConfig();
            config.forceTilingForMaximizedWindows = true;
            config.reMaximize = reMaximize;
            config.tiledKeepBelow = !floatingAbove;
            config.floatingKeepAbove = floatingAbove;
            const { qtMock, workspaceMock, world } = init(config);
            qtMock.deferTimers = true;
            const [other, client] = workspaceMock.createClientsWithWidths(200, 300);
            const window = getClientManager(world).findTiledWindow(client)!;
            const original = client.getFrameGeometryCopy();
            for (const [vertical, horizontal] of [[true, true], [true, false], [false, true]]) {
                const expectedMode = (vertical ? MaximizedMode.Vertically : 0) | (horizontal ? MaximizedMode.Horizontally : 0);
                client.setMaximize(vertical, horizontal);
                qtMock.flushTimers();
                Assert.equal(client.maximizeMode, expectedMode);
                Assert.equal(window.client.getMaximizedMode(), expectedMode);
                Assert.equal(window.column.getWidth(), 300);
                const maximizedFrame = new MockQmlRect(
                    horizontal ? screen.x : original.x,
                    vertical ? screen.y : original.y,
                    horizontal ? screen.width : original.width,
                    vertical ? screen.height : original.height,
                );
                Assert.equalRects(client.getActualFrameGeometry(), maximizedFrame);
                Assert.equal(client.keepBelow, false);
                Assert.equal(client.keepAbove, floatingAbove);
                workspaceMock.activeWindow = other;
                workspaceMock.activeWindow = client;
                qtMock.flushTimers();
                Assert.equal(client.maximizeMode, reMaximize ? expectedMode : MaximizedMode.Unmaximized);
                Assert.equalRects(client.getActualFrameGeometry(), reMaximize ? maximizedFrame : original);
                client.setMaximize(false, false);
                qtMock.flushTimers();
                Assert.equal(client.maximizeMode, MaximizedMode.Unmaximized);
                Assert.equalRects(client.getActualFrameGeometry(), original);
            }
        });
    }
}

for (const startup of [false, true]) {
    tests.register(`Force tiling admits maximized windows (startup=${startup})`, 20, () => {
        const config = getDefaultConfig();
        config.forceTilingForMaximizedWindows = true;
        const { workspaceMock, world } = init(config);
        const client = new MockKwinClient(new MockQmlRect(10, 20, 300, 200));
        client.setMaximize(true, true);
        let currentWorld = world;
        if (startup) {
            world.destroy();
            workspaceMock.windows.push(client);
            currentWorld = new World(config);
        } else {
            workspaceMock.createWindows(client);
        }
        Assert.assert(getClientManager(currentWorld).findTiledWindow(client) !== null);
        Assert.equal(client.maximizeMode, MaximizedMode.Maximized);
        Assert.equalRects(client.getActualFrameGeometry(), screen);
        client.setMaximize(false, false);
        Assert.equal(client.getActualFrameGeometry().height, tilingArea.height);
    });
}

for (const enabled of [false, true]) {
    tests.register(`Force tiling floating maximize (enabled=${enabled})`, 20, () => {
        const config = getDefaultConfig();
        config.forceTilingForMaximizedWindows = enabled;
        const { qtMock, workspaceMock, world } = init(config);
        qtMock.deferTimers = true;
        const [client] = workspaceMock.createClientsWithWidths(300);
        const manager = getClientManager(world);
        for (const [vertical, horizontal] of [[true, true], [true, false], [false, true]]) {
            client.setMaximize(false, false);
            manager.floatKwinClient(client);
            const floatingFrame = client.getFrameGeometryCopy();
            client.setMaximize(vertical, horizontal);
            qtMock.flushTimers();
            const expectedMode = (vertical ? MaximizedMode.Vertically : 0) | (horizontal ? MaximizedMode.Horizontally : 0);
            Assert.equal(client.maximizeMode, expectedMode);
            Assert.equalRects(client.getActualFrameGeometry(), new MockQmlRect(
                horizontal ? screen.x : floatingFrame.x,
                vertical ? screen.y : floatingFrame.y,
                horizontal ? screen.width : floatingFrame.width,
                vertical ? screen.height : floatingFrame.height,
            ));
            Assert.equal(manager.findTiledWindow(client) !== null, enabled);
            client.setMaximize(false, false);
            if (enabled) {
                Assert.equal(manager.findTiledWindow(client)!.column.getWidth(), 300);
                Assert.centered(config, tilingArea, client);
            }
        }
    });
}

for (const exclusion of ["rule", "desktop", "close", "minimize", "unmaximize", "fullscreen", "destroy"]) {
    tests.register(`Force tiling floating maximize respects ${exclusion}`, 20, () => {
        const config = getDefaultConfig();
        config.forceTilingForMaximizedWindows = true;
        config.tiledDesktops = "Desktop 1";
        config.windowRules = '[{"class":"floating-app","tile":false}]';
        const { qtMock, workspaceMock, world } = init(config);
        qtMock.deferTimers = true;
        const [client] = workspaceMock.createClientsWithWidths(300);
        const manager = getClientManager(world);
        manager.floatKwinClient(client);
        client.setMaximize(true, true);
        switch (exclusion) {
        case "rule": client.resourceClass = "floating-app"; break;
        case "desktop": client.desktops = [workspaceMock.desktops[1]]; break;
        case "close": workspaceMock.removeWindow(client); break;
        case "minimize": client.minimized = true; break;
        case "unmaximize": client.setMaximize(false, false); break;
        case "fullscreen": client.fullScreen = true; break;
        case "destroy": world.destroy(); break;
        }
        const frame = client.getFrameGeometryCopy();
        qtMock.flushTimers();
        Assert.equal(manager.findTiledWindow(client), null);
        Assert.equalRects(client.getActualFrameGeometry(), frame);
    });
}

tests.register("Force tiling screen-sized eligibility", 1, () => {
    init(getDefaultConfig());
    const client = new MockKwinClient(new MockQmlRect(0, 0, screen.width + 20, screen.height + 20));
    Assert.assert(!new WindowRuleEnforcer([]).shouldTile(client));
    Assert.assert(new WindowRuleEnforcer([], true).shouldTile(client));
    client.fullScreen = true;
    Assert.assert(!new WindowRuleEnforcer([], true).shouldTile(client));
});

tests.register("Force tiling does not maximize ordinary tiled windows", 20, () => {
    const config = getDefaultConfig();
    config.forceTilingForMaximizedWindows = true;
    config.reMaximize = true;
    const { qtMock, workspaceMock } = init(config);
    qtMock.deferTimers = true;
    const [other] = workspaceMock.createClientsWithWidths(200);
    const client = new MockKwinClient(new MockQmlRect(10, 20, 300, 200));
    const setMaximize = client.setMaximize.bind(client);
    client.setMaximize = (vertical, horizontal) => {
        Assert.assert(!vertical && !horizontal, { message: "Tiling alone must not maximize windows" });
        setMaximize(vertical, horizontal);
    };
    workspaceMock.createWindows(client);
    qtMock.fireShortcut("karousel-window-toggle-floating");
    qtMock.fireShortcut("karousel-window-toggle-floating");
    client.pin(new MockQmlRect(0, 0, screen.width / 2, screen.height));
    qtMock.fireShortcut("karousel-window-toggle-floating");
    workspaceMock.activeWindow = other;
    workspaceMock.activeWindow = client;
    qtMock.flushTimers();
    Assert.equal(client.maximizeMode, MaximizedMode.Unmaximized);
    Assert.equal(client.tile, null);
});
