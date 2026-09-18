namespace ClientState {
    export class Floating implements State {
        private readonly client: ClientWrapper;
        private readonly config: ClientManager.Config;
        private readonly signalManager: SignalManager;
        private readonly tileOnMaximizeDelayer: Delayer;

        constructor(world: World, client: ClientWrapper, config: ClientManager.Config, limitHeight: boolean) {
            this.client = client;
            this.config = config;
            if (config.floatingKeepAbove) {
                client.kwinClient.keepAbove = true;
            }
            if (limitHeight && client.kwinClient.tile === null) {
                Floating.limitHeight(client);
            }
            this.tileOnMaximizeDelayer = new Delayer(0, () => {
                world.do(clientManager => clientManager.tileMaximizedFloatingClient(client));
            });
            this.signalManager = Floating.initSignalManager(world, client.kwinClient);
            if (config.forceTilingForMaximizedWindows) {
                this.signalManager.connect(client.kwinClient.maximizedAboutToChange, mode => {
                    if (mode !== MaximizedMode.Unmaximized) {
                        // Finish the maximize operation before changing state and geometry.
                        this.tileOnMaximizeDelayer.run();
                    }
                });
            }
        }

        public destroy(passFocus: FocusPassing.Type) {
            this.tileOnMaximizeDelayer.destroy();
            this.signalManager.destroy();
        }

        // TODO: move to `Tiled.restoreClientAfterTiling`
        private static limitHeight(client: ClientWrapper) {
            const placementArea = Workspace.clientArea(
                ClientAreaOption.PlacementArea,
                client.kwinClient.output,
                Clients.getKwinDesktopApprox(client.kwinClient),
            );
            const clientRect = client.kwinClient.frameGeometry;
            const width = client.preferredWidth;
            client.place(
                clientRect.x.round(),
                clientRect.y.round(),
                width,
                Math.min(clientRect.height.round(), Math.round(placementArea.height / 2)),
            );
        }

        private static initSignalManager(world: World, kwinClient: KwinClient) {
            const manager = new SignalManager();

            manager.connect(kwinClient.tileChanged, () => {
                // on X11, this fires after `frameGeometryChanged`
                if (kwinClient.tile !== null) {
                    world.do((clientManager, desktopManager) => {
                        clientManager.pinClient(kwinClient);
                    });
                }
            });

            manager.connect(kwinClient.frameGeometryChanged, () => {
                // on Wayland, this fires after `tileChanged`
                if (kwinClient.tile !== null) {
                    world.do((clientManager, desktopManager) => {
                        clientManager.pinClient(kwinClient);
                    });
                }
            });

            return manager;
        }
    }
}
