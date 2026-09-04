import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type SearchMatch = { from: number; to: number };

type SearchMeta =
  | { type: "set"; term: string; caseSensitive?: boolean; currentIndex?: number }
  | { type: "setIndex"; currentIndex: number }
  | { type: "clear" };

export type SearchPluginState = {
  term: string;
  caseSensitive: boolean;
  currentIndex: number;
  matches: SearchMatch[];
  decorations: DecorationSet;
};

export const searchHighlightKey = new PluginKey<SearchPluginState>("searchHighlight");

function findMatches(
  doc: ProseMirrorNode,
  term: string,
  caseSensitive: boolean
): SearchMatch[] {
  const needleRaw = term.replace(/\s+/g, " ").trim();
  if (!needleRaw) return [];
  const needle = caseSensitive ? needleRaw : needleRaw.toLowerCase();
  const matches: SearchMatch[] = [];

  // Flatten text with collapsed whitespace so multi-word excerpts still match.
  let flat = "";
  const posMap: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (let i = 0; i < node.text.length; i++) {
      const raw = node.text[i]!;
      const ch = /\s/.test(raw) ? " " : caseSensitive ? raw : raw.toLowerCase();
      if (ch === " " && flat.endsWith(" ")) continue;
      flat += ch;
      posMap.push(pos + i);
    }
  });

  let from = 0;
  while (from < flat.length) {
    const idx = flat.indexOf(needle, from);
    if (idx < 0) break;
    const start = posMap[idx];
    const endChar = posMap[idx + needle.length - 1];
    if (start != null && endChar != null) {
      matches.push({ from: start, to: endChar + 1 });
    }
    from = idx + Math.max(1, needle.length);
  }
  return matches;
}

function buildDecos(doc: ProseMirrorNode, matches: SearchMatch[], currentIndex: number) {
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === currentIndex ? "search-match-current" : "search-match",
      })
    )
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchHighlight: (
        term: string,
        opts?: { caseSensitive?: boolean; currentIndex?: number }
      ) => ReturnType;
      setSearchMatchIndex: (index: number) => ReturnType;
      clearSearchHighlight: () => ReturnType;
    };
  }
}

export const SearchHighlight = Extension.create({
  name: "searchHighlight",

  addCommands() {
    return {
      setSearchHighlight:
        (term, opts) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(
              tr.setMeta(searchHighlightKey, {
                type: "set",
                term,
                caseSensitive: opts?.caseSensitive ?? false,
                currentIndex: opts?.currentIndex ?? 0,
              } satisfies SearchMeta)
            );
          }
          return true;
        },
      setSearchMatchIndex:
        (index) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(
              tr.setMeta(searchHighlightKey, {
                type: "setIndex",
                currentIndex: index,
              } satisfies SearchMeta)
            );
          }
          return true;
        },
      clearSearchHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(searchHighlightKey, { type: "clear" } satisfies SearchMeta));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchHighlightKey,
        state: {
          init() {
            return {
              term: "",
              caseSensitive: false,
              currentIndex: 0,
              matches: [],
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(searchHighlightKey) as SearchMeta | undefined;
            let term = prev.term;
            let caseSensitive = prev.caseSensitive;
            let currentIndex = prev.currentIndex;
            let needsRebuild = tr.docChanged;

            if (meta?.type === "clear") {
              return {
                term: "",
                caseSensitive: false,
                currentIndex: 0,
                matches: [],
                decorations: DecorationSet.empty,
              };
            }
            if (meta?.type === "set") {
              term = meta.term;
              caseSensitive = meta.caseSensitive ?? false;
              currentIndex = meta.currentIndex ?? 0;
              needsRebuild = true;
            }
            if (meta?.type === "setIndex") {
              currentIndex = meta.currentIndex;
              needsRebuild = true;
            }

            if (!needsRebuild && !meta) {
              return prev.decorations === DecorationSet.empty && !prev.term
                ? prev
                : {
                    ...prev,
                    decorations: prev.decorations.map(tr.mapping, tr.doc),
                  };
            }

            const matches = findMatches(state.doc, term, caseSensitive);
            if (matches.length === 0) {
              return {
                term,
                caseSensitive,
                currentIndex: 0,
                matches,
                decorations: DecorationSet.empty,
              };
            }
            const idx = ((currentIndex % matches.length) + matches.length) % matches.length;
            return {
              term,
              caseSensitive,
              currentIndex: idx,
              matches,
              decorations: buildDecos(state.doc, matches, idx),
            };
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

export function getSearchState(editor: {
  state: unknown;
}): SearchPluginState | undefined {
  return searchHighlightKey.getState(editor.state as never);
}
