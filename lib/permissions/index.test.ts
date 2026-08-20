import { describe,expect,it } from "vitest";
import { canCreate,canDelete,canPublish,canUpdate,canValidate,canView } from "./index";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { defaultPlatformWorkspace } from "@/lib/platform/store";

const workspace:PlatformWorkspace={...structuredClone(defaultPlatformWorkspace),school:{id:"school-a",name:"A",acronym:"",schoolType:"middle_school" as const,schoolSector:"private" as const,registrationNumber:"",province:"",city:"",district:"",neighborhood:"",address:"",phone:"",email:"",website:"",logoUrl:"",stampUrl:"",headName:"",motto:"",activeAcademicYearId:"",periodSystem:"trimester",maxScore:20,passThreshold:10,bulletinModel:"",timezone:"Africa/Libreville",language:"fr",isActive:true,createdAt:"",updatedAt:""},guardianLinks:[{id:"l",schoolId:"school-a",guardianId:"guardian-1",studentId:"student-1",relationship:"father",primary:true,createdAt:""}],assignments:[{id:"a",schoolId:"school-a",academicYearId:"y",classId:"c1",subjectId:"s",teacherId:"teacher-1",startsOn:"",endsOn:"",temporary:false,headTeacher:false,active:true,createdAt:"",updatedAt:""}]};

describe("permissions centralisées",()=>{
 it("autorise l’administration à configurer les utilisateurs",()=>expect(canCreate("users",{role:"school_admin",userId:"admin",schoolId:"school-a"},workspace)).toBe(true));
 it("interdit à un enseignant de supprimer un élève",()=>expect(canDelete("students",{role:"teacher",userId:"teacher-1",schoolId:"school-a",classId:"c1"},workspace)).toBe(false));
 it("limite un enseignant à ses affectations",()=>{expect(canView("students",{role:"teacher",userId:"teacher-1",schoolId:"school-a",classId:"c1"},workspace)).toBe(true);expect(canView("students",{role:"teacher",userId:"teacher-1",schoolId:"school-a",classId:"c2"},workspace)).toBe(false);});
 it("limite le parent aux élèves liés",()=>{expect(canView("students",{role:"guardian",userId:"guardian-1",schoolId:"school-a",studentId:"student-1",published:true},workspace)).toBe(true);expect(canView("students",{role:"guardian",userId:"guardian-1",schoolId:"school-a",studentId:"student-2",published:true},workspace)).toBe(false);});
 it("limite l’élève à son propre dossier",()=>expect(canView("reports",{role:"student",userId:"student-1",schoolId:"school-a",studentId:"student-2",published:true},workspace)).toBe(false));
 it("réserve validation et publication",()=>{expect(canValidate("reports",{role:"headmaster",userId:"h",schoolId:"school-a"},workspace)).toBe(true);expect(canPublish("reports",{role:"teacher",userId:"t",schoolId:"school-a"},workspace)).toBe(false);expect(canUpdate("school",{role:"school_admin",userId:"a",schoolId:"school-a"},workspace)).toBe(true);});
});
