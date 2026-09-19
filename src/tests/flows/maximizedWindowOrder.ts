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
