class MockQmlTimer {
    public readonly __brand = "QmlObject";

    public interval = 0;
    public readonly triggered = new MockQSignal<[]>();

    private pending = false;

    constructor(private readonly defer: () => boolean = () => false) {}

    public firePending() {
        if (this.pending) {
            this.pending = false;
            this.triggered.fire();
        }
    }

    public restart() {
        if (this.defer()) {
            this.pending = true;
            return;
        }
        // no need to wait in tests, just fire immediately
        this.triggered.fire();
    };

    public destroy() {
        this.pending = false;
    }
}
