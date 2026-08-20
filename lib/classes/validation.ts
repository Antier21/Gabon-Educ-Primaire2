export type ClassInput = { name: string; gradeLevelId: string; room?: string };
export type StudentInput = { firstName: string; lastName: string; email?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function validateClass(input: ClassInput): ClassInput {
  const name = clean(input.name); const room = clean(input.room ?? "");
  if (name.length < 2 || name.length > 80) throw new Error("Le nom de la classe doit contenir entre 2 et 80 caractères.");
  if (!UUID.test(input.gradeLevelId)) throw new Error("Sélectionnez un niveau valide.");
  if (room.length > 40) throw new Error("La salle ne peut pas dépasser 40 caractères.");
  return { name, gradeLevelId: input.gradeLevelId, room };
}

export function validateStudent(input: StudentInput): StudentInput {
  const firstName = clean(input.firstName); const lastName = clean(input.lastName); const email = clean(input.email ?? "").toLowerCase();
  if (firstName.length < 2 || firstName.length > 60) throw new Error("Le prénom doit contenir entre 2 et 60 caractères.");
  if (lastName.length < 2 || lastName.length > 60) throw new Error("Le nom doit contenir entre 2 et 60 caractères.");
  if (email && !EMAIL.test(email)) throw new Error("L’adresse e-mail est invalide.");
  return { firstName, lastName, email };
}
