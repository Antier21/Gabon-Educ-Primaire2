export type CourseInput = {
  subject: string;
  grade: string;
  classGroup: string;
  week: number;
  duration: number;
  title: string;
  level: string;
  guidance?: string;
};

export type CourseStep = {
  id: string;
  title: string;
  duration: number;
  teacher: string;
  students: string;
};

export type GeneratedCourse = {
  subject: string;
  grade: string;
  classGroup: string;
  week: number;
  title: string;
  duration: number;
  competency: string;
  objective: string;
  prerequisite: string;
  situationProblem: string;
  material: string;
  summary: string;
  differentiation: string;
  homework: string;
  status: "draft";
  steps: CourseStep[];
  engineVersion: "6.2";
  pedagogicalModel: string;
};

type SubjectProfile = {
  model: string;
  competency: (input: CourseInput) => string;
  objective: (input: CourseInput) => string;
  prerequisite: (input: CourseInput) => string;
  situation: (input: CourseInput) => string;
  material: (input: CourseInput) => string;
  summary: (input: CourseInput) => string;
  homework: (input: CourseInput) => string;
  phases: [string, string, string, string];
  teacherActions: [string, string, string, string];
  studentActions: [string, string, string, string];
};

const q = (text: string) => `« ${text} »`;

const common = {
  differentiation(input: CourseInput) {
    if (input.level === "En difficulté") {
      return "Prévoir des consignes courtes, un exemple entièrement guidé, des supports visuels, des binômes d’entraide et une activité de remédiation immédiate.";
    }
    if (input.level === "Avancé") {
      return "Prévoir une tâche d’approfondissement, une justification plus exigeante et une production autonome pour les élèves rapides, tout en maintenant une aide graduée pour les autres.";
    }
    return "Prévoir une aide graduée, des groupes de besoin, un exemple supplémentaire pour les élèves fragiles et une tâche d’approfondissement pour les plus rapides.";
  },
};

