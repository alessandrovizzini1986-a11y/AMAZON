import type { MetadataRoute } from "next";

/**
 * Il sito è privato: nessun motore di ricerca e nessun raccoglitore per l'intelligenza artificiale deve leggerlo.
 * "*" vale per tutti; i nomi sotto sono ripetuti perché alcuni raccoglitori per l'IA guardano solo la regola col proprio nome.
 */
const IA = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "Google-Extended", "GoogleOther", "PerplexityBot", "Perplexity-User",
  "CCBot", "Bytespider", "Amazonbot", "Applebot", "Applebot-Extended", "meta-externalagent", "FacebookBot", "cohere-ai", "Diffbot", "YouBot", "DuckAssistBot", "MistralAI-User", "Bingbot", "Googlebot",
];

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }, ...IA.map((userAgent) => ({ userAgent, disallow: "/" }))] };
}
