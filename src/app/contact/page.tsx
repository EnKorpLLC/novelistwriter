import { Suspense } from "react";
import Link from "next/link";
import { ContactForm } from "./ContactForm";

export const metadata = { title: "Contact us — Novelist Writer" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Link href="/" className="font-display text-xl text-ink">
        Novelist Writer
      </Link>
      <h1 className="font-display mt-8 text-3xl">Contact us</h1>
      <p className="font-ui mt-2 text-sm text-muted">
        Questions, account trouble, or a comment or review that shouldn&apos;t be on the site. We
        read every message.
      </p>
      <Suspense fallback={null}>
        <ContactForm />
      </Suspense>
    </div>
  );
}