const profiles: Record<string, SubjectProfile> = {
  Français: {
    model: "Observation linguistique, manipulation, formulation de la règle et réemploi",
    competency: i => `Mobiliser les ressources de la langue française pour comprendre, expliquer et employer correctement ${q(i.title)} dans une situation de communication adaptée au niveau ${i.grade}.`,
    objective: i => `À la fin de la séance, l’élève sera capable d’identifier les caractéristiques de ${q(i.title)}, d’en formuler la règle et de la réutiliser correctement dans une production courte.`,
    prerequisite: () => "Maîtrise du vocabulaire grammatical de base, lecture d’un court support et capacité à relever, classer et comparer des formes linguistiques.",
    situation: i => `À partir d’un court texte lié à la vie quotidienne ou scolaire au Gabon, les élèves constatent plusieurs emplois de ${q(i.title)}. Ils doivent expliquer ces emplois, proposer une règle et corriger une production comportant des erreurs.`,
    material: () => "Texte support, tableau, cahiers, manuel, étiquettes-mots ou phrases à manipuler et fiche d’exercices.",
    summary: i => `${q(i.title)} se reconnaît grâce à des indices précis. Pour l’utiliser correctement, on observe le contexte, on applique la règle construite en classe, puis on vérifie l’accord, la forme ou le sens obtenu.`,
    homework: i => `Relire la trace écrite, relever trois exemples de ${q(i.title)} dans un texte et rédiger cinq phrases d’application.`,
    phases: ["Mise en situation et lecture", "Observation et manipulation", "Institutionnalisation", "Réemploi et évaluation formative"],
    teacherActions: [
      "Présente un texte bref, fait lire et attire l’attention sur les formes utiles sans annoncer immédiatement la règle.",
      "Fait relever, classer, transformer et comparer les exemples ; guide la formulation des hypothèses.",
      "Organise la mise en commun, corrige les imprécisions et fait formuler une règle claire avec des exemples.",
      "Propose des exercices gradués puis une courte production ; observe les erreurs et conduit la remédiation."
    ],
    studentActions: [
      "Lisent, repèrent les éléments significatifs et expriment leurs premières observations.",
      "Manipulent les phrases, comparent les formes, justifient leurs classements et confrontent leurs hypothèses.",
      "Reformulent la règle, donnent des exemples et copient la trace écrite validée.",
      "Appliquent la règle, produisent des phrases ou un court texte et corrigent leurs erreurs."
    ]
  },
  Mathématiques: {
    model: "Situation-problème, recherche, mise en commun, formalisation et entraînement",
    competency: i => `Résoudre une situation-problème en mobilisant les notions, propriétés et procédures relatives à ${q(i.title)} au niveau ${i.grade}.`,
    objective: i => `À la fin de la séance, l’élève sera capable de choisir et d’appliquer une procédure correcte concernant ${q(i.title)}, puis de justifier son résultat.`,
    prerequisite: () => "Lecture d’un énoncé, calculs de base, maîtrise des symboles utiles et capacité à expliquer une démarche.",
    situation: i => `Les élèves doivent résoudre un problème concret de mesure, de partage, de déplacement ou de gestion dans lequel ${q(i.title)} est indispensable. Plusieurs démarches sont possibles et doivent être comparées.`,
    material: () => "Énoncé-problème, tableau, cahiers, instruments de géométrie ou matériel de manipulation selon la notion, calculatrice si elle est autorisée.",
    summary: i => `Pour traiter ${q(i.title)}, il faut identifier les données utiles, choisir la propriété ou la procédure adaptée, effectuer les opérations avec rigueur puis vérifier la cohérence du résultat.`,
    homework: i => `Résoudre deux exercices d’application sur ${q(i.title)} et rédiger clairement chaque étape du raisonnement.`,
    phases: ["Dévolution du problème", "Recherche individuelle ou en groupes", "Mise en commun et formalisation", "Entraînement et contrôle"],
    teacherActions: [
      "Présente une situation sans donner la méthode et vérifie la compréhension de la consigne.",
      "Observe les stratégies, questionne sans résoudre à la place des élèves et fournit des indices gradués.",
      "Fait comparer les démarches, valide les procédures efficaces et formalise la propriété ou l’algorithme.",
      "Propose des exercices gradués, fait verbaliser les étapes et organise une correction raisonnée."
    ],
    studentActions: [
      "Reformulent le problème, repèrent les données et anticipent une stratégie.",
      "Testent des procédures, calculent, représentent et justifient leurs choix.",
      "Présentent leurs démarches, discutent les erreurs et notent la méthode validée.",
      "Résolvent de nouvelles situations, vérifient les résultats et corrigent les procédures."
    ]
  },
  "Physique-Chimie": {
    model: "Questionnement scientifique, hypothèses, expérimentation, interprétation et loi",
    competency: i => `Mettre en œuvre une démarche scientifique pour expliquer un phénomène lié à ${q(i.title)} et exploiter correctement les résultats obtenus.`,
    objective: i => `À la fin de la séance, l’élève sera capable de formuler une hypothèse, d’exploiter une observation ou une mesure et d’énoncer la relation essentielle concernant ${q(i.title)}.`,
    prerequisite: () => "Lecture d’un schéma ou d’un tableau de mesures, respect des consignes de sécurité et maîtrise des grandeurs ou symboles déjà étudiés.",
    situation: i => `Un phénomène observable dans l’environnement quotidien pose problème : les élèves doivent expliquer ce qui se passe en mobilisant ${q(i.title)}, puis confronter leurs hypothèses à une expérience ou à des données.`,
    material: () => "Matériel expérimental disponible, fiche de protocole, instruments de mesure, tableau, schémas et consignes de sécurité.",
    summary: i => `L’étude de ${q(i.title)} repose sur l’observation, la mesure et l’interprétation. Une conclusion scientifique doit être reliée aux résultats et formulée avec les unités, symboles et conditions appropriés.`,
    homework: i => `Expliquer un phénomène simple faisant intervenir ${q(i.title)} et résoudre un exercice d’exploitation de données.`,
    phases: ["Problème scientifique", "Hypothèses et protocole", "Résultats et interprétation", "Conclusion et application"],
    teacherActions: [
      "Présente le phénomène, fait préciser la question scientifique et rappelle les règles de sécurité.",
      "Recueille les hypothèses, aide à construire le protocole et contrôle la manipulation.",
      "Fait organiser les résultats, comparer les hypothèses et distinguer observation et interprétation.",
      "Formalise la loi ou le modèle et propose une situation d’application."
    ],
    studentActions: [
      "Observent, décrivent le phénomène et formulent la question à résoudre.",
      "Émettent des hypothèses, préparent ou suivent le protocole et réalisent les mesures.",
      "Présentent les résultats, les interprètent et valident ou rejettent les hypothèses.",
      "Formulent la conclusion, utilisent le vocabulaire scientifique et appliquent la relation étudiée."
    ]
  },
  SVT: {
    model: "Observation du vivant, problème biologique, investigation documentaire ou expérimentale et bilan",
    competency: i => `Exploiter des observations, documents ou expériences pour expliquer un mécanisme biologique relatif à ${q(i.title)}.`,
    objective: i => `À la fin de la séance, l’élève sera capable d’extraire des informations, de les relier et de construire une explication scientifique de ${q(i.title)}.`,
    prerequisite: () => "Observation méthodique, lecture de schémas ou tableaux et usage du vocabulaire biologique déjà acquis.",
    situation: i => `Une observation portant sur la santé, le corps humain, les êtres vivants ou l’environnement amène les élèves à s’interroger sur ${q(i.title)}. Ils doivent analyser des preuves pour proposer une explication.`,
    material: () => "Documents scientifiques, photographies, schémas, échantillons ou matériel d’observation, tableau et fiche d’investigation.",
    summary: i => `${q(i.title)} s’explique par la mise en relation de structures, de fonctions et de conditions du milieu. Une réponse scientifique s’appuie sur des observations vérifiables et un schéma fonctionnel si nécessaire.`,
    homework: i => `Réaliser un schéma légendé ou une synthèse courte expliquant ${q(i.title)} à partir des éléments étudiés.`,
    phases: ["Observation et question biologique", "Investigation", "Mise en relation des résultats", "Bilan scientifique et transfert"],
    teacherActions: [
      "Présente une observation ou un document déclencheur et conduit la formulation du problème biologique.",
      "Organise l’exploitation de documents, l’observation ou l’expérience et aide à sélectionner les informations pertinentes.",
      "Fait confronter les résultats, construire un schéma explicatif et corriger les liens erronés.",
      "Conduit la rédaction du bilan et propose une nouvelle situation de santé ou d’environnement."
    ],
    studentActions: [
      "Décrivent les faits observés et formulent une question biologique.",
      "Recherchent des indices, observent, classent et extraient les informations utiles.",
      "Relient les données, construisent une explication et réalisent un schéma fonctionnel.",
      "Rédigent le bilan, utilisent le vocabulaire scientifique et transfèrent l’acquis."
    ]
  },
  Histoire: {
    model: "Étude critique de documents, contextualisation, mise en récit et repères chronologiques",
    competency: i => `Analyser des documents historiques pour expliquer ${q(i.title)}, situer les faits dans le temps et construire un récit argumenté.`,
    objective: i => `À la fin de la séance, l’élève sera capable d’identifier les acteurs, les causes, les faits majeurs et les conséquences liés à ${q(i.title)}.`,
    prerequisite: () => "Lecture d’un document, repérage chronologique, distinction entre source, fait et interprétation.",
    situation: i => `À partir de sources de nature différente, les élèves doivent reconstituer et expliquer ${q(i.title)} sans se limiter à recopier les documents.`,
    material: () => "Textes historiques, images, cartes, frise chronologique, manuel et questionnaire d’analyse.",
    summary: i => `L’étude de ${q(i.title)} exige de situer les événements, d’identifier les acteurs et d’établir des liens entre causes, déroulement et conséquences à partir de sources confrontées.`,
    homework: i => `Construire une frise ou rédiger un paragraphe organisé présentant les éléments essentiels de ${q(i.title)}.`,
    phases: ["Contextualisation", "Analyse critique des documents", "Mise en commun et explication", "Trace historique et vérification"],
    teacherActions: [
      "Situe le thème dans le temps et l’espace, présente la question directrice et les documents.",
      "Guide l’identification, la datation, la source, le point de vue et les informations pertinentes.",
      "Fait confronter les documents et organise une explication structurée des faits.",
      "Construit la synthèse, fixe les repères et vérifie la compréhension par une question de transfert."
    ],
    studentActions: [
      "Repèrent la période, le lieu, les acteurs et formulent des hypothèses.",
      "Interrogent les sources, prélèvent les informations et distinguent faits et points de vue.",
      "Confrontent les documents, expliquent les relations de cause à conséquence et participent au récit.",
      "Notent les repères, rédigent une synthèse et répondent à une question argumentée."
    ]
  },
  Géographie: {
    model: "Étude de cas, localisation, changement d’échelle, explication spatiale et croquis",
    competency: i => `Analyser l’organisation d’un espace à travers ${q(i.title)}, localiser les phénomènes et expliquer leurs dynamiques.`,
    objective: i => `À la fin de la séance, l’élève sera capable de localiser, décrire et expliquer les principales caractéristiques spatiales liées à ${q(i.title)}.`,
    prerequisite: () => "Lecture d’une carte, usage des points cardinaux, identification d’une légende et interprétation de données simples.",
    situation: i => `Une étude de cas, de préférence liée au Gabon ou à l’Afrique centrale, met en évidence un problème d’aménagement, de population ou d’environnement associé à ${q(i.title)}.`,
    material: () => "Cartes, photographies, données statistiques, croquis, atlas ou fond de carte et manuel.",
    summary: i => `${q(i.title)} s’analyse en localisant les phénomènes, en décrivant leur répartition, puis en expliquant les acteurs, les contraintes, les ressources et les dynamiques qui organisent l’espace.`,
    homework: i => `Compléter un croquis ou rédiger un paragraphe géographique expliquant l’organisation spatiale liée à ${q(i.title)}.`,
    phases: ["Étude de cas et localisation", "Analyse des documents spatiaux", "Changement d’échelle et explication", "Croquis ou synthèse"],
    teacherActions: [
      "Présente l’espace étudié, fait localiser et pose la question géographique.",
      "Guide la lecture des cartes, images et données et fait décrire les répartitions.",
      "Conduit le changement d’échelle, fait identifier les acteurs et expliquer les dynamiques.",
      "Fait construire une synthèse ou un croquis organisé avec une légende."
    ],
    studentActions: [
      "Localisent l’espace, décrivent les premières observations et formulent des hypothèses.",
      "Lisent les documents, extraient les informations et comparent les espaces.",
      "Mettent en relation les facteurs, expliquent les dynamiques et changent d’échelle.",
      "Réalisent un croquis ou rédigent une synthèse géographique structurée."
    ]
  },
  Anglais: languageProfile("anglais"),
  Espagnol: languageProfile("espagnol"),
  Philosophie: {
    model: "Problématisation, conceptualisation, argumentation et examen critique",
    competency: i => `Construire une réflexion philosophique argumentée sur ${q(i.title)} en définissant les notions, en formulant un problème et en examinant plusieurs thèses.`,
    objective: i => `À la fin de la séance, l’élève sera capable de transformer le thème ${q(i.title)} en problème philosophique et de défendre une réponse à l’aide d’arguments et d’exemples.`,
    prerequisite: () => "Lecture attentive, distinction entre opinion et argument, capacité à définir un terme et à illustrer une idée.",
    situation: i => `Une opinion courante ou un dilemme concret relatif à ${q(i.title)} divise la classe. Les élèves doivent dépasser les réponses spontanées, préciser les notions et examiner les contradictions.`,
    material: () => "Court texte philosophique, citation, situation-problème, tableau d’arguments et cahiers.",
    summary: i => `Réfléchir à ${q(i.title)} consiste à définir les notions, mettre au jour une difficulté, confronter les thèses et justifier une position sans confondre conviction personnelle et démonstration.`,
    homework: i => `Rédiger un paragraphe argumenté répondant à une question liée à ${q(i.title)}, avec une thèse, un argument, un exemple et une objection.`,
    phases: ["Opinion initiale et problème", "Analyse des notions et du texte", "Débat argumenté", "Synthèse problématisée"],
    teacherActions: [
      "Présente un dilemme, recueille les réponses spontanées et fait apparaître leurs contradictions.",
      "Guide la définition des notions, l’analyse d’un texte et l’identification de la thèse et des arguments.",
      "Organise la confrontation raisonnée des positions et exige des justifications précises.",
      "Formalise le problème, distingue les thèses et aide à construire une conclusion nuancée."
    ],
    studentActions: [
      "Expriment leurs opinions, repèrent les désaccords et reformulent la difficulté.",
      "Définissent les notions, analysent les arguments et interrogent les présupposés.",
      "Défendent une thèse, répondent aux objections et évaluent la solidité des arguments.",
      "Rédigent une synthèse problématisée et formulent une position justifiée."
    ]
  }
};

