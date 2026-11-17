// Shared ticket presentation for request, approval and issue history.
window.RvrgTickets = (() => {
    const esc=value=>window.RvrgRecords.escape(value ?? '');
    const date=value=>value ? new Date(value).toLocaleString('en-IN') : '-';
    function groups(rows) {
        const result=new Map();
        for(const row of rows){const key=row.ticket_no || 'No ticket';if(!result.has(key))result.set(key,[]);result.get(key).push(row);}
        return result;
    }
    function material(req,price=false) {
        const m=req.materials || {};
        return `<div class="approval-material-heading"><span class="approval-material-code">${esc(m.material_code || '-')}</span><strong>${esc(m.material_name || '-')}</strong></div>
            <div class="approval-material-meta">${[['Brand',m.brand],['Type',m.item_type],['Size',m.item_size],['Specification',m.specification],['Unit',m.unit]].map(([key,value])=>`<span><span class="approval-meta-label">${key}:</span> ${esc(value || '-')}</span>`).join('')}</div>
            ${price ? `<div class="approval-history-price">Sales / unit (incl. GST) <strong>${formatCurrency(window.RvrgSales.unit(m,req.material_id))}</strong></div>` : ''}`;
    }
    function quantity(req,key) {
        const unapproved=['PENDING','REJECTED','CANCELLED'].includes(req.request_status);
        const value=key==='approved_qty' ? req.approved_qty ?? (unapproved ? 0 : req.requested_qty) : req[key] ?? 0;
        return `<span class="approval-quantity ${key==='approved_qty'?'approval-quantity-approved':''}">${esc(value)}</span>`;
    }
    function status(req) {
        const labels={PENDING:['Pending','partial'],APPROVED:['Approved','approved'],PARTIALLY_APPROVED:['Partially approved','partial'],ISSUED:['Issued','issued'],PARTIALLY_ISSUED:['Partially issued','partial'],REJECTED:['Rejected','rejected'],CANCELLED:['Cancelled','rejected']};
        const [label,style]=labels[req.request_status] || [req.request_status || '-','partial'];
        const over=Number(req.issued_qty || 0)>Math.min(Number(req.requested_qty),Number(req.approved_qty ?? req.requested_qty));
        return `<span class="approval-status status-${style}">${esc(label)}</span>${over?'<div class="small text-danger">Exceeds approval — review required</div>':''}`;
    }
    function bindScroll(panel) {
        const view=panel.querySelector('.approval-items-scroll'),slider=panel.querySelector('input[type=range]');
        const left=panel.querySelector('[data-ticket-left]'),right=panel.querySelector('[data-ticket-right]');
        const update=()=>{const max=Math.max(0,view.scrollWidth-view.clientWidth);slider.max=String(max);slider.value=String(view.scrollLeft);slider.disabled=max<=1;left.disabled=view.scrollLeft<=1;right.disabled=view.scrollLeft>=max-1;panel.querySelector('.ticket-horizontal-controls').hidden=max<=1;};
        slider.oninput=()=>{view.scrollLeft=Number(slider.value);};
        left.onclick=()=>view.scrollTo({left:Math.max(0,view.scrollLeft-view.clientWidth*.65),behavior:'smooth'});
        right.onclick=()=>view.scrollTo({left:Math.min(view.scrollWidth-view.clientWidth,view.scrollLeft+view.clientWidth*.65),behavior:'smooth'});
        view.addEventListener('scroll',update,{passive:true});
        const observer=new ResizeObserver(()=>{if(panel.isConnected)update();else observer.disconnect();});observer.observe(view);
        update();
    }
    function render(body,rows,options={}) {
        body.innerHTML='';
        for(const [ticket,items] of groups(rows)) {
            const first=items[0],row=document.createElement('tr');row.className='approval-ticket-row';
            row.innerHTML=`<td colspan="${options.colspan || 1}"><article class="approval-ticket" aria-label="${esc(ticket)}">
                <header class="approval-ticket-header">
                    <div><div class="approval-eyebrow">MATERIAL REQUEST <span class="approval-count">${items.length} material${items.length===1?'':'s'}</span></div><div class="approval-ticket-number">${esc(ticket)}</div><div>Complaint <strong>${esc(first.anacity_complaint_no || 'N/A')}</strong></div><div class="approval-muted">Raised ${esc(date(first.created_at))}</div></div>
                    <div><div class="approval-eyebrow">DEPARTMENT / TECHNICIAN</div><strong>${esc(first.materials?.departments?.department_name || '-')}</strong><div class="approval-muted">${esc(first.technician_name || '-')}</div></div>
                    <div><div class="approval-eyebrow">LOCATION</div><strong>${esc(first.location_type || 'N/A')}</strong><div class="approval-muted">${esc(first.location_name || 'N/A')}</div>${first.remarks?`<div class="approval-muted">Remarks: ${esc(first.remarks)}</div>`:''}</div>
                    <div class="approval-ticket-actions"></div>
                </header>
                <div class="ticket-items-panel">
                    <div class="approval-items-scroll" tabindex="0" aria-label="Materials for ${esc(ticket)}"><table class="table approval-item-table ${options.tableClass || 'ticket-history-items'} mb-0">
                        <colgroup>${options.columns.map(col=>`<col style="width:${col.width}">`).join('')}</colgroup>
                        <thead><tr>${options.columns.map(col=>`<th>${esc(col.label)}</th>`).join('')}</tr></thead>
                        <tbody>${items.map(req=>`<tr data-request-id="${esc(req.id)}">${options.columns.map(col=>`<td>${col.render(req)}</td>`).join('')}</tr>`).join('')}</tbody>
                    </table></div>
                    <div class="ticket-horizontal-controls" hidden><button type="button" class="btn btn-outline-secondary btn-sm" data-ticket-left aria-label="Scroll material columns left">◀</button><input type="range" min="0" max="0" value="0" aria-label="Scroll material columns"><button type="button" class="btn btn-outline-secondary btn-sm" data-ticket-right aria-label="Scroll material columns right">▶</button></div>
                </div>
            </article></td>`;
            const actions=row.querySelector('.approval-ticket-actions');
            for(const action of options.actions?.(ticket,items) || []){
                const button=document.createElement('button');button.type='button';button.className='btn btn-sm '+action.className;button.textContent=action.label;button.addEventListener('click',()=>action.run(ticket,items));actions.appendChild(button);
            }
            body.appendChild(row);bindScroll(row.querySelector('.ticket-items-panel'));
        }
    }
    function history(body,rows,mode) {
        const columns=[{label:'Material details',width:mode==='approval'?'43%':'48%',render:req=>material(req,mode==='approval')},
            {label:'Requested',width:'10%',render:req=>quantity(req,'requested_qty')},
            {label:'Approved',width:'10%',render:req=>quantity(req,'approved_qty')},
            {label:'Issued',width:'10%',render:req=>quantity(req,'issued_qty')},
            {label:'Status',width:mode==='approval'?'12%':'22%',render:status}];
        if(mode==='approval')columns.push({label:'Approval date',width:'15%',render:req=>`<span class="approval-muted">${esc(date(req.approval_date))}</span>`});
        const actions=mode==='request' ? (ticket,items)=>items.some(req=>req.request_status==='PENDING') ? [
            {label:'Edit request',className:'btn-outline-primary',run:()=>window.editMaterialRequest(ticket)},
            {label:'Delete request',className:'btn-outline-danger',run:()=>window.deleteMaterialRequest(ticket)}] : [] : undefined;
        render(body,rows,{columns,actions,colspan:mode==='request'?7:8});
    }
    return {esc,groups,material,quantity,status,render,history};
})();
