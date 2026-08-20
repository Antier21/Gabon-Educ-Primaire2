import { describe,expect,it } from "vitest";
import { validateLesson,type LessonRecord } from "./lesson-store";
const lesson:LessonRecord={id:"1",subject:"Français",grade:"5e",classGroup:"5e A1",week:1,title:" Le récit ",duration:55,status:"draft",updatedAt:""};
describe("validation des fiches",()=>{it("normalise une fiche valide",()=>expect(validateLesson(lesson).title).toBe("Le récit"));it("refuse une durée incohérente",()=>expect(()=>validateLesson({...lesson,duration:2})).toThrow("durée"));});