function languageProfile(language: string): SubjectProfile {
  return {
    model: "Compréhension, repérage, interaction guidée et production communicative",
    competency: i => `Comprendre et produire un message simple en ${language} en mobilisant le lexique et les structures associés à ${q(i.title)} au niveau ${i.grade}.`,
    objective: i => `À la fin de la séance, l’élève sera capable de comprendre puis d’utiliser ${q(i.title)} dans une interaction ou une production courte en ${language}.`,
    prerequisite: () => `Connaissance du lexique courant, compréhension de consignes simples et capacité à reproduire un modèle oral ou écrit en ${language}.`,
    situation: i => `Les élèves doivent accomplir une tâche de communication réaliste — dialoguer, présenter, demander une information ou rédiger un message — en utilisant ${q(i.title)}.`,
    material: () => "Dialogue, image, court audio ou texte, cartes de rôle, tableau et fiche d’activités.",
    summary: i => `Pour utiliser ${q(i.title)} en ${language}, il faut reconnaître la structure, choisir le lexique adapté à la situation et produire un message compréhensible avec une prononciation ou une orthographe soignée.`,
    homework: i => `Préparer un mini-dialogue ou un court texte en ${language} utilisant ${q(i.title)} dans une situation de communication.`,
    phases: ["Découverte du message", "Repérage et entraînement guidé", "Interaction", "Production et retour"],
    teacherActions: [
      "Présente une situation de communication et fait écouter ou lire le support globalement.",
      "Fait repérer le lexique et les structures, modèle la prononciation et conduit des exercices courts.",
      "Organise des échanges en binômes ou groupes à partir de cartes de rôle.",
      "Propose une production autonome, observe la communication et donne un retour ciblé."
    ],
    studentActions: [
      "Écoutent ou lisent, identifient la situation et comprennent le sens global.",
      "Repèrent les formes utiles, répètent, complètent et transforment des modèles.",
      "Interagissent, posent et répondent à des questions en mobilisant les acquis.",
      "Produisent un message oral ou écrit, s’autoévaluent et améliorent leur production."
    ]
  };
}

