#!/usr/bin/env node
// Lager PDF av et Markdown-dokument i docs/, med Chromium og ingenting
// annet. Kjores for hand:
//
//     node verktoy/lag-pdf.mjs                      # docs/kampdag-flyt.md
//     node verktoy/lag-pdf.mjs docs/annen-fil.md    # en annen
//     node verktoy/lag-pdf.mjs docs/fil.md --sideskift   # ny side per ##
//
// PDF-en legges ved siden av kilden, med samme navn. Bilder lenkes
// relativt til dokumentet (`bilder/…`), som i GitHub-visningen.
//
// Oversettelsen fra Markdown er med vilje liten: overskrifter, avsnitt,
// lister, tabeller, bilder, fet, kursiv, kode og lenker. Det er alt
// dokumentene bruker, og en pakke for resten ville vaert prosjektets
// forste npm-avhengighet — for a lage et vedlegg.

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const kjorProsess = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
// `--sideskift` gir en ny side per `##`. Det er et valg per dokument, ikke
// en stil for alle: et sammendrag som kampdag-flyt skal flyte, mens et
// opplaeringshefte leses avsnitt for avsnitt — og da er luften nederst pa
// sida en marg framfor et hull.
const sideskift = argv.includes("--sideskift");
const kilde = resolve(argv.find((a) => !a.startsWith("--")) ||
                      join(root, "docs", "kampdag-flyt.md"));
const mal = kilde.replace(/\.md$/, ".pdf");

