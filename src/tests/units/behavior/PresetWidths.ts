tests.register("PresetWidths", 1, () => {
    const tilingAreaWidth = 800;
    const spacing = 10;
    const minWidth = 50;
    const maxWidth = tilingAreaWidth;

    const testCases = [
        { str: "100%, 50%", result: [395, 800] },
        { str: "105%, 50%", result: [395, 800] },
        { str: "100px,50 px", result: [50, 100] },
        { str: "900px,25 px", result: [50, 800] },
        { str: " 100px, 25 % , 0.1 ", result: [71, 100, 192] },
        { str: "100px, 25%, 0.1, 100px", result: [71, 100, 192] },
        { str: "100px, -25 % , 0.1 ", error: true },
        { str: "100px, 25 % , -0.1 ", error: true },
        { str: "100px, 25 % , 0.1p", error: true },
        { str: "100px, % , 0.1 ", error: true },
        { str: "100px,  , 0.1 ", error: true },
        { str: "100px, 0, 0.1 ", error: true },
        { str: "100px,, 0.1 ", error: true },
        { str: "100px, 25 % , ", error: true },
        { str: "asdf", error: true },
        { str: "", error: true },
        { str: " ", error: true },
    ];

    function assertWidths(presetWidths: PresetWidths, expectedWidths: number[]) {
        let currentWidth = 0;
        for (const expectedWidth of expectedWidths) {
            currentWidth = presetWidths.next(currentWidth, minWidth, maxWidth, tilingAreaWidth);
            Assert.equal(currentWidth, expectedWidth);
        }
        const repeatedWidth = presetWidths.next(currentWidth, minWidth, maxWidth, tilingAreaWidth);
        Assert.equal(repeatedWidth, expectedWidths[0]);
    }

    for (const testCase of testCases) {
        try {
            const presetWidths = new PresetWidths(testCase.str, spacing);
            Assert.assert(!testCase.error);
            assertWidths(presetWidths, testCase.result!);
        } catch (error) {
            Assert.assert(testCase.error === true);
        }
    }
});

tests.register("PresetWidths rounding tolerance", 1, () => {
    const tilingAreaWidth = 2856.666666666667; // fractional, like with 1.2x scaling
    const presetWidths = new PresetWidths("16.66666%, 33.33334%, 50%, 66.66666%, 83.33334%, 100%", 9);
    const widths = presetWidths.getWidths(40, tilingAreaWidth, tilingAreaWidth);
    Assert.equal(widths.join(","), "468,946,1423,1901,2379,2856");

    const next = (width: number) => presetWidths.next(width, 40, tilingAreaWidth, tilingAreaWidth);
    const prev = (width: number) => presetWidths.prev(width, 40, tilingAreaWidth, tilingAreaWidth);
    for (let i = 0; i < widths.length; i++) {
        const following = widths[(i + 1) % widths.length];
        const preceding = widths[(i - 1 + widths.length) % widths.length];
        for (const delta of [-1, 0, 1]) {
            const message = `current width ${widths[i] + delta}`;
            Assert.equal(next(widths[i] + delta), following, { message });
            Assert.equal(prev(widths[i] + delta), preceding, { message });
        }
    }
});
