import { NextResponse } from "next/server";
import { generateAPCCourse, type CourseInput } from "@/lib/apc-engine";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const input: CourseInput = {
      subject: String(raw.subject || "Français"),
      grade: String(raw.grade || "1ère Année"),
      classGroup: String(raw.classGroup || raw.grade || "1ère Année A"),
      week: Number(raw.week || 1),
      duration: Number(raw.duration || 55),
      title: String(raw.title || "").trim(),
      level: String(raw.level || "Hétérogène"),
      guidance: String(raw.guidance || "").trim(),
    };

    if (input.title.length < 3 || input.duration < 20 || input.duration > 240) {
      return NextResponse.json({ error: "Paramètres incomplets ou invalides." }, { status: 400 });
    }

    return NextResponse.json(generateAPCCourse(input));
  } catch {
    return NextResponse.json({ error: "La demande n’a pas pu être traitée." }, { status: 400 });
  }
}
