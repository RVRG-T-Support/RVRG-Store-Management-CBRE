// Limit scrolling to real columns, excluding browser-created trailing space.
function horizontalTableLimit(viewport) {
    const nativeMax = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const cells = [...(viewport.querySelector('thead tr')?.cells || [])];
    const last = cells.reverse().find(cell => cell.getBoundingClientRect().width > 0);
    if (!last) return nativeMax;
    const end = last.getBoundingClientRect().right - viewport.getBoundingClientRect().left
        - viewport.clientLeft + viewport.scrollLeft;
    return Math.min(nativeMax, Math.max(0, Math.round(end - viewport.clientWidth)));
}

// An always-visible horizontal control supplements touch scrolling/native bars,
// which iPadOS may hide. This module changes no table data or actions.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-scroll-table]').forEach(viewport => {
        const panel = viewport.closest('[data-scroll-panel]');
        const slider = panel.querySelector('[data-scroll-range]');
        const left = panel.querySelector('[data-scroll-left]');
        const right = panel.querySelector('[data-scroll-right]');
        const hint = panel.querySelector('[data-scroll-hint]');
        const update = () => {
            const max = horizontalTableLimit(viewport);
            const position = Math.max(0, Math.min(max, viewport.scrollLeft));
            if (Math.abs(position - viewport.scrollLeft) > 1) viewport.scrollLeft = position;
            slider.max = String(max);
            slider.value = String(Math.min(max, viewport.scrollLeft));
            slider.disabled = max < 1;
            left.disabled = max < 1 || viewport.scrollLeft <= 1;
            right.disabled = max < 1 || viewport.scrollLeft >= max - 1;
            hint.textContent = max > 0 ? 'Swipe the table, drag the slider, or use the arrows to see all columns.' : 'All columns are visible.';
        };
        slider.addEventListener('input', () => { viewport.scrollLeft = Number(slider.value); update(); });
        left.addEventListener('click', () => viewport.scrollTo({left:Math.max(0,viewport.scrollLeft-Math.max(160,viewport.clientWidth*.65)),behavior:'smooth'}));
        right.addEventListener('click', () => viewport.scrollTo({left:Math.min(horizontalTableLimit(viewport),viewport.scrollLeft+Math.max(160,viewport.clientWidth*.65)),behavior:'smooth'}));
        viewport.addEventListener('scroll', update, {passive:true});
        const observer = new ResizeObserver(update);
        observer.observe(viewport);
        const table = viewport.querySelector('table');
        if (table) observer.observe(table);
        update();
    });
});
