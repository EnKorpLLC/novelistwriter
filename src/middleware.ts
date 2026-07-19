import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  isValidReferralCode,
} from "@/lib/referral-shared";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const ref = request.nextUrl.searchParams.get("ref");
  if (ref && isValidReferralCode(ref)) {
    response.cookies.set(REFERRAL_COOKIE, ref.trim().toUpperCase(), {
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
