/**
 * Cloudflare Worker — Visitor Counter
 * Deployed at: visitor-counter.alfonsopanisales6420.workers.dev
 * Called via Vercel proxy at /api/visitor to avoid ad blocker blocks
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      // Accept IP from proxy or use CF header
      const ip = url.searchParams.get('ip') || request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipKey = `ip:${ip}`;

      const alreadyCounted = await env.VISITOR_IPS.get(ipKey);

      if (!alreadyCounted) {
        await env.VISITOR_IPS.put(ipKey, '1', { expirationTtl: 86400 });

        await fetch(
          'https://api.github.com/repos/Pongki69/Event-Horizon/dispatches',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'EventHorizon-VisitorCounter',
            },
            body: JSON.stringify({ event_type: 'new-visitor' }),
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, new: !alreadyCounted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};
