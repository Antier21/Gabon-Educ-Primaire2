import type { PlatformWorkspace, SchoolRole } from "@/lib/platform/types";

export type PermissionAction = "view" | "create" | "update" | "delete" | "validate" | "publish";
export type PermissionResource = "school" | "users" | "students" | "guardians" | "subjects" | "timetable" | "attendance" | "announcements" | "reports" | "documents";

const rolePermissions: Record<SchoolRole, Partial<Record<PermissionResource, PermissionAction[]>>> = {
  super_admin:{school:["view","create","update","delete","validate","publish"],users:["view","create","update","delete","validate","publish"],students:["view","create","update","delete","validate","publish"],guardians:["view","create","update","delete","validate","publish"],subjects:["view","create","update","delete","validate","publish"],timetable:["view","create","update","delete","validate","publish"],attendance:["view","create","update","delete","validate","publish"],announcements:["view","create","update","delete","validate","publish"],reports:["view","create","update","delete","validate","publish"],documents:["view","create","update","delete","validate","publish"]},
  school_admin:{school:["view","update"],users:["view","create","update","delete"],students:["view","create","update","delete"],guardians:["view","create","update","delete"],subjects:["view","create","update","delete"],timetable:["view","create","update","delete"],attendance:["view","create","update","delete"],announcements:["view","create","update","delete","publish"],reports:["view","update","validate","publish"],documents:["view","create","update","delete","publish"]},
  headmaster:{school:["view","update","validate"],users:["view"],students:["view"],guardians:["view"],subjects:["view"],timetable:["view"],attendance:["view"],announcements:["view","create","update","publish"],reports:["view","update","validate","publish"],documents:["view","create","validate","publish"]},
  academic_director:{school:["view"],users:["view"],students:["view"],guardians:["view"],subjects:["view","create","update"],timetable:["view","create","update","delete"],attendance:["view"],announcements:["view","create","update"],reports:["view","update","validate"],documents:["view","create"]},
  supervisor:{students:["view"],timetable:["view"],attendance:["view","create","update","delete"],announcements:["view"],reports:["view"],documents:["view","create"]},
  secretary:{school:["view"],users:["view","create","update"],students:["view","create","update"],guardians:["view","create","update"],subjects:["view"],timetable:["view"],attendance:["view"],announcements:["view","create"],reports:["view"],documents:["view","create","update","publish"]},
  head_teacher:{students:["view"],guardians:["view"],subjects:["view"],timetable:["view"],attendance:["view","create","update"],announcements:["view"],reports:["view","update","validate"],documents:["view","create"]},
  teacher:{students:["view"],subjects:["view"],timetable:["view"],attendance:["view","create","update"],announcements:["view"],reports:["view","update"],documents:["view","create"]},
  guardian:{students:["view"],timetable:["view"],attendance:["view"],announcements:["view"],reports:["view"],documents:["view"]},
  student:{students:["view"],timetable:["view"],attendance:["view"],announcements:["view"],reports:["view"],documents:["view"]},
};

export type PermissionContext={role:SchoolRole;userId:string;schoolId:string;classId?:string;studentId?:string;resourceOwnerId?:string;published?:boolean};

export function hasPermission(action:PermissionAction,resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace){
  if(!rolePermissions[context.role][resource]?.includes(action))return false;
  if(!workspace)return true;
  if(workspace.school&&context.role!=="super_admin"&&workspace.school.id!==context.schoolId)return false;
  if(context.role==="guardian"&&context.studentId)return workspace.guardianLinks.some(link=>link.guardianId===context.userId&&link.studentId===context.studentId)&&Boolean(context.published??true);
  if(context.role==="student"&&context.studentId)return context.userId===context.studentId&&Boolean(context.published??true);
  if(context.role==="teacher"&&context.classId)return workspace.assignments.some(item=>item.teacherId===context.userId&&item.classId===context.classId&&item.active);
  if(context.role==="head_teacher"&&context.classId)return workspace.assignments.some(item=>item.teacherId===context.userId&&item.classId===context.classId&&item.headTeacher&&item.active);
  return true;
}
export const canView=(resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace)=>hasPermission("view",resource,context,workspace);
export const canCreate=(resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace)=>hasPermission("create",resource,context,workspace);
export const canUpdate=(resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace)=>hasPermission("update",resource,context,workspace);
export const canDelete=(resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace)=>hasPermission("delete",resource,context,workspace);
export const canValidate=(resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace)=>hasPermission("validate",resource,context,workspace);
export const canPublish=(resource:PermissionResource,context:PermissionContext,workspace?:PlatformWorkspace)=>hasPermission("publish",resource,context,workspace);
