// NextAuth API handler — catch-all for /api/auth/*
// (sign-in, sign-out, callback, session, csrf, providers).
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
