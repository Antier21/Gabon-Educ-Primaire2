"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading,
  Highlighter,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Omega,
  Palette,
  Outdent,
  Redo2,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from "lucide-react";
import { sanitizeRichText } from "@/lib/lesson-book/rich-text";

/**
 * L'éditeur du contenu de séance.
 *
 * Trois choix méritent d'être expliqués.
 *
 * **La zone n'est pas contrôlée par React.** Un champ « contentEditable »
 * réécrit à chaque frappe replacerait le curseur au début du texte à chaque
 * lettre. Le contenu initial est posé une fois, puis la zone vit sa vie et
 * prévient le parent à chaque modification.
 *
 * **« execCommand » est officiellement obsolète**, et pourtant employé ici. Sa
 * remplaçante n'existe pas : aucune interface normalisée ne permet aujourd'hui
 * de mettre en gras une sélection dans un champ éditable. Tous les navigateurs
 * la maintiennent, faute de mieux. Le jour où elle disparaîtra, seul ce fichier
 * sera à réécrire.
 *
 * **Le filtre passe à chaque modification.** Un collage apporte des balises
 * entières, des styles, parfois des scripts. Filtrer au moment du collage
 * plutôt qu'à l'enregistrement seul évite que l'enseignant ne voie à l'écran
 * une mise en forme qui disparaîtra ensuite.
 */

const COULEURS = [
  { valeur: "#111111", nom: "Noir" },
  { valeur: "#08734f", nom: "Vert" },
  { valeur: "#9a3412", nom: "Rouge" },
  { valeur: "#1d4ed8", nom: "Bleu" },
];

const SURLIGNAGES = [
  { valeur: "#fde68a", nom: "Jaune" },
  { valeur: "#bbf7d0", nom: "Vert clair" },
  { valeur: "#bfdbfe", nom: "Bleu clair" },
  { valeur: "transparent", nom: "Aucun" },
];

/**
 * Les caractères qu'un clavier gabonais ne donne pas facilement.
 *
 * Ce n'est pas un ornement : les postes des établissements portent des claviers
 * QWERTY aussi souvent qu'AZERTY, et un professeur de français y perd ses
 * guillemets, ses ligatures et ses majuscules accentuées. « Elève » au lieu de
 * « Élève » dans un cahier de textes officiel se remarque.
 */
const CARACTERES = [
  "«", "»", "—", "–", "…", "’",
  "œ", "Œ", "æ", "Æ", "ç", "Ç",
  "É", "È", "Ê", "Ë", "À", "Â",
  "Î", "Ï", "Ô", "Û", "Ù", "Ÿ",
  "°", "×", "÷", "≤", "≥", "≠",
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
  const [palette, setPalette] = useState<"" | "couleur" | "surlignage" | "caracteres">("");

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
    setPalette("");
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

  /** Un bouton d'outil, pour ne pas répéter dix fois la même déclaration. */
  function Outil({
    icone: Icone,
    titre,
    action,
  }: {
    icone: typeof Bold;
    titre: string;
    action: () => void;
  }) {
    return (
      <button type="button" onClick={action} title={titre} aria-label={titre}>
        <Icone />
      </button>
    );
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Mise en forme">
        <Outil icone={Undo2} titre="Annuler" action={() => commande("undo")} />
        <Outil icone={Redo2} titre="Rétablir" action={() => commande("redo")} />
        <span className="rte-sep" aria-hidden="true" />

        <Outil icone={Bold} titre="Gras" action={() => commande("bold")} />
        <Outil icone={Italic} titre="Italique" action={() => commande("italic")} />
        <Outil icone={Underline} titre="Souligné" action={() => commande("underline")} />
        <Outil icone={Superscript} titre="Exposant" action={() => commande("superscript")} />
        <Outil icone={Subscript} titre="Indice" action={() => commande("subscript")} />
        <span className="rte-sep" aria-hidden="true" />

        <Outil icone={Heading} titre="Sous-titre" action={() => commande("formatBlock", "<h3>")} />
        <Outil icone={List} titre="Liste à puces" action={() => commande("insertUnorderedList")} />
        <Outil icone={ListOrdered} titre="Liste numérotée" action={() => commande("insertOrderedList")} />
        <Outil icone={Indent} titre="Augmenter le retrait" action={() => commande("indent")} />
        <Outil icone={Outdent} titre="Diminuer le retrait" action={() => commande("outdent")} />
        <span className="rte-sep" aria-hidden="true" />

        <Outil icone={AlignLeft} titre="Aligner à gauche" action={() => commande("justifyLeft")} />
        <Outil icone={AlignCenter} titre="Centrer" action={() => commande("justifyCenter")} />
        <Outil icone={AlignRight} titre="Aligner à droite" action={() => commande("justifyRight")} />
        <Outil icone={AlignJustify} titre="Justifier" action={() => commande("justifyFull")} />
        <span className="rte-sep" aria-hidden="true" />

        {/*
          Les palettes s'ouvrent une à la fois : deux ouvertes ensemble se
          recouvriraient, et l'enseignant cliquerait au hasard.
        */}
        <span className="rte-pop">
          <button
            type="button"
            title="Couleur du texte"
            aria-label="Couleur du texte"
            onClick={() => setPalette((p) => (p === "couleur" ? "" : "couleur"))}
          >
            <Palette />
          </button>
          {palette === "couleur" && (
            <span className="rte-panel">
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
          )}
        </span>

        <span className="rte-pop">
          <button
            type="button"
            title="Surligner"
            aria-label="Surligner"
            onClick={() => setPalette((p) => (p === "surlignage" ? "" : "surlignage"))}
          >
            <Highlighter />
          </button>
          {palette === "surlignage" && (
            <span className="rte-panel">
              {SURLIGNAGES.map((teinte) => (
                <button
                  key={teinte.valeur}
                  type="button"
                  className="rte-color"
                  style={{
                    background: teinte.valeur,
                    borderStyle: teinte.valeur === "transparent" ? "dashed" : "solid",
                  }}
                  title={teinte.nom}
                  aria-label={`Surlignage ${teinte.nom}`}
                  // « hiliteColor » est le nom retenu par les navigateurs ;
                  // « backColor » colorerait le bloc entier sur certains.
                  onClick={() => commande("hiliteColor", teinte.valeur)}
                />
              ))}
            </span>
          )}
        </span>

        <span className="rte-pop">
          <button
            type="button"
            title="Caractères spéciaux"
            aria-label="Caractères spéciaux"
            onClick={() => setPalette((p) => (p === "caracteres" ? "" : "caracteres"))}
          >
            <Omega />
          </button>
          {palette === "caracteres" && (
            <span className="rte-panel rte-chars">
              {CARACTERES.map((caractere) => (
                <button
                  key={caractere}
                  type="button"
                  title={caractere}
                  onClick={() => commande("insertText", caractere)}
                >
                  {caractere}
                </button>
              ))}
            </span>
          )}
        </span>

        <span className="rte-sep" aria-hidden="true" />
        <Outil icone={Link2} titre="Insérer un lien" action={poserLien} />
        <Outil
          icone={Minus}
          titre="Trait de séparation"
          action={() => commande("insertHorizontalRule")}
        />
        <Outil
          icone={Eraser}
          titre="Retirer la mise en forme"
          action={() => commande("removeFormat")}
        />
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
        onFocus={() => setPalette("")}
        onPaste={(event) => {
          /*
           * Un collage depuis Word ou une page web apporte des balises
           * entières et parfois des scripts. On prend le texte brut et on le
           * pose nous-mêmes : la mise en forme d'origine est perdue, mais elle
           * ne survivrait pas au filtre de toute façon — autant que
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
