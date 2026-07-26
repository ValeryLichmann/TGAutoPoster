const FAQS: [string, string][] = [
  ["Is my channel data safe?", "We read public post history read-only to learn cadence and style. We never post anything without your explicit approval."],
  ["How does the free trial work?", "You get 3 days of full access. After that the free tier allows 1 post per day; upgrade to Pro for unlimited drafts and all sources."],
  ["Where do the sources come from?", "The AI investigates the domains your channel already cites and proposes additional ones. Every source is visible — review, edit, approve or delete it, and add your own with a custom prompt."],
  ["Can I see and edit the prompts?", "Yes. Every generation prompt is shown in full. You can edit and append to the style prompt per slot — nothing is hidden."],
  ["Will it match my posting schedule?", "We detect your recurring slots (e.g. 2× daily news, weekly digest) and pre-fill them. You can adjust every slot's timing, type and image settings."],
  ["How do I pay?", "Pro is billed in Telegram Stars, right inside the app — no external checkout."],
];

export function Faq() {
  return (
    <div className="card faq">
      <h2 style={{ marginBottom: 6 }}>FAQ</h2>
      {FAQS.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
