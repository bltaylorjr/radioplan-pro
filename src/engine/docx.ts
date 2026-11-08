// A real Word document (.docx) from report HTML: headings, paragraphs, lists, tables and pictures.
// Opens in Microsoft Word, LibreOffice, Google Docs and Pages. Runs in the browser (uses DOMParser).
import { zip } from './gisexport';
import { xmlEsc } from './fileformats';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU = 9525; // per CSS pixel

export function htmlToDocx(title: string, html: string, landscape = false): Uint8Array {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const media: { name: string; data: Uint8Array; ext: string }[] = [];
  const pageW = landscape ? 15840 : 12240, pageH = landscape ? 12240 : 15840, margin = 1080, textPx = ((pageW - 2 * margin) / 1440) * 96;
  let pid = 1;

  const run = (text: string, o: { b?: boolean; i?: boolean; sz?: number } = {}) => text ? `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>` : '';
  const image = (img: HTMLImageElement) => {
    const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(img.getAttribute('src') ?? ''); if (!m) return '';
    const ext = m[1].toLowerCase().replace('jpeg', 'jpg'), bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), name = `image${media.length + 1}.${ext}`;
    media.push({ name, data: bin, ext });
    let w = +(img.getAttribute('width') || img.naturalWidth || 480), h = +(img.getAttribute('height') || img.naturalHeight || 0);
    if (!h) h = Math.round(w * 0.66);
    if (w > textPx) { h = Math.round((h * textPx) / w); w = Math.round(textPx); }
    const id = pid++, rid = `rIdImg${media.length}`;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w * EMU}" cy="${h * EMU}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };
  /** Inline content of an element as runs. */
  const runs = (el: Node, o: { b?: boolean; i?: boolean; sz?: number } = {}): string => [...el.childNodes].map((n) => {
    if (n.nodeType === 3) return run((n.textContent ?? '').replace(/\s+/g, ' '), o);
    if (!(n instanceof HTMLElement)) return '';
    const t = n.tagName;
    if (t === 'BR') return '<w:r><w:br/></w:r>';
    if (t === 'IMG') return image(n as HTMLImageElement);
    if (t === 'B' || t === 'STRONG' || t === 'TH') return runs(n, { ...o, b: true });
    if (t === 'I' || t === 'EM') return runs(n, { ...o, i: true });
    if (t === 'SMALL') return runs(n, { ...o, sz: 18 });
    return runs(n, o);
  }).join('');
  const para = (inner: string, style?: string, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${inner}</w:p>`;
  const BLOCK = /^(P|DIV|SECTION|H[1-6]|UL|OL|TABLE|FIGURE|LI|HEADER|ARTICLE)$/;

  const blocks = (el: Element): string => {
    const out: string[] = []; let inline: Node[] = [];
    const flush = () => { if (inline.length) { const d = document.createElement('span'); inline.forEach((n) => d.appendChild(n.cloneNode(true))); const r = runs(d); if (r.replace(/<[^>]+>/g, '').trim() || r.includes('w:drawing')) out.push(para(r)); inline = []; } };
    for (const n of [...el.childNodes]) {
      if (!(n instanceof HTMLElement) || !BLOCK.test(n.tagName)) { inline.push(n); continue; }
      flush(); const t = n.tagName;
      if (/^H[1-6]$/.test(t)) out.push(para(runs(n), `Heading${Math.min(3, +t[1] - 1 || 1)}`));
      else if (t === 'P') out.push(para(runs(n)));
      else if (t === 'UL' || t === 'OL') [...n.children].forEach((li, i) => out.push(para(run(t === 'OL' ? `${i + 1}. ` : '• ') + runs(li), undefined, '<w:ind w:left="360" w:hanging="240"/>')));
      else if (t === 'TABLE') {
        const rows = [...n.querySelectorAll('tr')]; const cols = Math.max(1, ...rows.map((r) => r.children.length)), cw = Math.floor((pageW - 2 * margin) / cols);
        out.push(`<w:tbl><w:tblPr><w:tblW w:w="${pageW - 2 * margin}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:color="999999"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>${rows.map((r) => `<w:tr>${[...r.children].map((c) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/>${c.tagName === 'TH' ? '<w:shd w:val="clear" w:color="auto" w:fill="E8E8E8"/>' : ''}</w:tcPr>${para(runs(c, { sz: 18, b: c.tagName === 'TH' }))}</w:tc>`).join('')}${Array.from({ length: cols - r.children.length }, () => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`, '<w:p/>');
      } else if (t === 'SECTION' && out.length) { out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>', blocks(n)); }
      else out.push(blocks(n));
    }
    flush(); return out.join('');
  };

  const body = blocks(doc.body.firstElementChild!);
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>LvPlan Pro</dc:creator></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="${R}/image" Target="media/${m.name}"/>`).join('')}</Relationships>` },
    { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults>${[1, 2, 3].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${280 - n * 60}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="0B5CAD"/><w:sz w:val="${36 - n * 6}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>` },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>` },
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
  ];
  return zip(files);
}
