import { isAuthenticated } from "@/lib/server/auth";
export async function GET() {
  return Response.json(
    { authenticated: await isAuthenticated() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
