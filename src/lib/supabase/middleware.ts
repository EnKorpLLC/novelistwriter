import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchProfileRoles, homePathForRoles, type AppSide } from "@/lib/beta-platform";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/project") ||
    path.startsWith("/billing") ||
    path.startsWith("/settings") ||
    path.startsWith("/beta/dashboard") ||
    path.startsWith("/beta/read");

  if (!user && isProtected) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(redirect);
  }

  if (user && (path === "/login" || path === "/signup" || path === "/beta/signup")) {
    const intendedEmail = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    const sessionEmail = user.email?.trim().toLowerCase() || "";
    const forceSwitch = request.nextUrl.searchParams.get("switch") === "1";

    // Claiming/applying as a different email — show auth UI so they can switch accounts
    if (
      forceSwitch ||
      (intendedEmail && sessionEmail && intendedEmail !== sessionEmail)
    ) {
      return supabaseResponse;
    }

    const roles = await fetchProfileRoles(supabase, user.id);
    const next = request.nextUrl.searchParams.get("next");
    const lastSide = request.cookies.get("nw_last_side")?.value as AppSide | undefined;
    const redirect = request.nextUrl.clone();
    redirect.pathname = homePathForRoles(roles, next, lastSide || null);
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  if (user && path === "/beta/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    const next = request.nextUrl.searchParams.get("next") || "/beta/dashboard";
    redirect.search = "";
    redirect.searchParams.set("next", next);
    return NextResponse.redirect(redirect);
  }

  if (!user && path === "/beta/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    const next = request.nextUrl.searchParams.get("next") || "/beta/dashboard";
    redirect.search = "";
    redirect.searchParams.set("next", next);
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
