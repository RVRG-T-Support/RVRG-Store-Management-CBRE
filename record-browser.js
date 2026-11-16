// Shared, bounded record browsing. Ticket-grouped tables keep all ticket lines together.
window.RvrgRecords = (() => {
    const views = new Map();
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function mount(id, reload, grouped = false) {
        const body = document.getElementById(id);
        if (!body || views.has(id)) return;
        const state = { page:0, size:10, term:'', version:0, reload, grouped };
        const panel = body.closest('[data-scroll-panel]') || body.closest('.table-responsive');
        const controls = document.createElement('div');
        controls.className = 'record-browser d-flex flex-wrap align-items-end gap-2 p-2 border-bottom bg-light';
        controls.innerHTML = `<label class="flex-grow-1 mb-0" for="${id}-search">Complaint / MR number<input type="search" maxlength="100" id="${id}-search" class="form-control form-control-sm" placeholder="Complaint no. or MR-2026-0363" autocomplete="off"></label><label class="mb-0" for="${id}-size">${grouped ? 'Tickets' : 'Records'} per page<select id="${id}-size" class="form-select form-select-sm"><option>10</option><option>20</option><option>50</option></select></label><button type="button" class="btn btn-primary btn-sm" data-find>Search</button><button type="button" class="btn btn-outline-secondary btn-sm" data-clear>Clear</button>`;
        panel.before(controls);
        const footer = document.createElement('div');
        footer.className = 'd-flex flex-wrap align-items-center justify-content-between gap-2 p-2 border-top record-pagination';
        footer.innerHTML = '<small role="status" aria-live="polite"></small><div class="d-flex gap-2"><button type="button" class="btn btn-outline-secondary btn-sm" data-prev>Previous</button><button type="button" class="btn btn-outline-secondary btn-sm" data-next>Next</button></div>';
        panel.after(footer);
        Object.assign(state,{controls,footer}); views.set(id,state);
        const run = () => {state.page=0;state.term=controls.querySelector('input').value.trim().replace(/^MR:\s*/i,'');reload();};
        controls.querySelector('[data-find]').onclick=run;
        controls.querySelector('input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();run();}});
        controls.querySelector('[data-clear]').onclick=()=>{controls.querySelector('input').value='';run();};
        controls.querySelector('select').onchange=event=>{state.size=Number(event.target.value);run();};
        footer.querySelector('[data-prev]').onclick=()=>{if(state.page>0){state.page--;reload();}};
        footer.querySelector('[data-next]').onclick=()=>{state.page++;reload();};
        update(state,0);
    }
    function update(state,total) {
        const first=total ? state.page*state.size+1 : 0;
        state.footer.querySelector('small').textContent=`${first}–${Math.min((state.page+1)*state.size,total)} of ${total} ${state.grouped?'tickets':'records'}`;
        state.footer.querySelector('[data-prev]').disabled=state.page===0;
        state.footer.querySelector('[data-next]').disabled=(state.page+1)*state.size>=total;
    }
    const pattern = term => '"%'+term.replace(/[\\%_"]/g,'\\$&')+'%"';
    function search(query,term) {
        return term ? query.or(`ticket_no.ilike.${pattern(term)},anacity_complaint_no.ilike.${pattern(term)}`) : query;
    }
    async function all(query) {
        const result=[];
        for(let start=0;;start+=500){
            const {data,error}=await query().range(start,start+499);
            if(error) throw error;
            result.push(...data || []);
            if(!data || data.length<500) return result;
        }
    }
    async function load(id,client,options) {
        const state=views.get(id);
        if(!state) throw new Error('Record browser is not initialized');
        const version=++state.version;
        state.currentData=null;
        let currentPage=state.page;
        const size=state.size, term=state.term;
        state.footer.querySelectorAll('button').forEach(button=>button.disabled=true);
        try {
            let tickets=null;
            if(term && options.table!=='material_requests') {
                tickets=[...new Set((await all(()=>search(client.from('material_requests').select('id,ticket_no'),term).order('id'))).map(row=>row.ticket_no))];
            }
            const build=(select,count=false)=>{
                let q=client.from(options.table).select(select,count?{count:'exact'}:undefined);
                if(options.filter) q=options.filter(q);
                if(options.table==='material_requests') q=search(q,term);
                else if(tickets) q=q.in(options.ticketPath||'ticket_no',tickets);
                return q;
            };
            let total=0, data=[];
            if(tickets && !tickets.length) { /* no matching ticket */ }
            else if(state.grouped) {
                const rows=await all(()=>build(`id,ticket_no,${options.order}`).order(options.order,{ascending:!!options.ascending}).order('id',{ascending:!!options.ascending}));
                const groups=[...new Set(rows.map(row=>row.ticket_no))];
                total=groups.length;
                currentPage=Math.min(currentPage,Math.max(0,Math.ceil(total/size)-1));
                const pageTickets=groups.slice(currentPage*size,(currentPage+1)*size);
                if(pageTickets.length) data=await all(()=>build(options.select).in('ticket_no',pageTickets).order(options.order,{ascending:!!options.ascending}).order('id',{ascending:!!options.ascending}));
            } else {
                const query=()=>build(options.select,true).order(options.order,{ascending:!!options.ascending}).order('id',{ascending:!!options.ascending}).range(currentPage*size,(currentPage+1)*size-1);
                let result=await query(); if(result.error) throw result.error;
                total=result.count || 0;
                const last=Math.max(0,Math.ceil(total/size)-1);
                if(currentPage>last){currentPage=last;result=await query();if(result.error)throw result.error;}
                data=result.data || [];
            }
            if(version!==state.version) return {stale:true};
            if (!total) currentPage=0;
            state.page=currentPage;
            state.currentData=data;
            update(state,total);
            return {data,error:null};
        } catch(error) {
            if(version!==state.version) return {stale:true};
            state.footer.querySelector('small').textContent='Unable to load records. Please try again.';
            return {data:null,error};
        }
    }
    return {mount,load,escape,isCurrent:(id,data)=>views.get(id)?.currentData===data};
})();
