// Deploy only to the staging project first. No credential belongs in frontend code.
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
const origin = Deno.env.get('APP_ORIGIN');
Deno.serve(async request => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!origin || request.headers.get('origin') !== origin) return reply({ error: 'Origin denied' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return reply({ error: 'POST required' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const { data: identity, error: identityError } = await admin.auth.getUser(jwt);
  if (identityError || !identity.user) return reply({ error: 'Sign in required' }, 401);
  const { data: actor } = await admin.from('users_master').select('id,role,is_active').eq('auth_user_id', identity.user.id).single();
  if (!actor?.is_active || actor.role.toUpperCase() !== 'ADMIN') return reply({ error: 'Admin only' }, 403);
  try {
    const body = await request.json();
    if (!['create','update'].includes(body.action)) throw new Error('Invalid operation');
    const fields: Record<string, unknown> = {};
    for (const key of ['full_name','email','username','role','is_active']) if (body[key] !== undefined) fields[key] = body[key];
    if (fields.role && !['ADMIN','FM','AFM','CRM','STORE','STOREKEEPER','TECH_SUPERVISOR','TECHNICIAN'].includes(String(fields.role))) throw new Error('Invalid role');
    if (body.password && (typeof body.password !== 'string' || body.password.length < 12)) throw new Error('Use a password of at least 12 characters');
    if (body.action === 'create') {
      if (!body.email || !body.password || !body.full_name || !body.username) throw new Error('Name, email, username and password required');
      const { data, error } = await admin.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true });
      if (error) throw error;
      const saved = await admin.from('users_master').insert({ ...fields, auth_user_id: data.user.id, password: null }).select('id').single();
      if (saved.error) { await admin.auth.admin.deleteUser(data.user.id); throw saved.error; }
      return reply(saved.data);
    }
    if (!Number.isSafeInteger(body.id)) throw new Error('Valid user ID required');
    if (body.id === actor.id && (body.is_active === false || (body.role && body.role !== 'ADMIN'))) throw new Error('Cannot disable or demote your own Admin account');
    const { data: target, error } = await admin.from('users_master').select('auth_user_id').eq('id', body.id).single();
    if (error || !target?.auth_user_id) throw new Error('Link this user to Auth first');
    // Profile deactivation is authoritative even if the Auth token remains alive.
    const saved = await admin.from('users_master').update(fields).eq('id', body.id).select('id').single();
    if (saved.error) throw saved.error;
    if (body.password || body.email) {
      const changed = await admin.auth.admin.updateUserById(target.auth_user_id, {
        ...(body.password ? { password: body.password } : {}), ...(body.email ? { email: body.email, email_confirm: true } : {})
      });
      if (changed.error) return reply({ error: 'Profile saved, but Auth email/password update failed. Retry the account update; do not create another user.' }, 409);
    }
    return reply(saved.data);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'User update failed' }, 400); }
});
