import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <Link href="/" className="font-ui text-sm text-accent">
        ← Home
      </Link>
      <h1 className="font-display mt-8 text-4xl">Privacy promise</h1>
      <div className="mt-8 space-y-4 text-muted">
        <p>
          <strong className="text-ink">We never train AI models on your manuscript.</strong> Your
          words are used only to provide the critique and analysis features you request.
        </p>
        <p>
          Manuscripts are stored with access limited to your account (Row Level Security). You can
          export and delete your work.
        </p>
        <p>
          We do not sell your manuscript data. Payment details are handled by Stripe; we store
          entitlements and credit balances only.
        </p>
        <p>
          Optional BYOK (bring your own API key) lets Studio users send critique requests through
          their own provider credentials.
        </p>
      </div>
    </div>
  );
}
