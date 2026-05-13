const ARTICLES = [
  { slug: 'how-to-win-your-first-tender', title: 'How to Win Your First Tender in South Africa' },
  { slug: 'bbbee-requirements', title: 'B-BBEE Requirements for SA Tenders Explained' },
  { slug: 'csd-registration', title: 'CSD Registration: A Step-by-Step Guide' },
];

for (const article of ARTICLES) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: `Write a 1200-word blog article for South African SMMEs.
Title: ${article.title}
Audience: small business owners new to government tenders in SA.
Tone: practical, no jargon, actionable steps.
Format: Astro markdown with frontmatter (title, description, pubDate, author: "Tenderpreneurs Team", readingTime).
Include: real National Treasury / CSD references where applicable.
Add a disclaimer at the end: "This article is general guidance, not legal or financial advice."`
      }],
      max_tokens: 4000,
    }),
  });

  const data = await res.json();
  const content = data.choices[0].message.content;
  const fs = await import('fs');
  fs.writeFileSync(`./src/content/blog/${article.slug}.md`, content);
  console.log(`✓ Drafted ${article.slug}`);
}