function genericProfile(): SubjectProfile {
  return {
    model: "Situation-problème, recherche, mise en commun et réinvestissement",
    competency: i => `Mobiliser les connaissances et méthodes propres à ${i.subject} pour comprendre et réinvestir ${q(i.title)} dans une situation significative.`,
    objective: i => `À la fin de la séance, l’élève sera capable d’identifier, d’expliquer et d’utiliser correctement ${q(i.title)} dans une activité adaptée au niveau ${i.grade}.`,
    prerequisite: () => "Connaissances antérieures liées au thème, vocabulaire de base et capacité à observer, comparer et justifier une réponse.",
    situation: i => `Dans une situation proche de la vie scolaire ou quotidienne au Gabon, les élèves rencontrent un problème dans lequel ${q(i.title)} doit être compris pour proposer une réponse correcte.`,
    material: () => "Tableau, cahiers, support préparé par l’enseignant, manuel et document projeté ou imprimé selon les possibilités.",
    summary: i => `${q(i.title)} se reconnaît à ses caractéristiques essentielles. Pour l’utiliser correctement, il faut observer la situation, appliquer la méthode étudiée puis vérifier et justifier le résultat.`,
    homework: i => `Reprendre la trace écrite et réaliser un exercice d’application sur ${q(i.title)}.`,
    phases: ["Mise en situation", "Recherche et confrontation", "Institutionnalisation", "Application et évaluation formative"],
    teacherActions: [
      "Présente une situation concrète et fait émerger les représentations.",
      "Organise la recherche, questionne et anime la mise en commun.",
      "Formalise la règle ou la méthode avec la classe.",
      "Propose une tâche d’application et apporte une remédiation."
    ],
    studentActions: [
      "Observent, réagissent et identifient le problème.",
      "Cherchent, confrontent leurs réponses et justifient leurs propositions.",
      "Reformulent les acquis et notent la synthèse.",
      "Appliquent la notion et corrigent leurs erreurs."
    ]
  };
}

