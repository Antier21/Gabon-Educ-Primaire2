import { describe,expect,it } from "vitest";
import { validateClass,validateStudent } from "./validation";
const gradeLevelId="123e4567-e89b-42d3-a456-426614174000";
describe("validation des classes et élèves",()=>{it("normalise une classe",()=>expect(validateClass({name:" 5e   A1 ",gradeLevelId,room:" 6A7 "}).name).toBe("5e A1"));it("refuse un niveau invalide",()=>expect(()=>validateClass({name:"5e A1",gradeLevelId:"5e"})).toThrow("niveau valide"));it("normalise un élève",()=>expect(validateStudent({firstName:" Élise ",lastName:" ONDO ",email:" ELISE@TEST.GA "}).email).toBe("elise@test.ga"));it("refuse un courriel invalide",()=>expect(()=>validateStudent({firstName:"Abel",lastName:"Ondo",email:"abel"})).toThrow("e-mail"));});
