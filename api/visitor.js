// Vercel serverless function — total unique visitor counter
// Cookie lasts 1 year — same browser never counted twice

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://event-horizon-gray.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const cookies = req.headers.cookie || '';

    // Already counted — skip
    if (cookies.includes('eh_visited=1')) {
      return res.status(200).json({ success: true, new: false });
    }

    // Set 1-year cookie
    res.setHeader('Set-Cookie', 'eh_visited=1; Max-Age=31536000; Path=/; SameSite=Strict');

    // Trigger GitHub Actions to increment visitor-count.json
    const ghResponse = await fetch(
      'https://api.github.com/repos/Pongki69/Event-Horizon/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'EventHorizon-VisitorCounter',
        },
        body: JSON.stringify({ event_type: 'new-visitor' }),
      }
    );

    return res.status(200).json({ success: true, new: true, github_status: ghResponse.status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
