// Opt-in Auth bridge. The database derives identity from the verified JWT,
// never from RVRG_ACTIVE_USER or a browser-supplied numeric user ID.
window.RvrgSecure = {
    enabled: () => window.RVRG_APPROVAL_WORKFLOW_ENABLED === true,
    async profile() {
        const { data: session, error: sessionError } = await window.supabaseClient.auth.getSession();
        if (sessionError || !session.session) throw new Error('Please sign in with your linked account.');
        const { data, error } = await window.supabaseClient.rpc('approval_profile');
        if (error) throw error;
        const { data: permissions, error: permissionError } = await window.supabaseClient
            .from('user_permissions').select('section_key, is_allowed').eq('user_id', data.id);
        if (permissionError) throw permissionError;
        data.sectionPermissions = Object.fromEntries((permissions || []).map(p => [p.section_key, p.is_allowed === true]));
        localStorage.setItem('RVRG_ACTIVE_USER', JSON.stringify(data));
        return data;
    },
    async login(email, password) {
        const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        try { return await this.profile(); }
        catch (error) { await window.supabaseClient.auth.signOut(); throw error; }
    },
    async adminUser(body) {
        const { data, error } = await window.supabaseClient.functions.invoke('admin-users', { body });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        return data;
    }
};