// Samme liste som test/run.mjs, sa det som kjorer testene lager PDF-en.
const KANDIDATER = [
  process.env.CHROME,
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = KANDIDATER.find((p) => existsSync(p));
if (!CHROME) {
  console.error("Fant ingen Chromium. Sett CHROME til en kjorbar nettleser.");
  process.exit(2);
}

/* ---------------- Markdown -> HTML ---------------- */

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline: kode forst, sa den ikke far fet og lenker inni seg.
function inline(s) {
  const koder = [];
  s = esc(s).replace(/`([^`]+)`/g, (_, k) => {
    koder.push("<code>" + k + "</code>");
    return "\u0000" + (koder.length - 1) + "\u0000";
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => koder[Number(i)]);
}

function tilHtml(md) {
  const linjer = md.split("\n");
  const ut = [];
  let i = 0;

  const erTabell = (l) => /^\|.*\|\s*$/.test(l);
  const erListe = (l) => /^(-|\d+\.)\s/.test(l);

  while (i < linjer.length) {
    const l = linjer[i];

    if (!l.trim()) { i++; continue; }

    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const n = h[1].length;
      ut.push("<h" + n + ">" + inline(h[2]) + "</h" + n + ">");
      i++; continue;
    }

    if (/^---+\s*$/.test(l)) { ut.push("<hr>"); i++; continue; }

    const bilde = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (bilde) {
      ut.push('<figure><img alt="' + esc(bilde[1]) + '" src="' + esc(bilde[2]) + '">' +
              "<figcaption>" + esc(bilde[1]) + "</figcaption></figure>");
      i++; continue;
    }

    if (erTabell(l)) {
      const rader = [];
      while (i < linjer.length && erTabell(linjer[i])) rader.push(linjer[i++]);
      const celler = (r) => r.trim().slice(1, -1).split("|").map((c) => c.trim());
      const hode = celler(rader[0]);
      const kropp = rader.slice(2).map(celler);
      ut.push("<table><thead><tr>" + hode.map((c) => "<th>" + inline(c) + "</th>").join("") +
              "</tr></thead><tbody>" +
              kropp.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") +
              "</tbody></table>");
      continue;
    }

    if (erListe(l)) {
      const nummerert = /^\d+\./.test(l);
      const punkter = [];
      while (i < linjer.length && erListe(linjer[i])) {
        let tekst = linjer[i].replace(/^(-|\d+\.)\s+/, "");
        i++;
        // Fortsettelseslinjer er innrykket.
        while (i < linjer.length && /^\s{2,}\S/.test(linjer[i])) tekst += " " + linjer[i++].trim();
        punkter.push("<li>" + inline(tekst) + "</li>");
      }
      const tag = nummerert ? "ol" : "ul";
      ut.push("<" + tag + ">" + punkter.join("") + "</" + tag + ">");
      continue;
    }

    if (l.startsWith("> ")) {
      const deler = [];
      while (i < linjer.length && linjer[i].startsWith(">")) deler.push(linjer[i++].replace(/^>\s?/, ""));
      ut.push("<blockquote>" + inline(deler.join(" ")) + "</blockquote>");
      continue;
    }

    // Avsnitt: linjer fram til neste tomme eller neste blokk.
    const deler = [];
    while (i < linjer.length && linjer[i].trim() && !/^#{1,3}\s/.test(linjer[i]) &&
           !erTabell(linjer[i]) && !erListe(linjer[i]) && !/^!\[/.test(linjer[i])) {
      deler.push(linjer[i++].trim());
    }
    ut.push("<p>" + inline(deler.join(" ")) + "</p>");
  }
  return ut.join("\n");
}

const STIL = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  html { font-size: 10.5pt; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1b1f2a; line-height: 1.45; max-width: 100%; margin: 0; }
  h1 { font-size: 22pt; line-height: 1.2; margin: 0 0 6mm; color: #14245c; }
  h2 { font-size: 15pt; margin: 9mm 0 3mm; color: #14245c; page-break-after: avoid;
       border-bottom: 1px solid #c9d0e6; padding-bottom: 1mm; }
  h3 { font-size: 12pt; margin: 6mm 0 2mm; color: #1b1f2a; page-break-after: avoid; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }
  code { font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 0.92em;
         background: #eef1f8; padding: 0 3px; border-radius: 3px; }
  a { color: #1f4fd6; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; font-size: 9.5pt;
          page-break-inside: auto; }
  th, td { border: 1px solid #d5dae8; padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
  th { background: #eef1f8; }
  tr { page-break-inside: avoid; }
  figure { margin: 3mm auto 5mm; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 78mm; max-height: 200mm; border: 1px solid #d5dae8; border-radius: 4mm; }
  /* Skjermbildene er telefonformat, og 78 mm er en telefon. Et diagram er
     ikke det: presset ned i samme bredde blir en boks med seks ord i
     uleselig. SVG-ene i docs/bilder/ er tegninger, ikke skjermbilder, og
     de bar sin egen ramme fra for — sa de far tekstbredden og ingen
     ramme rundt ramma. */
  figure img[src$=".svg"] { max-width: 100%; border: 0; border-radius: 0; }
  figcaption { font-size: 8.5pt; color: #5a6074; margin-top: 1.5mm; max-width: 120mm;
               margin-left: auto; margin-right: auto; }
  blockquote { border-left: 3px solid #c9d0e6; margin: 0 0 3mm; padding: 1mm 0 1mm 4mm; color: #3a4054; }
  hr { border: 0; border-top: 1px solid #c9d0e6; margin: 6mm 0; }
`;

const md = readFileSync(kilde, "utf8");
const tittel = (md.match(/^#\s+(.*)$/m) || [, basename(kilde)])[1];
const SIDESKIFT = "\n  h2 { page-break-before: always; }\n" +
  "  body > h2:first-of-type { page-break-before: auto; }\n";

const html = '<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>' +
  esc(tittel) + "</title><style>" + STIL + (sideskift ? SIDESKIFT : "") +
  "</style></head><body>" +
  '<base href="' + pathToFileURL(dirname(kilde) + "/").href + '">' +
  tilHtml(md) + "</body></html>";

const mappe = mkdtempSync(join(tmpdir(), "sb-pdf-"));
const side = join(mappe, "side.html");
writeFileSync(side, html);

await kjorProsess(CHROME, [
  "--headless=new", "--no-sandbox", "--disable-gpu",
  "--no-pdf-header-footer", "--print-to-pdf=" + mal,
  pathToFileURL(side).href,
], { maxBuffer: 16e6 });

console.log("Skrev " + mal);
