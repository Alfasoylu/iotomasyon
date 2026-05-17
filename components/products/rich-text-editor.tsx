"use client";

/**
 * Phase 27 — Product Media and Content Studio
 *
 * RichTextEditor: Tiptap-based WYSIWYG editor for product descriptions.
 * Outputs and accepts HTML. Designed for use inside react-hook-form via
 * an onChange callback.
 *
 * Toolbar: Bold · Italic · Underline-free · Bullet list · Ordered list · Separator
 * The output is stored in Product.description as HTML.
 */

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  value: string;                      // HTML string
  onChange: (html: string) => void;   // called when content changes
  placeholder?: string;
  disabled?: boolean;
};

export function RichTextEditor({ value, onChange, placeholder, disabled }: Props) {
  // Guard against SSR hydration mismatch — Tiptap is DOM-only
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Track the last value we pushed into the editor to avoid loops
  const lastPushedValue = useRef<string>("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // treat empty paragraph as empty string
      const empty = html === "<p></p>";
      const out = empty ? "" : html;
      lastPushedValue.current = out; // track what we're pushing so the effect won't re-push it
      onChange(out);
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[140px] max-h-[400px] overflow-y-auto px-4 py-3 text-sm text-slate-700 leading-7 focus:outline-none",
      },
    },
  });

  // Sync external value changes (e.g., "XML'den al" button)
  // Skip if the incoming value is what we already pushed — prevents onChange loop.
  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming === lastPushedValue.current) return;
    const current = editor.getHTML();
    if (current !== incoming) {
      lastPushedValue.current = incoming;
      editor.commands.setContent(incoming);
    }
  }, [value, editor]);

  const toggleBold = useCallback(() => editor?.chain().focus().toggleBold().run(), [editor]);
  const toggleItalic = useCallback(() => editor?.chain().focus().toggleItalic().run(), [editor]);
  const toggleBullet = useCallback(() => editor?.chain().focus().toggleBulletList().run(), [editor]);
  const toggleOrdered = useCallback(() => editor?.chain().focus().toggleOrderedList().run(), [editor]);
  const toggleH2 = useCallback(() => editor?.chain().focus().toggleHeading({ level: 2 }).run(), [editor]);
  const toggleH3 = useCallback(() => editor?.chain().focus().toggleHeading({ level: 3 }).run(), [editor]);

  const toolbarBtn = (
    active: boolean,
    onClick: () => void,
    label: string,
    title?: string,
  ) => (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      disabled={disabled || !editor}
      className={`rounded px-2 py-1 text-xs font-semibold transition ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100"
      } disabled:opacity-40`}
    >
      {label}
    </button>
  );

  if (!mounted || !editor) {
    // Pre-mount: render a plain textarea placeholder to avoid layout shift
    return (
      <div className="min-h-[140px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
        {placeholder ?? "Açıklama editörü yükleniyor…"}
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm transition ${
        disabled ? "opacity-60" : "border-slate-200 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100"
      }`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
        {toolbarBtn(editor.isActive("heading", { level: 2 }), toggleH2, "H2", "Başlık 2")}
        {toolbarBtn(editor.isActive("heading", { level: 3 }), toggleH3, "H3", "Başlık 3")}
        <span className="mx-1 text-slate-200">|</span>
        {toolbarBtn(editor.isActive("bold"), toggleBold, "B", "Kalın")}
        {toolbarBtn(editor.isActive("italic"), toggleItalic, "İ", "İtalik")}
        <span className="mx-1 text-slate-200">|</span>
        {toolbarBtn(editor.isActive("bulletList"), toggleBullet, "• Liste", "Madde listesi")}
        {toolbarBtn(editor.isActive("orderedList"), toggleOrdered, "1. Liste", "Numaralı liste")}
      </div>

      {/* Editor area */}
      <div className="bg-white">
        {!editor.getText() && placeholder && (
          <div className="pointer-events-none absolute px-4 py-3 text-sm text-slate-400">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
