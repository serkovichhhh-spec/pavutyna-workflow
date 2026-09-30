export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({url:(process.env.CMO_SUPABASE_URL || '').trim().replace(/\/+$/, ''),key:(process.env.CMO_SUPABASE_PUBLISHABLE_KEY || '').trim()});
}
