const SUPABASE_URL = 'https://immkxmskfeoksebnlidv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mVD5kA-c8Lzo2Md9yl4g7w_6V7TXaJO';

window.db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
