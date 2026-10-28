import { createClient } from '@supabase/supabase-js';

const alteraaiUrl = process.env.ALTERAAI_SUPABASE_URL || 'https://vpvdprunhcvaztrqewjp.supabase.co';
const alteraaiAnonKey = process.env.ALTERAAI_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwdmRwcnVuaGN2YXp0cnFld2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTI0MDksImV4cCI6MjA4NzA4ODQwOX0.WKx85-6gZtwqZDp2h6g6hul2TorumD5RCIG75RhK0Ws';
const alteraaiServiceKey = process.env.ALTERAAI_SUPABASE_SERVICE_KEY;

// Cliente anônimo (padrão)
export const alteraaiSupabase = createClient(alteraaiUrl, alteraaiAnonKey);

// Cliente administrativo (com service role para bypass de RLS no backend da API)
export const alteraaiAdminSupabase = createClient(
  alteraaiUrl,
  alteraaiServiceKey || alteraaiAnonKey
);
