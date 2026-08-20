import { beforeEach,describe,expect,it,vi } from "vitest";
import { STORAGE_KEYS } from "@/lib/storage-mode";
import { defaultPlatformWorkspace } from "./store";
import { detectV07Data,migrateV07Classes } from "./migration";

class MemoryStorage {private values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}clear(){this.values.clear();}}
describe("migration locale v0.7 vers v0.8",()=>{beforeEach(()=>{vi.stubGlobal("localStorage",new MemoryStorage());vi.stubGlobal("crypto",{randomUUID:()=>"journal-id"});localStorage.setItem(STORAGE_KEYS.classes,JSON.stringify([{id:"classe-a",name:"5e A",level:"5e",room:"1",academicYear:"2026-2027",mainSubject:"",updatedAt:"2026-01-01",students:[{id:"eleve-a",firstName:"Abel",lastName:"Ondo",email:"",registrationNumber:"M001",dateOfBirth:"2013-01-02",updatedAt:"2026-01-01"}]}]));});
 it("détecte les classes et élèves de la version précédente",()=>{expect(detectV07Data()).toMatchObject({classes:1,students:1});});
 it("importe sans supprimer la source et sans créer de doublon",()=>{const first=migrateV07Classes(structuredClone(defaultPlatformWorkspace),"school","year");expect(first.imported).toBe(1);expect(detectV07Data().students).toBe(1);const second=migrateV07Classes(first.workspace,"school","year");expect(second.imported).toBe(0);expect(second.workspace.students).toHaveLength(1);});});
