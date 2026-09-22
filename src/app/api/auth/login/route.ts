import { z } from "zod";
import { safePinEqual, setSessionCookie } from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    if (
      !process.env.APP_ACCESS_PIN?.trim() ||
      !process.env.SESSION_SECRET?.trim()
    ) {
      return Response.json(
        {
          error:
            "앱 인증 설정이 비어 있습니다. Vercel 환경변수를 확인하고 다시 배포해 주세요.",
        },
        { status: 503 },
      );
    }
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
