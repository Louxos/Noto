import hljs from 'highlight.js/lib/core';
import type { HLJSApi, Language, LanguageFn } from 'highlight.js';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import less from 'highlight.js/lib/languages/less';
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
import scala from 'highlight.js/lib/languages/scala';
import dart from 'highlight.js/lib/languages/dart';
import lua from 'highlight.js/lib/languages/lua';
import perl from 'highlight.js/lib/languages/perl';
import r from 'highlight.js/lib/languages/r';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import haskell from 'highlight.js/lib/languages/haskell';
import elm from 'highlight.js/lib/languages/elm';
import clojure from 'highlight.js/lib/languages/clojure';
import groovy from 'highlight.js/lib/languages/groovy';
import gradle from 'highlight.js/lib/languages/gradle';
import fsharp from 'highlight.js/lib/languages/fsharp';
import vbnet from 'highlight.js/lib/languages/vbnet';
import vbscript from 'highlight.js/lib/languages/vbscript';
import protobuf from 'highlight.js/lib/languages/protobuf';
import graphql from 'highlight.js/lib/languages/graphql';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import makefile from 'highlight.js/lib/languages/makefile';
import cmake from 'highlight.js/lib/languages/cmake';
import nix from 'highlight.js/lib/languages/nix';
import latex from 'highlight.js/lib/languages/latex';
import asciidoc from 'highlight.js/lib/languages/asciidoc';
import diff from 'highlight.js/lib/languages/diff';
import { languageForExtension } from './fileTypes';

/**
 * Grammaires locales, écrites ici parce que highlight.js n’en fournit pas :
 *  - `jsonc` couvre JSON avec commentaires et JSON5 (clés non citées, virgules finales) ;
 *  - `hcl` couvre Terraform et HCL (blocs, attributs, interpolations) ;
 *  - `solidity` et `pkl` couvrent deux langages à syntaxe C-like ou à blocs.
 * Elles restent volontairement courtes : elles colorcent ce qu’un lecteur de
 * fichiers doit distinguer (commentaires, chaînes, nombres, mots-clés), jamais
 * plus. En cas de doute, highlight.js retombe sur du texte échappé, sans casser
 * l’affichage.
 */
function jsonWithComments(hljsApi: HLJSApi): Language {
  return {
    name: 'JSON with Comments',
    aliases: ['jsonc', 'json5'],
    contains: [
      hljsApi.C_LINE_COMMENT_MODE,
      hljsApi.C_BLOCK_COMMENT_MODE,
      { scope: 'attr', begin: /"(?:\\.|[^"\\])*"(?=\s*:)/ },
      { scope: 'attr', begin: /[A-Za-z_$][\w$]*(?=\s*:)/ },
      { scope: 'string', begin: /"(?:\\.|[^"\\])*"/ },
      { scope: 'string', begin: /'(?:\\.|[^'\\])*'/ },
      { scope: 'literal', begin: /\b(?:true|false|null)\b/ },
      { scope: 'number', begin: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
      { scope: 'punctuation', begin: /[{}[\],]/ },
    ],
  };
}

function hcl(hljsApi: HLJSApi): Language {
  return {
    name: 'HCL',
    aliases: ['terraform'],
    keywords: {
      keyword: 'resource data variable output module provider locals terraform dynamic moved import check',
      literal: 'true false null',
      built_in: 'for_each depends_on count lifecycle provisioner connection',
    },
    contains: [
      hljsApi.HASH_COMMENT_MODE,
      hljsApi.C_LINE_COMMENT_MODE,
      hljsApi.C_BLOCK_COMMENT_MODE,
      { scope: 'string', begin: /"/, end: /"/, illegal: /\n/, contains: [{ scope: 'subst', begin: /\$\{/, end: /\}/ }] },
      { scope: 'number', begin: /\b\d+(?:\.\d+)?\b/u },
      { scope: 'attr', begin: /[A-Za-z_][\w-]*(?=\s*=)/ },
    ],
  };
}

function solidity(hljsApi: HLJSApi): Language {
  return {
    name: 'Solidity',
    aliases: ['sol'],
    keywords: {
      keyword: 'pragma solidity import contract interface library abstract function modifier event error struct enum mapping is using for '
        + 'returns return if else while do for break continue throw emit new delete try catch assembly unchecked '
        + 'public private internal external pure view payable virtual override constant immutable anonymous indexed',
      literal: 'true false',
      built_in: 'msg tx block address uint uint8 uint16 uint32 uint64 uint128 uint256 int int256 bool bytes bytes32 string mapping this '
        + 'require assert revert keccak256 abi',
    },
    contains: [
      hljsApi.C_LINE_COMMENT_MODE,
      hljsApi.C_BLOCK_COMMENT_MODE,
      hljsApi.APOS_STRING_MODE,
      hljsApi.QUOTE_STRING_MODE,
      hljsApi.C_NUMBER_MODE,
      { scope: 'meta', begin: /\b(?:wei|gwei|ether|seconds|minutes|hours|days|weeks)\b/ },
    ],
  };
}

function pkl(hljsApi: HLJSApi): Language {
  return {
    name: 'Pkl',
    keywords: {
      keyword: 'module amends import extends class typealias function local abstract open hidden when if else for in new this is as '
        + 'read readOrNull readGlob throw trace outer super let',
      literal: 'true false null',
      built_in: 'String Int Float Boolean List Set Map Pair Dynamic Duration DataSize Regex IntSeq',
    },
    contains: [
      hljsApi.C_LINE_COMMENT_MODE,
      hljsApi.C_BLOCK_COMMENT_MODE,
      { scope: 'string', begin: /"""/, end: /"""/, contains: [{ scope: 'subst', begin: /\\\(/, end: /\)/ }] },
      { scope: 'string', begin: /"/, end: /"/, illegal: /\n/, contains: [{ scope: 'subst', begin: /\\\(/, end: /\)/ }] },
      hljsApi.C_NUMBER_MODE,
      { scope: 'attr', begin: /[A-Za-z_][\w-]*(?=\s*=)/ },
    ],
  };
}

/**
 * Langages enregistrés : ceux qu’un fichier pris en charge par Noto peut
 * demander. Le tableau est volontairement explicite — chaque import est un
 * grammaire réellement utilisée, ce qui évite d’alourdir le paquet avec les
 * 190 langages de highlight.js.
 */
const languages: Record<string, LanguageFn> = {
  javascript, typescript, xml, css, scss, less, json, yaml, python, java, c, cpp, csharp,
  php, sql, bash, dos, powershell, ini, toml: ini, markdown, rust, go, ruby, swift, kotlin,
  scala, dart, lua, perl, r, elixir, erlang, haskell, elm, clojure, groovy, gradle, fsharp,
  vbnet, vbscript, protobuf, graphql, dockerfile, makefile, cmake, nix, latex, asciidoc,
  diff, jsonc: jsonWithComments, hcl, solidity, pkl,
};

Object.entries(languages).forEach(([name, language]) => hljs.registerLanguage(name, language));

/** Langages réellement enregistrés, dans l’ordre alphabétique. */
export function registeredLanguages(): string[] {
  return Object.keys(languages).sort();
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
  })[character] ?? character);
}

/**
 * Coloration d’un contenu. Au-delà de 500 000 caractères, le contenu est
 * affiché en texte échappé : la coloration ne doit jamais rendre un gros
 * fichier plus lent à lire qu’un simple défilement.
 */
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
