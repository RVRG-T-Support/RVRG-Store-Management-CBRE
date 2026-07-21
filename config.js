// config.js - Supabase Configuration
const SUPABASE_URL = 'https://immkxmskfeoksebnlidv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mVD5kA-c8Lzo2Md9yl4g7w_6V7TXaJO';
// Create a single supabase client for interacting with your database
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Optional: A quick test function to ensure the connection works
async function checkDatabaseConnection() {
    try {
        const { data, error } = await supabase.from('departments').select('id').limit(1);
        if (error) throw error;
        console.log("Supabase connection successful!");
    } catch (error) {
        console.error("Supabase connection failed:", error.message);
    }
}

// Export the client if using ES modules, otherwise it sits in the global scope 
// since we will load this in the browser via <script> tags.
