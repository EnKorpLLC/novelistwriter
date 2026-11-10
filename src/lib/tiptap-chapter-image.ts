import Image from "@tiptap/extension-image";

/**
 * Images in chapters: full-width illustrations and maps, or a small centered ornament used as a scene break.
 * The role travels in the HTML as data-role so every export can tell them apart.
 */
export const ChapterImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      role: {
        default: "full",
        parseHTML: (el: HTMLElement) => (el.getAttribute("data-role") === "break" ? "break" : "full"),
        renderHTML: (attrs: { role?: string }) => ({ "data-role": attrs.role === "break" ? "break" : "full" }),
      },
    };
  },
}).configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "chapter-image" } });
