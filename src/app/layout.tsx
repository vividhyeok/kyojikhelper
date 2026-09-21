import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: "Kyojik Helper",
  description: "실시간 교직 강의 이해 보조",
  applicationName: "Kyojik Helper",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kyojik",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#090b0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
