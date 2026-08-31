"use client";

import Link from "next/link";
import { Printer, Settings2 } from "lucide-react";
import { useState } from "react";

type PrintContext = {
  className: string;
  period: string;
  subject: string;
  generatedAt: string;
};

function selectedLabel(...prefixes: string[]) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>(".gradebook-print-page label"));
  const label = labels.find((item) => {
    const text = item.textContent?.trim() || "";
    return prefixes.some((prefix) => text.startsWith(prefix));
  });
  const select = label?.querySelector<HTMLSelectElement>("select");
  return select?.selectedOptions[0]?.textContent?.trim() || "Non précisé";
}

export function NotesRegisterPrintButton() {
  const [context, setContext] = useState<PrintContext>({
    className: "Classe",
    period: "Période",
    subject: "Toutes les matières",
    generatedAt: "",
  });

  function printRegister() {
    const table = document.querySelector<HTMLTableElement>(
      '.gradebook-print-page table:has(button[title^="Sélectionner cette évaluation"])',
    );
    const target = table?.parentElement?.parentElement;

    if (!table || !target) {
      window.alert("Sélectionnez une classe et une période contenant au moins une évaluation avant d’imprimer le relevé.");
      return;
    }

    setContext({
      className: selectedLabel("Classe"),
      period: selectedLabel("Période"),
      subject: selectedLabel("Matière", "Domaine"),
      generatedAt: new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date()),
    });

    target.classList.add("notes-print-target");
    document.body.classList.add("printing-notes-register");

    const cleanup = () => {
      target.classList.remove("notes-print-target");
      document.body.classList.remove("printing-notes-register");
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1000);
    }, 80);
  }

  return (
    <>
      <div className="notes-register-print-action">
        <Link href="/gabon-educ/notes/parametres" title="Paramètres du relevé de notes">
          <Settings2 aria-hidden="true" />
          Paramètres
        </Link>
        <button type="button" onClick={printRegister} title="Imprimer le relevé ou l’enregistrer au format PDF">
          <Printer aria-hidden="true" />
          Imprimer / PDF
        </button>
      </div>
      <header className="notes-register-print-header" aria-hidden="true">
        <div>
          <strong>Gabon Éduc+ Primaire</strong>
          <span>Relevé de notes</span>
        </div>
        <h1>RELEVÉ DE NOTES</h1>
        <dl>
          <div><dt>Classe</dt><dd>{context.className}</dd></div>
          <div><dt>Période</dt><dd>{context.period}</dd></div>
          <div><dt>Matière / domaine</dt><dd>{context.subject}</dd></div>
          <div><dt>Édité le</dt><dd>{context.generatedAt}</dd></div>
        </dl>
      </header>
    </>
  );
}
