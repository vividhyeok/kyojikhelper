export async function GET() {
  return Response.json(
    {
      ok: true,
      configured: Boolean(process.env.OPENAI_API_KEY),
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
