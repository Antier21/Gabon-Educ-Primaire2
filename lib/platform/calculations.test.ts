import { describe,expect,it,vi } from "vitest";
import { calculateAttendance,canTransitionReport,createDocumentModel,detectTimetableConflicts,guardianCanAccessStudent,periodCanBeLocked,platformStatistics,transferStudent } from "./calculations";
import { defaultPlatformWorkspace } from "./store";
import type { AttendanceEntry,StudentRecord,TimetableSlot } from "./types";

const slot=(id:string,overrides:Partial<TimetableSlot>={}):TimetableSlot=>({id,schoolId:"s",academicYearId:"y",classId:"c",subjectId:"sub",teacherId:"t",room:"A",weekday:1,startsAt:"08:00",endsAt:"09:00",weekLabel:"",createdAt:"",updatedAt:"",...overrides});
const attendance=(id:string,overrides:Partial<AttendanceEntry>={}):AttendanceEntry=>({id,schoolId:"s",academicYearId:"y",periodId:"p",classId:"c",studentId:"e",timetableSlotId:"",kind:"absence",date:"2026-09-01",durationMinutes:60,reason:"",proofName:"",justified:false,recordedBy:"u",createdAt:"",updatedAt:"",...overrides});
const student:StudentRecord={id:"e",schoolId:"s",academicYearId:"y",classId:"c",registrationNumber:"M1",firstName:"Abel",lastName:"Ondo",gender:"male",dateOfBirth:"",placeOfBirth:"",nationality:"Gabonaise",photoUrl:"",address:"",phone:"",email:"",previousSchool:"",enrolledOn:"",status:"active",specialNeeds:"",emergencyContact:"",administrativeNotes:"",limitedMedicalNotes:"",createdAt:"",updatedAt:""};

describe("fonctions pures de la plateforme",()=>{
 it("détecte les conflits enseignant, classe et salle",()=>expect(detectTimetableConflicts([slot("a"),slot("b",{classId:"c2",room:"B"})]).map(item=>item.reason)).toEqual(["teacher"]));
 it("ignore deux séances qui ne se chevauchent pas",()=>expect(detectTimetableConflicts([slot("a"),slot("b",{startsAt:"09:00",endsAt:"10:00"})])).toHaveLength(0));
 it("calcule l’assiduité et signale un taux estimé",()=>expect(calculateAttendance([attendance("a"),attendance("r",{kind:"late",durationMinutes:10,justified:true})])).toMatchObject({absenceCount:1,unjustifiedAbsenceCount:1,lateCount:1,missedMinutes:70,attendanceRate:null,rateIsExact:false}));
 it("calcule un taux lorsque le volume attendu est connu",()=>expect(calculateAttendance([attendance("a")],600).attendanceRate).toBe(90));
 it("vérifie le rattachement parent-élève",()=>expect(guardianCanAccessStudent("g","e",[{id:"l",schoolId:"s",guardianId:"g",studentId:"e",relationship:"mother",primary:true,createdAt:""}])).toBe(true));
 it("transfère un élève sans perdre son dossier",()=>{vi.setSystemTime(new Date("2026-09-01"));const result=transferStudent([student],"e","c2","y2")[0];expect(result).toMatchObject({classId:"c2",academicYearId:"y2",registrationNumber:"M1"});vi.useRealTimers();});
 it("valide les conditions de verrouillage d’une période",()=>{expect(periodCanBeLocked({missingScores:1,invalidCoefficients:0,role:"headmaster"}).allowed).toBe(false);expect(periodCanBeLocked({missingScores:0,invalidCoefficients:0,role:"headmaster"}).allowed).toBe(true);});
 it("contrôle le workflow de bulletin et la publication",()=>{expect(canTransitionReport("validated","locked","headmaster")).toBe(true);expect(canTransitionReport("locked","published","teacher")).toBe(false);expect(canTransitionReport("locked","review","school_admin")).toBe(true);});
 it("génère un modèle de document configurable",()=>expect(createDocumentModel({kind:"enrollment_certificate",schoolName:"Mbélé",studentName:"Abel",issuedAt:"2026-09-01"})).toMatchObject({title:"Certificat de scolarité",schoolName:"Mbélé",studentName:"Abel"}));
 it("agrège uniquement les données réelles",()=>{const stats=platformStatistics({...structuredClone(defaultPlatformWorkspace),students:[student],users:[],timetable:[slot("a"),slot("b")]});expect(stats.studentCount).toBe(1);expect(stats.conflictCount).toBe(3);});
});
