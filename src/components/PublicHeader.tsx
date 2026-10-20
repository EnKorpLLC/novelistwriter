import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="app-chrome font-ui flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5 md:px-10">
      <Link href="/" className="font-display text-xl tracking-tight text-ink">
        Novelist Writer
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/books" className="text-muted hover:text-ink">
          Published books
        </Link>
        <Link href="/beta/dashboard" className="text-muted hover:text-ink">
          Readers
        </Link>
        <Link href="/login" className="text-muted hover:text-ink">
          Log in
        </Link>
      </nav>
    </header>
  );
}
