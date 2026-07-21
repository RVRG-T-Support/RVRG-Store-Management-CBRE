// database.js
// Initialize Supabase Client

const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL'; // Replace with your actual URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual Anon Key

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
