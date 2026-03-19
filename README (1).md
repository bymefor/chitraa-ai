# Chitraa AI 🎨
### By Munish Mishra

AI-powered educational diagram generator using **Groq (Llama 3.3 70B)** + optional live web search.

---

## ⚡ Deploy to Vercel — Step by Step

### Step 1 — Get a FREE Groq API key
1. Go to **https://console.groq.com**
2. Sign up (free, no credit card)
3. API Keys → Create API Key
4. Copy it (starts with `gsk_...`)

### Step 2 — Get FREE web search (optional but recommended)
1. Go to **https://tavily.com**
2. Sign up free → Get API key
3. Free tier: 1,000 searches/month

### Step 3 — Push to GitHub
Upload all files keeping this structure:
```
chitraa/
├── api/
│   └── generate.js       ← secure backend
├── public/
│   └── index.html        ← frontend
├── vercel.json
├── .gitignore
└── README.md
```

### Step 4 — Deploy on Vercel
1. Go to **https://vercel.com** → sign in with GitHub
2. "Add New Project" → import your repo
3. Click **Deploy**

### Step 5 — Add your secret keys (NEVER in code!)
In Vercel dashboard → your project → **Settings → Environment Variables**

Add these:
| Name | Value |
|------|-------|
| `GROQ_API_KEY` | `gsk_your_new_key_here` |
| `TAVILY_API_KEY` | `tvly_your_key_here` (optional) |

Click **Save** → Deployments → **Redeploy**

### Done! 🎉
Your site is live at `https://chitraa-ai.vercel.app`

---

## Why this is secure
- API keys live ONLY in Vercel environment variables
- Frontend calls `/api/generate` (your own backend)
- Backend calls Groq with hidden key
- Nobody can ever see the keys in browser source

## Costs
- **Groq**: FREE — 14,400 requests/day, no credit card ever
- **Tavily search**: FREE — 1,000 searches/month
- **Vercel hosting**: FREE
- **Total cost**: ₹0 per month 🎉
