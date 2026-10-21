import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 8787;
const API_BASE = (
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/$/, "");

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function requireKey(res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: "AI is not configured yet. Add OPENAI_API_KEY."
    });
    return false;
  }
  return true;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Butterfly AI",
    configured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  if (!requireKey(res)) return;

  const { messages = [], systemPrompt = "" } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Add a message first." });
  }

  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              systemPrompt ||
              "You are Butterfly AI, a helpful, clear, and friendly assistant."
          },
          ...messages.map((m) => ({
            role: m.role,
            content: m.content
          }))
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "The AI provider returned an error."
      });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content ||
        "I couldn't generate a reply."
    });
  } catch (e) {
    res.status(500).json({
      error: e.message || "Could not reach the AI provider."
    });
  }
});

app.post("/api/image", async (req, res) => {
  if (!requireKey(res)) return;

  const { prompt } = req.body || {};

  if (!prompt?.trim()) {
    return res.status(400).json({
      error: "Describe the image you want."
    });
  }

  try {
    const response = await fetch(`${API_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: prompt.trim(),
        size: "1024x1024"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Image generation failed."
      });
    }

    const item = data.data?.[0];

    res.json({
      image:
        item?.url ||
        (item?.b64_json
          ? `data:image/png;base64,${item.b64_json}`
          : null)
    });
  } catch (e) {
    res.status(500).json({
      error: e.message || "Could not generate image."
    });
  }
});

app.post("/api/search", async (req, res) => {
  if (!process.env.TAVILY_API_KEY) {
    return res.status(503).json({
      error: "Web search is optional. Add TAVILY_API_KEY to enable it."
    });
  }

  const { query } = req.body || {};

  if (!query?.trim()) {
    return res.status(400).json({ error: "Enter a search query." });
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query.trim(),
        search_depth: "basic",
        max_results: 5
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || "Search failed."
      });
    }

    res.json({ results: data.results || [] });
  } catch (e) {
    res.status(500).json({
      error: e.message || "Could not search the web."
    });
  }
});

app.use(express.static("dist"));

app.listen(PORT, () => {
  console.log(`Butterfly AI API running on port ${PORT}`);
});
