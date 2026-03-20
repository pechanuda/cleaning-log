export const MEMBER_COOKIE = "cleaning-log-member";

export const cookieOptions = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 180
};
