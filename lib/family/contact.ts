/**
 * Coordonnées du responsable, modifiables par lui-même.
 *
 * La validation est ici en double : dans la fonction SQL, qui fait autorité, et
 * dans ce module, qui répond au parent sans aller-retour réseau. La seconde ne
 * remplace pas la première — un contrôle qui ne vit que dans le navigateur ne
 * protège rien — mais elle évite qu'un parent en zone de mauvaise couverture
 * attende dix secondes pour s'entendre dire qu'il manque un chiffre.
 */

export type GuardianContact = {
  phone: string;
  email: string;
  address: string;
};

/**
 * Le numéro tel qu'il sera stocké.
 *
 * Les parents écrivent « 077 03 77 07 », « +241 77037707 », « 077-03-77-07 ».
 * Trois écritures, une seule ligne téléphonique : sans normalisation, les
 * envois WhatsApp partent vers un numéro que l'opérateur ne reconnaît pas et
 * échouent sans que personne ne s'en aperçoive.
 */
export function normalizePhone(value: string): string {
  return String(value || "").replace(/[^0-9+]/g, "");
}

/** Compte les chiffres seuls, l'indicatif « + » ne comptant pas. */
function digitCount(value: string) {
  return normalizePhone(value).replace(/[^0-9]/g, "").length;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Renvoie le message d'erreur à afficher, ou une chaîne vide si tout va bien.
 *
 * Le message dit ce qui manque, pas « saisie invalide » : un parent qui lit
 * « il manque un chiffre » corrige, un parent qui lit « invalide » abandonne.
 */
export function validateContact(contact: GuardianContact): string {
  if (digitCount(contact.phone) < 8)
    return "Le numéro de téléphone doit comporter au moins 8 chiffres.";
  const email = contact.email.trim();
  if (email && !EMAIL.test(email))
    return "L’adresse électronique saisie n’est pas valide.";
  return "";
}

/** Ce qui sera transmis à la base, une fois nettoyé. */
export function cleanContact(contact: GuardianContact): GuardianContact {
  return {
    phone: normalizePhone(contact.phone),
    email: contact.email.trim(),
    address: contact.address.trim(),
  };
}

/**
 * Vrai si rien n'a changé.
 *
 * Enregistrer une fiche identique ferait avancer sa date de mise à jour et
 * la ferait remonter comme « récemment modifiée » dans le suivi du
 * secrétariat, pour rien.
 */
export function isUnchanged(a: GuardianContact, b: GuardianContact): boolean {
  const left = cleanContact(a);
  const right = cleanContact(b);
  return (
    left.phone === right.phone &&
    left.email === right.email &&
    left.address === right.address
  );
}
