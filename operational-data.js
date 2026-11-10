// Read-only operational lookups shared by reports, dashboard and approvals.
window.RvrgOps = {
    async stockBalances(client, ids) {
        const map = new Map();
        const unique = [...new Set(ids.filter(id => id != null).map(String))];
        for (let start=0;start<unique.length;start+=100) {
            for (let offset=0;;offset+=1000) {
                const {data,error}=await client.from('current_stock').select('material_id,current_stock')
                    .in('material_id',unique.slice(start,start+100)).order('material_id').range(offset,offset+999);
                if(error)throw error;
                for(const row of data||[]) map.set(String(row.material_id),Number(row.current_stock));
                if((data||[]).length<1000)break;
            }
        }
        return map;
    },
    async returnedByIssue(client, ids, asOf) {
        const map = new Map();
        const unique = [...new Set(ids.filter(id=>id!=null).map(String))];
        for(let start=0;start<unique.length;start+=100){
            for(let offset=0;;offset+=1000){
                const {data,error}=await client.from('material_returns').select('id,issue_id,returned_qty,return_date')
                    .in('issue_id',unique.slice(start,start+100)).lte('return_date',asOf)
                    .order('id').range(offset,offset+999);
                if(error)throw error;
                for(const row of data||[])map.set(String(row.issue_id),(map.get(String(row.issue_id))||0)+Number(row.returned_qty||0));
                if((data||[]).length<1000)break;
            }
        }
        return map;
    },
    netIssued(issue, returns) {
        return Math.max(0,Number(issue.issued_qty||0)-(returns.get(String(issue.id))||0));
    }
};
