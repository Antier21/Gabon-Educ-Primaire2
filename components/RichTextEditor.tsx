"use client";

import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading,
  Link2,
  Palette,
  Eraser,
} from "lucide-react";
import { sanitizeRichText } from "@/lib/lesson-book/rich-text";

/**
 * L'éditeur du contenu de séance.
 *
 * Il ne vise pas la barre d'outils complète d'un traitement de texte : dans un
 * cahier de textes, on écrit des paragraphes, des listes d'exercices, un
 * sous-titre, et l'on met en évidence la notion du jour. Sept boutons y
 * suffisent, et chacun de plus serait un bouton que personne n'utilise et
 * qu'il faudrait pourtant maintenir.
 *
 * Trois choix méritent d'être expliqués.
 *
 * **La zone n'est pas contrôlée par React.** Un champ « contentEditable »
 * réécrit à chaque frappe replacerait le curseur au début du texte à chaque
 * lettre. Le contenu initial est donc posé une fois, puis la zone vit sa vie
 * et prévient le parent à chaque modification.
 *
 * **« execCommand » est officiellement obsolète**, et pourtant employé ici. Sa
 * remplaçante n'existe pas : aucune interface normalisée ne permet aujourd'hui
 * de mettre en gras une sélection dans un champ éditable. Tous les navigateurs
 * la maintiennent, faute de mieux. Le jour où elle disparaîtra, seul ce
 * fichier sera à réécrire.
 *
 * **Le filtre passe à chaque modification.** Un collage depuis Word ou depuis
 * une page web apporte des balises entières, des styles, parfois des scripts.
 * Filtrer au moment du collage plutôt qu'à l'enregistrement seul évite que
 * l'enseignant ne voie à l'écran une mise en forme qui disparaîtra ensuite.
 */

const COULEURS = [
  { valeur: "#111111", nom: "Noir" },
  { valeur: "#08734f", nom: "Vert" },
  { valeur: "#9a3412", nom: "Rouge" },
  { valeur: "#1d4ed8", nom: "Bleu" },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Contenu de la séance…",
  ariaLabel = "Contenu de la séance",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const zone = useRef<HTMLDivElement>(null);
  /** La dernière valeur émise, pour ne pas réécrire la zone sous le curseur. */
  const derniere = useRef<string>("");

  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    // On ne réécrit que si la valeur vient d'ailleurs — changement de séance,
    // chargement — et non si elle nous revient de notre propre frappe.
    if (value === derniere.current) return;
    element.innerHTML = sanitizeRichText(value);
    derniere.current = value;
  }, [value]);

  function emettre() {
    const element = zone.current;
    if (!element) return;
    const propre = sanitizeRichText(element.innerHTML);
    derniere.current = propre;
    onChange(propre);
  }

  function commande(nom: string, valeur?: string) {
    zone.current?.focus();
    // La commande s'applique à la sélection courante ; sans le focus rendu
    // d'abord à la zone, elle s'appliquerait au bouton qu'on vient de cliquer.
    document.execCommand(nom, false, valeur);
    emettre();
  }

  function poserLien() {
    const url = window.prompt("Adresse du lien (https://…)");
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      window.alert("Seules les adresses commençant par http:// ou https:// sont acceptées.");
      return;
    }
    commande("createLink", url);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Mise en forme">
        <button type="button" onClick={() => commande("bold")} title="Gras" aria-label="Gras">
          <Bold />
        </button>
        <button type="button" onClick={() => commande("italic")} title="Italique" aria-label="Italique">
          <Italic />
        </button>
        <button
          type="button"
          onClick={() => commande("underline")}
          title="Souligné"
          aria-label="Souligné"
        >
          <Underline />
        </button>
        <span className="rte-sep" aria-hidden="true" />
        <button
          type="button"
          onClick={() => commande("insertUnorderedList")}
          title="Liste à puces"
          aria-label="Liste à puces"
        >
          <List />
        </button>
        <button
          type="button"
          onClick={() => commande("insertOrderedList")}
          title="Liste numérotée"
          aria-label="Liste numérotée"
        >
          <ListOrdered />
        </button>
        <button
          type="button"
          onClick={() => commande("formatBlock", "<h3>")}
          title="Sous-titre"
          aria-label="Sous-titre"
        >
          <Heading />
        </button>
        <span className="rte-sep" aria-hidden="true" />
        <span className="rte-colors">
          <Palette aria-hidden="true" />
          {COULEURS.map((couleur) => (
            <button
              key={couleur.valeur}
              type="button"
              className="rte-color"
              style={{ background: couleur.valeur }}
              title={couleur.nom}
              aria-label={`Couleur ${couleur.nom}`}
              onClick={() => commande("foreColor", couleur.valeur)}
            />
          ))}
        </span>
        <button type="button" onClick={poserLien} title="Lien" aria-label="Insérer un lien">
          <Link2 />
        </button>
        <button
          type="button"
          onClick={() => commande("removeFormat")}
          title="Retirer la mise en forme"
          aria-label="Retirer la mise en forme"
        >
          <Eraser />
        </button>
      </div>

      {/*
        « suppressContentEditableWarning » : React avertit lorsqu'on rend
        modifiable un élément dont il gère les enfants. C'est ici voulu — c'est
        le navigateur qui édite, pas React.
      */}
      <div
        ref={zone}
        className="rte-zone"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emettre}
        onBlur={emettre}
        onPaste={(event) => {
          /*
           * Un collage depuis Word ou une page web apporte des balises
           * entières et parfois des scripts. On prend le texte brut et on le
           * pose nous-mêmes : la mise en forme d'origine est perdue, mais
           * elle ne survivrait pas au filtre de toute façon — autant que
           * l'enseignant le constate tout de suite plutôt qu'après
           * enregistrement.
           */
          event.preventDefault();
          const texte = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, texte);
          emettre();
        }}
      />
    </div>
  );
}
