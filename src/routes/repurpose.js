import { generateRepurposedContent } from '../lib/generate.js';

export async function repurposeRoute(req, res) {
  try {
    const { source, platforms, tone } = req.body;

    // Validate request
    if (!source || !source.type) {
      return res.status(400).json({ error: 'Missing source content' });
    }

    const validPlatforms = ['linkedin', 'twitter', 'reddit', 'newsletter'];
    const requestedPlatforms = (platforms || ['linkedin', 'twitter']).filter(p => validPlatforms.includes(p));

    if (requestedPlatforms.length === 0) {
      return res.status(400).json({ error: 'No valid platforms specified' });
    }

    // Validate source has content to work with
    const hasContent = source.title || source.body || source.transcript || source.content || source.description;
    if (!hasContent) {
      return res.status(400).json({ error: 'Source content is empty' });
    }

    // Generate content
    const outputs = await generateRepurposedContent(source, requestedPlatforms, tone || 'professional');

    res.json({
      outputs,
      source: {
        type: source.type,
        title: source.title,
        url: source.url
      }
    });
  } catch (err) {
    console.error('Repurpose error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
