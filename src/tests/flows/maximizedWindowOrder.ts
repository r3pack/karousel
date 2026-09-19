{
    function assertOrdered(clients: MockKwinClient[]) {
        for (let i = 1; i < clients.length; i++) {
            const leftX = clients[i-1].getActualFrameGeometry().x;
            const rightX = clients[i].getActualFrameGeometry().x;
            Assert.assert(leftX < rightX, { message: `client ${i-1} (x=${leftX}) should be left of client ${i} (x=${rightX})` });
        }
    }

    for (const [vertical, horizontal] of [[true, true], [false, true], [true, false]]) {
        tests.register(`Maximized windows keep column order (vertical=${vertical}, horizontal=${horizontal})`, 20, () => {
            const config = getDefaultConfig();
            config.forceTilingForMaximizedWindows = true;
            const { workspaceMock } = init(config);

            const clients = [0, 1, 2, 3].map(i => new MockKwinClient(new MockQmlRect(10, 20, 300, 200)));
            clients[1].setMaximize(vertical, horizontal);
            clients[3].setMaximize(vertical, horizontal);
            workspaceMock.createWindows(...clients);
            assertOrdered(clients);

            for (const client of [clients[0], clients[3], clients[1], clients[2]]) {
                workspaceMock.activeWindow = client;
                assertOrdered(clients);
            }

            workspaceMock.activeWindow = clients[3];
            clients[3].setMaximize(vertical, horizontal);
            assertOrdered(clients);
            if (vertical && horizontal) {
                Assert.equalRects(clients[3].getActualFrameGeometry(), screen);
            }
        });
    }
}

{
    function assertOwnColumns(world: World, clients: MockKwinClient[]) {
        const columns = clients.map(client => getClientManager(world).findTiledWindow(client)!.column);
        for (let i = 0; i < columns.length; i++) {
            Assert.equal(columns[i].getWindowCount(), 1, { message: `client ${i} should have its own column` });
            if (i > 0) {
                Assert.assert(columns[i-1].isToTheLeftOf(columns[i]), { message: `client ${i-1} should be left of client ${i}` });
            }
        }
    }

    for (const maximize of ["maximized", "fullScreen"]) {
        tests.register(`Maximized windows are never stacked (${maximize})`, 20, () => {
            const config = getDefaultConfig();
            config.forceTilingForMaximizedWindows = true;
            config.windowRules = '[{"class":"full-screen-app","tile":true}]';
            const { qtMock, workspaceMock, world } = init(config);
            const [a, b, c] = workspaceMock.createClientsWithWidths(300, 300, 300);
            for (const client of [a, b, c]) {
                client.resourceClass = "full-screen-app";
            }
            function setMaximized(client: MockKwinClient, maximized: boolean) {
                if (maximize === "maximized") {
                    client.setMaximize(maximized, maximized);
                } else {
                    client.fullScreen = maximized;
                }
            }

            // maximized window moving into neighbor columns
            workspaceMock.activeWindow = b;
            setMaximized(b, true);
            qtMock.fireShortcut("karousel-window-move-left");
            assertOwnColumns(world, [b, a, c]);
            qtMock.fireShortcut("karousel-window-move-right");
            assertOwnColumns(world, [a, b, c]);
            qtMock.fireShortcut("karousel-window-move-right");
            assertOwnColumns(world, [a, c, b]);
            qtMock.fireShortcut("karousel-window-move-left");
            assertOwnColumns(world, [a, b, c]);
            qtMock.fireShortcut("karousel-window-move-to-column-1");
            assertOwnColumns(world, [a, b, c]);

            // other window moving into the maximized window's column
            workspaceMock.activeWindow = c;
            setMaximized(b, true);
            qtMock.fireShortcut("karousel-window-move-left");
            assertOwnColumns(world, [a, c, b]);

            // maximizing a stacked window
            setMaximized(b, false);
            workspaceMock.activeWindow = a;
            qtMock.fireShortcut("karousel-window-move-right");
            Assert.equal(getClientManager(world).findTiledWindow(a)!.column.getWindowCount(), 2);
            setMaximized(a, true);
            assertOwnColumns(world, [c, a, b]);
        });
    }
}
