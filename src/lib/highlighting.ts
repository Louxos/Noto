import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import dos from 'highlight.js/lib/languages/dos';
import powershell from 'highlight.js/lib/languages/powershell';
import ini from 'highlight.js/lib/languages/ini';
import markdown from 'highlight.js/lib/languages/markdown';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import { languageForExtension } from './fileTypes';

const languages = {
  javascript, typescript, xml, css, scss, json, yaml, python, java, c, cpp, csharp,
  php, sql, bash, dos, powershell, ini, toml: ini, markdown, rust, go, ruby, swift, kotlin,
};
Object.entries(languages).forEach(([name, language]) => hljs.registerLanguage(name, language));

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
  })[character] ?? character);
}

export function highlightCode(content: string, extension: string): { html: string; simplified: boolean } {
  const language = languageForExtension(extension);
  const simplified = content.length > 500_000;
  if (simplified || !language || !hljs.getLanguage(language)) {
    return { html: escapeHtml(content || ' '), simplified };
  }
  try {
    return { html: hljs.highlight(content || ' ', { language, ignoreIllegals: true }).value, simplified: false };
  } catch {
    return { html: escapeHtml(content || ' '), simplified: false };
  }
}
