import { z } from "zod";
import { safePinEqual, setSessionCookie } from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    const { pin } = z
      .object({ pin: z.string().min(1).max(100) })
      .parse(await request.json());
    if (!safePinEqual(pin))
      return Response.json(
        { error: "PIN이 올바르지 않습니다." },
        { status: 401 },
      );
    await setSessionCookie();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "로그인할 수 없습니다." }, { status: 400 });
  }
}
