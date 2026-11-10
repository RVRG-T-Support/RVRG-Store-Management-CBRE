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
            const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
            slider.max = String(max);
            slider.value = String(Math.min(max, viewport.scrollLeft));
            slider.disabled = max < 1;
            left.disabled = max < 1 || viewport.scrollLeft <= 1;
            right.disabled = max < 1 || viewport.scrollLeft >= max - 1;
            hint.textContent = max > 0 ? 'Swipe the table, drag the slider, or use the arrows to see all columns.' : 'All columns are visible.';
        };
        slider.addEventListener('input', () => { viewport.scrollLeft = Number(slider.value); update(); });
        left.addEventListener('click', () => viewport.scrollBy({left:-Math.max(160,viewport.clientWidth*.65),behavior:'smooth'}));
        right.addEventListener('click', () => viewport.scrollBy({left:Math.max(160,viewport.clientWidth*.65),behavior:'smooth'}));
        viewport.addEventListener('scroll', update, {passive:true});
        const observer = new ResizeObserver(update);
        observer.observe(viewport);
        const table = viewport.querySelector('table');
        if (table) observer.observe(table);
        update();
    });
});
