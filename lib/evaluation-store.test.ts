import { describe,expect,it } from "vitest";
import { calculateTotal, validateEvaluation, type EvaluationRecord } from "./evaluation-store";

const base:EvaluationRecord={
  id:"1",
  title:"Dictée préparée",
  subject:"Français",
  grade:"5e",
  classId:"",
  className:"",
  date:"2026-09-01",
  duration:55,
  maxScore:5,
  coefficient:1,
  type:"Devoir surveillé",instructions:"",questions:[{id:"q",type:"Réponse courte",prompt:"Accordez le mot.",points:5,answer:"",options:[]}],status:"draft",createdAt:"",updatedAt:""};
describe("évaluations",()=>{it("calcule automatiquement le barème",()=>expect(calculateTotal([{points:4},{points:6.5}])).toBe(10.5));it("refuse une évaluation sans question",()=>expect(()=>validateEvaluation({...base,questions:[]})).toThrow("au moins une question"));it("valide une évaluation complète",()=>expect(validateEvaluation(base).title).toBe("Dictée préparée"));});
