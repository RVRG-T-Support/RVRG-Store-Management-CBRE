const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../table-scroll.js'), 'utf8'), context);
function limit({ nativeWidth = 2000, width = 1000, columnEnd = 1700, scroll = 0, cells = true } = {}) {
    return context.horizontalTableLimit({
        scrollWidth: nativeWidth, clientWidth: width, clientLeft: 1, scrollLeft: scroll,
        getBoundingClientRect: () => ({ left: 100 }),
        querySelector: () => cells ? { cells: [{ getBoundingClientRect: () => ({ width: 100, right: 101 + columnEnd - scroll }) }] } : null
    });
}
test('right scroll limit excludes empty space beyond the last real column', () => {
    assert.equal(limit(), 700);
    assert.equal(limit({ scroll: 550 }), 700);
});
test('scroll limit respects native bounds and tables that fit', () => {
    assert.equal(limit({ columnEnd: 2200 }), 1000);
    assert.equal(limit({ nativeWidth: 1000, columnEnd: 1000 }), 0);
    assert.equal(limit({ cells: false }), 1000);
});