function splitDuration(total: number): [number, number, number, number] {
  const intro = Math.max(5, Math.round(total * 0.16));
  const research = Math.max(10, Math.round(total * 0.42));
  const formal = Math.max(5, Math.round(total * 0.2));
  return [intro, research, formal, Math.max(5, total - intro - research - formal)];
}

export function generateAPCCourse(input: CourseInput): GeneratedCourse {
  const profile = profiles[input.subject] || genericProfile();
  const durations = splitDuration(input.duration);
  const guidance = input.guidance?.trim();
  const situation = `${profile.situation(input)}${guidance ? ` Consigne particulière à intégrer : ${guidance}` : ""}`;

  return {
    subject: input.subject,
    grade: input.grade,
    classGroup: input.classGroup,
    week: Number(input.week || 1),
    title: input.title.trim(),
    duration: Number(input.duration),
    competency: profile.competency(input),
    objective: profile.objective(input),
    prerequisite: profile.prerequisite(input),
    situationProblem: situation,
    material: profile.material(input),
    summary: profile.summary(input),
    differentiation: common.differentiation(input),
    homework: profile.homework(input),
    status: "draft",
    engineVersion: "6.2",
    pedagogicalModel: profile.model,
    steps: profile.phases.map((title, index) => ({
      id: crypto.randomUUID(),
      title,
      duration: durations[index],
      teacher: profile.teacherActions[index],
      students: profile.studentActions[index],
    })),
  };
}
