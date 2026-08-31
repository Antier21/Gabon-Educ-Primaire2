import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");

describe("sécurité des API de comptes",()=>{
  it("rejette globalement un identifiant existant avant toute mutation Auth",()=>{
    const code=source("app/api/gabon-educ/access/create/route.ts");
    expect(code).toContain("if (existingCredential)");
    expect(code).toContain("{ status: 409 }");
    expect(code).not.toContain("updateUserById");
    expect(code.indexOf("if (existingCredential)")).toBeLessThan(code.indexOf("admin.auth.admin.createUser"));
  });
  it("calcule les rôles acteur et cible côté serveur et bloque l'auto-gestion",()=>{
    const code=source("app/api/gabon-educ/access/manage/route.ts");
    expect(code).toContain('.from("school_memberships")');
    expect(code).toContain("if (userId === actorId)");
    expect(code).toContain('rpc("convert_school_teaching_role"');
  });
});
