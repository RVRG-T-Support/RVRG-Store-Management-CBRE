// The UI helps users navigate; every decision and Admin write is enforced by SQL.
(() => {
    const $ = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = value => Number(value).toLocaleString('en-IN', {style:'currency',currency:'INR'});
    const message = (text, bad = false) => {
        $('workflowMessage').className = `alert ${bad ? 'alert-danger' : 'alert-info'}`;
        $('workflowMessage').textContent = text;
    };
    async function rpc(name, args) {
        const {data,error} = await window.supabaseClient.rpc(name,args);
        if (error) throw error;
        return data;
    }
    async function rows(table, columns = '*') {
        const all = [];
        for (let start = 0; ; start += 1000) {
            const {data,error} = await window.supabaseClient.from(table).select(columns)
                .order(table === 'approval_tickets' ? 'created_at' : table === 'approval_lines' ? 'request_id' : 'id', {ascending:false}).range(start,start+999);
            if (error) throw error;
            all.push(...(data || []));
            if ((data || []).length < 1000) return all;
        }
    }
    let profile, users = [], departments = [], assignments = [];
    const userName = id => users.find(user => String(user.id) === String(id))?.full_name || `User ${id}`;
    async function management() {
        if (profile.role.toUpperCase() !== 'ADMIN') throw new Error('Only Admin can manage approval settings.');
        const [settings] = await rows('approval_settings');
        $('threshold').value = settings.threshold;
        for (const key of ['total_ticket_value','sequential_levels','hold_missing_cost']) $(key).checked = settings[key];
        $('assignmentUser').innerHTML = users.filter(user => user.is_active).map(user => `<option value="${user.id}">${escape(user.full_name)} (${escape(user.role)})</option>`).join('');
        $('assignmentDepartment').innerHTML = '<option value="">All departments</option>' + departments.map(d=>`<option value="${d.id}">${escape(d.department_name)}</option>`).join('');
        $('assignmentRows').innerHTML = assignments.map(a=>`<tr><td>${escape(userName(a.user_id))}</td><td>${a.level}</td><td>${escape(departments.find(d=>d.id===a.department_id)?.department_name || 'All departments')}</td><td>${a.active?'Yes':'No'}</td></tr>`).join('');
        $('settingsForm').onsubmit = async event => {
            event.preventDefault();
            await action(event.submitter, async()=>{
                await rpc('approval_save_settings',{p_threshold:Number($('threshold').value),p_total:$('total_ticket_value').checked,p_sequential:$('sequential_levels').checked,p_hold:$('hold_missing_cost').checked});
                message('Settings saved. Existing requests keep their original rules.');
            });
        };
        $('assignmentForm').onsubmit = async event => {
            event.preventDefault();
            await action(event.submitter, async()=>{
                await rpc('approval_assign',{p_user:Number($('assignmentUser').value),p_level:Number($('assignmentLevel').value),p_department:$('assignmentDepartment').value?Number($('assignmentDepartment').value):null,p_active:$('assignmentActive').checked});
                assignments = await rows('approval_assignments');
                await management(); message('Assignment saved.');
            });
        };
    }
    async function action(button, work) {
        if (button?.disabled) return;
        if (button) button.disabled = true;
        try { await work(); } catch(error) { message(error.message,true); }
        finally { if(button) button.disabled=false; }
    }
    async function queue() {
        assignments = await rows('approval_assignments');
        const [tickets,lines,audit] = await Promise.all([
            rows('approval_tickets'), rows('approval_lines','*'), rows('approval_audit')
        ]);
        $('workflowRows').innerHTML = '';
        for (const t of tickets.filter(t=>['PENDING_L1','PENDING_L2','HOLD'].includes(t.state))) {
            const level = t.state==='PENDING_L1'?1:t.state==='PENDING_L2'?2:null;
            const canAct = t.requested_by!==profile.id && level && assignments.some(a=>a.active && a.user_id===profile.id && a.level===level && (!a.department_id || a.department_id===t.department_id)) && !audit.some(a=>a.ticket_no===t.ticket_no && a.actor_id===profile.id && a.action==='APPROVE');
            const tr=document.createElement('tr');
            tr.innerHTML=`<td>${escape(t.ticket_no)}<br>${escape(userName(t.requested_by))}</td><td>${lines.filter(l=>l.ticket_no===t.ticket_no).map(l=>`<div class="mb-2">${escape(l.material_code)} — ${escape(l.material_name)} (${escape(l.unit)}): ${money(l.line_value)}<label class="d-block" for="approveQty-${l.request_id}">Approve quantity</label><input id="approveQty-${l.request_id}" data-request-id="${l.request_id}" type="number" class="form-control form-control-sm" style="max-width:100px" min="0.01" step="0.01" max="${l.approved_qty??l.requested_qty}" value="${l.approved_qty??l.requested_qty}" ${canAct?'':'disabled'}></div>`).join('<br>')}</td><td>${money(t.total_value)}<br>Required: Level ${t.required_level}${t.cost_incomplete?'<div class="text-danger fw-bold">Cost incomplete</div>':''}</td><td>${escape(t.state)}</td><td></td>`;
            const controls=tr.lastElementChild;
            if(canAct) for(const [label,approve] of [['Approve',true],['Reject',false]]) {
                const button=document.createElement('button');button.type='button';button.className=`btn btn-sm me-2 ${approve?'btn-success':'btn-danger'}`;button.textContent=label;
                button.onclick=()=>action(button,async()=>{
                    const reason=approve?'':prompt('Reason for rejection');
                    if(!approve&&!reason?.trim()) return;
                    if(!confirm(`${label} ${t.ticket_no}? Saved request value: ${money(t.total_value)}`)) return;
                    const next=await rpc('approval_decide',{p_ticket:t.ticket_no,p_approve:approve,p_reason:reason,p_quantities:approve?[...tr.querySelectorAll('[data-request-id]')].map(input=>({request_id:Number(input.dataset.requestId),quantity:Number(input.value)})):[]});
                    message(`Ticket ${t.ticket_no}: ${next}`); await queue();
                });controls.appendChild(button);
            }
            if(t.state==='HOLD'&&profile.role.toUpperCase()==='ADMIN'){
                const button=document.createElement('button');button.className='btn btn-sm btn-warning';button.textContent='Recheck corrected costs';
                button.onclick=()=>action(button,async()=>{await rpc('approval_release_hold',{p_ticket:t.ticket_no});await queue()});controls.appendChild(button);
            }
            if(!controls.childElementCount)controls.textContent='Awaiting assigned approver';
            $('workflowRows').appendChild(tr);
        }
        if(!$('workflowRows').childElementCount)$('workflowRows').innerHTML='<tr><td colspan="5">No pending approval tickets.</td></tr>';
        $('auditRows').innerHTML=audit.slice(0,100).map(a=>`<tr><td>${escape(a.ticket_no||'Settings')}</td><td>${escape(userName(a.actor_id))}</td><td>${escape(a.action)}</td><td>${a.level||'-'}</td><td>${escape(new Date(a.created_at).toLocaleString('en-IN'))}</td></tr>`).join('');
    }
    document.addEventListener('DOMContentLoaded',async()=>{
        try {
            if(!window.RvrgSecure?.enabled()) { message('Approval workflow is disabled pending migration review and staging validation.'); return; }
            profile=await window.RvrgSecure.profile();
            [users,departments,assignments]=await Promise.all([rows('users_master','id,full_name,role,is_active'),rows('departments','id,department_name'),rows('approval_assignments')]);
            if($('settingsForm'))await management();else{await queue();$('refreshQueue').onclick=()=>action($('refreshQueue'),queue);}
            $('workflowContent').hidden=false;
        }catch(error){message(error.message,true);}
    });
})();
