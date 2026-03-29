import OpenAI from 'openai';

// Use NVIDIA NIM (free, OpenAI-compatible) for dev. Swap to Claude API for production.
const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
});

const MODEL = process.env.AI_MODEL || 'moonshotai/kimi-k2.5';

const PLATFORM_PROMPTS = {
  linkedin: `You are an expert LinkedIn content writer. Generate a LinkedIn post based on the source content.
Rules:
- Professional but engaging tone
- Hook in the first line (bold statement, question, or surprising fact)
- 1-3 short paragraphs (150-300 words total)
- End with a thought-provoking question or clear call-to-action
- Add 3-5 relevant hashtags at the bottom
- Use line breaks for readability
- Do NOT use emojis unless they add real value
- Sound like a real human sharing insight, not a content bot`,

  twitter: `You are an expert Twitter/X thread writer. Generate a tweet thread based on the source content.
Rules:
- Return EXACTLY a JSON array of strings, each string is one tweet
- 3-7 tweets in the thread
- Each tweet MUST be under 280 characters
- First tweet is a hook — bold claim, surprising stat, or contrarian take
- Last tweet is a CTA or summary
- Use line breaks within tweets for readability
- Do NOT use hashtags in every tweet (max 2 in the whole thread)
- Return ONLY the JSON array, no explanation or markdown`,

  reddit: `You are writing a Reddit post. Generate content based on the source.
Rules:
- Start with "TLDR:" (1 sentence summary)
- Conversational, authentic tone — like you're talking to friends
- No self-promotion feel whatsoever
- 2-4 paragraphs
- Include your personal take or opinion
- End with a question to spark discussion
- Sound like a regular redditor, not a marketer`,

  newsletter: `You are writing a newsletter snippet. Generate content based on the source.
Rules:
- Personal, conversational tone — like writing to a friend
- 2-4 paragraphs (200-400 words)
- Open with a personal angle or hook
- Include your insight on WHY this matters
- Link reference back to the source naturally
- End with a friendly sign-off or teaser for the next topic
- Sound warm and authentic, not corporate`
};

const TONE_MODIFIERS = {
  professional: 'Use a professional, polished tone. Suitable for business audiences.',
  casual: 'Use a relaxed, conversational tone. Speak like a friend sharing something cool.',
  technical: 'Use a technical tone with specific details. Assume the audience has domain expertise.'
};

export async function generateRepurposedContent(source, platforms, tone = 'professional') {
  const outputs = {};
  const sourceSummary = buildSourceSummary(source);

  const promises = platforms.map(async (platform) => {
    const systemPrompt = PLATFORM_PROMPTS[platform];
    if (!systemPrompt) return;

    const toneModifier = TONE_MODIFIERS[tone] || TONE_MODIFIERS.professional;
    const userPrompt = `${toneModifier}\n\nSource content to repurpose:\n---\n${sourceSummary}\n---\n\nGenerate the ${platform} content now.`;

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });

      let content = response.choices?.[0]?.message?.content || '';

      if (platform === 'twitter') {
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            outputs[platform] = JSON.parse(jsonMatch[0]);
          } else {
            outputs[platform] = content.split(/\n\d+\/\s*/).filter(Boolean).map(t => t.trim());
          }
        } catch {
          outputs[platform] = [content];
        }
      } else {
        outputs[platform] = content;
      }
    } catch (err) {
      console.error(`Error generating ${platform} content:`, err.message);
      outputs[platform] = `Error generating ${platform} content: ${err.message}`;
    }
  });

  await Promise.all(promises);
  return outputs;
}

function buildSourceSummary(source) {
  const parts = [];
  if (source.title) parts.push(`Title: ${source.title}`);
  if (source.type) parts.push(`Source type: ${source.type}`);
  if (source.channel) parts.push(`Channel/Author: ${source.channel}`);
  if (source.author) parts.push(`Author: ${source.author}`);
  if (source.url) parts.push(`URL: ${source.url}`);

  const mainContent = source.transcript || source.body || source.content || source.description || '';
  const truncated = mainContent.length > 2500 ? mainContent.substring(0, 2500) + '...' : mainContent;
  if (truncated) parts.push(`\nContent:\n${truncated}`);

  if (source.topComments?.length) {
    parts.push(`\nTop community reactions:\n${source.topComments.slice(0, 3).join('\n---\n')}`);
  }

  return parts.join('\n');
}
