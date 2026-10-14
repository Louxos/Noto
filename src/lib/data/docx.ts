import { strToU8, zipSync } from 'fflate';

/**
 * Écriture DOCX minimale mais réelle.
 *
 * Le fichier produit est un document Word valide : titres, paragraphes, listes
 * simples, tableaux et images. Il ne reproduit pas une mise en page complexe
 * (colonnes, en-têtes, styles personnalisés) et le dit clairement : c’est une
 * reconstruction, pas une conversion fidèle.
 */

export type DocxBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; rows: string[][] }
  | { type: 'image'; bytes: Uint8Array; width: number; height: number; caption?: string };

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function paragraph(text: string, style?: string): string {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const runs = text.split(/\n/u).map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`).join('');
  return `<w:p>${properties}${runs}</w:p>`;
}

function listItem(text: string, ordered: boolean): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${ordered ? 2 : 1}"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function table(rows: string[][]): string {
  const columns = rows.reduce((maximum, row) => Math.max(maximum, row.length), 1);
  const width = Math.floor(9_000 / columns);
  const body = rows.map((row) => {
    const cells = Array.from({ length: columns }, (_, index) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(row[index] ?? '')}</w:tc>`).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/></w:tblBorders></w:tblPr>${body}</w:tbl>${paragraph('')}`;
}

function image(block: Extract<DocxBlock, { type: 'image' }>, imageIndex: number): string {
  const index = imageIndex;
  const maxWidth = 6_000_000; // 600 pt en EMU (914400 EMU par pouce)
  const ratio = block.width > 0 ? block.height / block.width : 0.75;
  const widthEmu = Math.min(maxWidth, Math.round(block.width * 9_525));
  const heightEmu = Math.round(widthEmu * ratio);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="${index + 1}" name="Image ${index + 1}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="Image ${index + 1}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage${index + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function numbering(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
}

function styles(): string {
  const heading = (level: number, size: number, color = '292B3A') => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:color w:val="${color}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>${heading(1, 36)}${heading(2, 30)}${heading(3, 26)}${heading(4, 24)}</w:styles>`;
}

export function writeDocx(blocks: DocxBlock[], title = 'Document Noto'): Uint8Array {
  const images: Extract<DocxBlock, { type: 'image' }>[] = [];
  const body = blocks.map((block) => {
    if (block.type === 'heading') return paragraph(block.text, `Heading${block.level}`);
    if (block.type === 'paragraph') return paragraph(block.text);
    if (block.type === 'list') return block.items.map((item) => listItem(item, Boolean(block.ordered))).join('');
    if (block.type === 'table') return table(block.rows);
    images.push(block);
    return image(block, images.length - 1);
  }).join('');

  const imageParts: Record<string, Uint8Array> = {};
  const imageRelationships = images.map((block, index) => {
    const name = `image${index + 1}.png`;
    imageParts[`word/media/${name}`] = block.bytes;
    return `<Relationship Id="rIdImage${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`;
  }).join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(styles()),
    'word/numbering.xml': strToU8(numbering()),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${imageRelationships}</Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Noto</dc:creator><cp:lastModifiedBy>Noto</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
    ...imageParts,
  };

  return zipSync(files, { level: 6 });
}
