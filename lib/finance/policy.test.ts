import { describe,expect,it } from "vitest";
import type { SchoolRole } from "@/lib/platform/types";
import { canCollectFinance,canConfigureFinance,FINANCE_MODULE_ROLES } from "./policy";
const roles:SchoolRole[]=["super_admin","school_admin","headmaster","academic_director","secretary","supervisor","head_teacher","teacher","guardian","student"];
describe("autorisations financières locales",()=>{
 it("réserve la configuration à la direction",()=>expect(roles.filter(canConfigureFinance)).toEqual(["school_admin","headmaster"]));
 it("autorise le secrétariat à encaisser",()=>expect(roles.filter(canCollectFinance)).toEqual(["school_admin","headmaster","secretary"]));
 it("refuse les autres rôles professionnels et personnels",()=>{for(const role of ["academic_director","teacher","head_teacher","supervisor","guardian","student"] as SchoolRole[])expect(FINANCE_MODULE_ROLES).not.toContain(role);});
 it("ne traite pas super_admin comme membre financier SQL",()=>{expect(canCollectFinance("super_admin")).toBe(false);expect(canConfigureFinance("super_admin")).toBe(false);});
});
