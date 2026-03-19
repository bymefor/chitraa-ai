export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  const SEARCH_KEY = process.env.TAVILY_API_KEY; // optional
  if (!GROQ_KEY) return res.status(500).json({ error: 'Server not configured. Contact site owner.' });

  const { question, subject, type, lang, action } = req.body || {};
  if (!question) return res.status(400).json({ error: 'No question provided' });

  try {
    // ── STEP 1: Web search for fresh context (if search key available) ──
    let webContext = '';
    if (SEARCH_KEY && action !== 'no-search') {
      try {
        const searchRes = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: SEARCH_KEY,
            query: question,
            search_depth: 'basic',
            max_results: 3,
            include_answer: true
          })
        });
        if (searchRes.ok) {
          const sd = await searchRes.json();
          const snippets = (sd.results || []).map(r => `• ${r.title}: ${r.content?.slice(0, 200)}`).join('\n');
          webContext = sd.answer
            ? `\nLive web context:\nSummary: ${sd.answer}\n${snippets}`
            : snippets ? `\nLive web snippets:\n${snippets}` : '';
        }
      } catch (_) { /* search optional — continue without it */ }
    }

    // ── STEP 2: Build the mega SVG diagram prompt ──
    const svgPrompt = buildSVGPrompt(question, subject, type, lang, webContext);

    // ── STEP 3: Call Groq → Llama 3.3 70B ──
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 8000,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are Chitraa AI — an expert SVG educational diagram creator for students in India. You produce stunning, poster-quality SVG diagrams with beautiful artwork, gradients, illustrations, and clear labels. You always output raw SVG with no markdown fences, followed by an <explanation> tag.`
          },
          { role: 'user', content: svgPrompt }
        ]
      })
    });

    if (!groqRes.ok) {
      const e = await groqRes.json().catch(() => ({}));
      throw new Error(e.error?.message || `Groq error ${groqRes.status}`);
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || '';

    // ── STEP 4: Extract SVG + explanation ──
    const cleaned = raw.replace(/```(?:svg|xml|html)?\s*/gi, '').replace(/```/g, '');
    const svgMatch = cleaned.match(/<svg[\s\S]*<\/svg>/i);
    const explMatch = raw.match(/<explanation>([\s\S]*?)<\/explanation>/i);

    if (!svgMatch) throw new Error('Diagram generation failed. Please try rephrasing your question.');

    // ── STEP 5: Get explanation in correct language ──
    let explanation = explMatch ? explMatch[1].trim() : '';
    if (!explanation) {
      const explRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Explain "${question}" in 3 simple sentences for a school student. ${lang === 'hi' ? 'Write in simple Hindi.' : 'Write in English.'} Be friendly and clear.`
          }]
        })
      });
      if (explRes.ok) {
        const ed = await explRes.json();
        explanation = ed.choices?.[0]?.message?.content?.trim() || '';
      }
    }

    return res.status(200).json({
      svg: svgMatch[0],
      explanation,
      searched: !!webContext,
      model: 'Llama 3.3 70B via Groq'
    });

  } catch (err) {
    console.error('Chitraa error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Topic art detection ──
function detectArt(q, sub) {
  const qL = q.toLowerCase();
  if (/water|rain|cloud|weather|cycle|ocean|river|lake|evapor|monsoon|flood/.test(qL))
    return { bg1: '#87CEEB', bg2: '#C8E6C9', palette: '#1565C0,#42A5F5,#2E7D32,#81C784', deco: 'clouds (white ellipses), yellow sun (circle+lines), wavy ocean (path), green hills (polygon), blue rain droplets' };
  if (/photo|plant|leaf|cell|bio|organ|animal|ecosys|chloro|mitosis|dna|gene|blood|heart|lung|brain|bone|muscle|virus/.test(qL))
    return { bg1: '#F1F8E9', bg2: '#E8F5E9', palette: '#1B5E20,#4CAF50,#A5D6A7,#C62828,#EF9A9A', deco: 'decorative leaves (curved green paths), small flower petals, cell outlines, DNA helix zigzag' };
  if (/math|solve|equat|algebra|geometr|triangle|area|volume|proof|theorem|calcul|fraction|prime|quadratic|pythag|percent|number/.test(qL))
    return { bg1: '#EDE7F6', bg2: '#E8EAF6', palette: '#4A148C,#7B1FA2,#CE93D8,#F9A825,#FFF176', deco: 'faint π ∑ √ symbols as background text, geometric shapes in corners, subtle grid lines' };
  if (/history|revolut|war|empire|king|queen|ancient|medieval|civiliz|french|mughal|british|independ|geograph|continent/.test(qL))
    return { bg1: '#FFF8E1', bg2: '#FFE0B2', palette: '#E65100,#FF8F00,#FFB300,#4E342E,#880E4F', deco: 'scroll banner for title, compass rose star in corner, map border elements, shield shapes' };
  if (/physics|force|energy|electric|magnet|light|sound|wave|motion|gravity|newton|speed|atom|nuclear|heat|circuit/.test(qL))
    return { bg1: '#E3F2FD', bg2: '#E8EAF6', palette: '#0D47A1,#1976D2,#64B5F6,#E65100,#FF6D00', deco: 'atom (nucleus + elliptical orbits + electron circles), lightning bolt polygon, sine wave path, glowing rings' };
  if (/english|grammar|poem|story|novel|sentence|verb|noun|adjective|tense|essay|literature/.test(qL))
    return { bg1: '#FCE4EC', bg2: '#FFF9C4', palette: '#880E4F,#E91E63,#F48FB1,#1A237E,#F9A825', deco: 'open book outline (rect+path), quill pen, large quotation marks, speech bubble shapes, sparkle stars' };
  if (sub === 'science')
    return { bg1: '#E0F7FA', bg2: '#E8F5E9', palette: '#006064,#00ACC1,#80DEEA,#2E7D32,#A5D6A7', deco: 'molecule circles (connected spheres), test tube (rounded rect), beaker shape, bubble circles' };
  return { bg1: '#E8EAF6', bg2: '#F3E5F5', palette: '#1A237E,#3F51B5,#9FA8DA,#004D40,#26A69A', deco: 'geometric hexagons in corners, diamond shapes, dot-line patterns, sparkle polygons' };
}

function buildSVGPrompt(q, sub, type, lang, webCtx) {
  const art = detectArt(q, sub);
  const langNote = lang === 'hi'
    ? 'Write ALL SVG text labels in ENGLISH only. Write the <explanation> in simple Hindi.'
    : 'All text in English.';

  const typeInstr = {
    diagram: `Draw the ACTUAL subject as a real illustration — not plain boxes. Use circles, ellipses, paths, polygons to depict real structures. Surround with labeled callouts (dot + dashed leader line + pill badge). Illustration takes 60% of space.`,
    steps: `3-5 numbered step cards in a flow. Each card: rounded rect (rx=14) with gradient header bar ("Step 1" etc. in white bold) + light body with content. Large colored arrows between cards. Circular number badge (filled circle + white number) left of each header. Final gold "Answer" box with star decoration.`,
    concept: `Central topic in large gradient oval (white bold text). 4-6 branches as curved colored bezier lines radiating out. Each branch ends in a rounded colored box. Different color per branch. Small decorative icon shape beside each label.`,
    timeline: `Bold gradient spine line left→right. 4-6 events alternating above/below. Each: large colored dot on spine + connector line + styled card (gradient header with date, body with description). Different color per era. Arrow at end labeled "Present →".`,
    cycle: `4-5 stages in TRUE CIRCULAR layout. Calculate positions: stage i at angle = i*(360/n) degrees → x = 450 + 180*cos(angle), y = 310 + 160*sin(angle). Center: large gradient circle with cycle name. Curved arc arrows between stages. Each stage different vibrant color.`
  }[type] || 'Draw a beautiful illustrated labeled educational diagram.';

  return `You are Chitraa AI's master SVG artist. Create a STUNNING, poster-quality educational SVG diagram.

TOPIC: "${q}"
SUBJECT: ${sub} | TYPE: ${type}
${langNote}
${webCtx ? `\n${webCtx}\nUse this live context for accuracy.\n` : ''}
━━━ OUTPUT FORMAT (STRICT) ━━━
• Start with <svg — nothing before it, no markdown, no code fences
• End with </svg>
• Then: <explanation>3 friendly sentences for a student.</explanation>
• Nothing else at all

━━━ CANVAS ━━━
viewBox="0 0 900 620"
Background gradient:
<defs>
<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${art.bg1}"/>
<stop offset="100%" stop-color="${art.bg2}"/>
</linearGradient>
<linearGradient id="titleG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0%" stop-color="${art.palette.split(',')[0]}"/>
<stop offset="100%" stop-color="${art.palette.split(',')[1]}"/>
</linearGradient>
</defs>
<rect width="900" height="620" fill="url(#bgG)"/>

━━━ TITLE BAR ━━━
<rect x="0" y="0" width="900" height="58" fill="url(#titleG)"/>
Title text centered: font-family="Georgia,serif" font-size="26" font-weight="bold" fill="white" x="450" y="36" text-anchor="middle"
Small subject badge below title (right side): font-size="11" fill="rgba(255,255,255,0.75)"

━━━ DECORATIVE ARTWORK ━━━
Add these topic-specific decorations: ${art.deco}
Place in corners or as background elements — do NOT overlap main diagram content
Use actual SVG shapes — this is what makes Chitraa diagrams beautiful and unique

━━━ COLOR PALETTE ━━━
Use these colors: ${art.palette}
Apply gradients (<linearGradient>) on ALL major shapes — no flat fills on important elements
Drop shadow filter: <filter id="sh"><feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.12"/></filter>
Use at least 6 distinct colors throughout

━━━ TYPOGRAPHY ━━━
font-family="Georgia,serif" → main title only
font-family="Arial,sans-serif" → all labels, body text
Title: 26px bold | Section headers: 15px bold | Body: 13px | Min: 12px
White text on dark fills | Dark text on light fills
All content: x=15 to x=885, y=62 to y=608

━━━ DIAGRAM CONTENT ━━━
${typeInstr}

━━━ ARROW MARKER (add to defs) ━━━
<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
<path d="M1 1L9 5L1 9Z" fill="${art.palette.split(',')[0]}"/>
</marker>
Use marker-end="url(#arr)" on all flow lines

━━━ QUALITY MANDATE ━━━
Make this diagram so beautiful a student would want to print it as a poster.
Every element must be clearly labeled. No text overlapping shapes. Professional finish.`;
}
