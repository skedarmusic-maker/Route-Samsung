const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('consultores').select('*').limit(1);
  if (error) console.error(error);
  else console.log('Keys:', Object.keys(data[0]));
  process.exit();
}
test();
