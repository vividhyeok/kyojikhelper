import { notFound } from "next/navigation";
import Lab from "./lab";

export default function LabPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Lab />;
}
