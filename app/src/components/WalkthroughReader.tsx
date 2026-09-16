import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { C, useTheme } from "../theme";
import { Btn } from "./ui";

/**
 * Paragraph-based reader: tap a paragraph to mark "I stopped here".
 *
 * Pasted guides are routinely tens of thousands of characters (hundreds to
 * thousands of paragraphs), and this lives inside the detail screen's
 * ScrollView — a nested FlatList would share the scroll axis and never
 * virtualise. So instead: the split is memoised on the text, and only a
 * WINDOW-sized slice of paragraphs is mounted, extended on demand.
 */

/** Paragraphs mounted at once, and the step of the "earlier"/"later" buttons. */
const WINDOW = 40;

type Paragraph = { start: number; end: number; body: string };
type Win = { start: number; end: number };

/** Split on blank lines, keeping each paragraph's character offsets in `text`. */
function splitParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  let offset = 0;
  for (const p of text.split(/\n\n+/)) {
    const start = text.indexOf(p, offset);
    out.push({ start, end: start + p.length, body: p });
    offset = start + p.length;
  }
  return out;
}

/** A WINDOW-sized index range centred on `index` (from the top when < 0). */
function windowAround(index: number, total: number): Win {
  if (index < 0) return { start: 0, end: Math.min(WINDOW, total) };
  const start = Math.max(0, index - Math.floor(WINDOW / 2));
  const end = Math.min(total, start + WINDOW);
  return { start: Math.max(0, end - WINDOW), end };
}

type RowProps = {
  index: number;
  body: string;
  done: boolean;
  isMark: boolean;
  /** Only here so memoised rows repaint when the palette changes. */
  themeV: number;
  onPress: (index: number) => void;
};

/**
 * One paragraph. Memoised on primitives so moving the marker re-renders the
 * two affected rows instead of the whole window.
 */
const ParagraphRow = React.memo(function ParagraphRow({
  index,
  body,
  done,
  isMark,
  onPress,
}: RowProps) {
  return (
    <Pressable
      onPress={() => onPress(index)}
      style={{
        padding: 10,
        borderRadius: 6,
        marginBottom: 4,
        backgroundColor: isMark ? C.bgCard : "transparent",
        borderLeftWidth: 3,
        borderLeftColor: done ? C.progressFill : C.border,
      }}
    >
      <Text style={{
        color: done ? C.textMuted : C.textPrimary,
        fontSize: 12,
        lineHeight: 18,
      }}>
        {body}
      </Text>
      {isMark && (
        <Text style={{ color: C.progressFill, fontSize: 10, marginTop: 4 }}>
          📍 You stopped here
        </Text>
      )}
    </Pressable>
  );
});

export function WalkthroughReader({
  text,
  position,
  onMark,
  onEdit,
}: {
  text: string;
  position: number;
  onMark: (pos: number) => void;
  onEdit: () => void;
}) {
  const { version: themeV } = useTheme();
  const paragraphs = useMemo(() => splitParagraphs(text), [text]);
  const total = paragraphs.length;

  /** Index of the marked paragraph, or -1 when nothing is marked. */
  const markIndex = useMemo(
    () =>
      position > 0
        ? paragraphs.findIndex((p) => position >= p.start && position <= p.end)
        : -1,
    [paragraphs, position]
  );

  const [win, setWin] = useState<Win>(() => windowAround(markIndex, total));

  // Adjust the window during render (rather than in an effect, which would
  // paint a stale window first): reset it when the text changes, re-centre it
  // when the marker moves out of view.
  const [prev, setPrev] = useState({ text, markIndex });
  if (prev.text !== text || prev.markIndex !== markIndex) {
    const textChanged = prev.text !== text;
    setPrev({ text, markIndex });
    if (
      textChanged ||
      (markIndex >= 0 && (markIndex < win.start || markIndex >= win.end))
    )
      setWin(windowAround(markIndex, total));
  }

  // Read through refs so the row callback stays referentially stable even
  // though the screen passes a fresh `onMark` closure on every render.
  const onMarkRef = useRef(onMark);
  const paragraphsRef = useRef(paragraphs);
  useEffect(() => {
    onMarkRef.current = onMark;
    paragraphsRef.current = paragraphs;
  });

  const handlePress = useCallback((index: number) => {
    const p = paragraphsRef.current[index];
    if (p) onMarkRef.current(p.end);
  }, []);

  // "Show earlier/later" extends the window rather than sliding it (sliding
  // would yank the text the user is reading out from under them), so the marker
  // normally stays mounted — but after a few taps it is far off-screen. Offer
  // the jump whenever it is outside the window or the window has grown past its
  // initial size; tapping it collapses back to WINDOW paragraphs around it.
  const showJump =
    markIndex >= 0 &&
    (markIndex < win.start ||
      markIndex >= win.end ||
      win.end - win.start > WINDOW);

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ color: C.textMuted, fontSize: 11 }}>
          Tap a paragraph to mark your position
        </Text>
        <Pressable onPress={onEdit}>
          <Text style={{ color: C.accent, fontSize: 11 }}>Edit text</Text>
        </Pressable>
      </View>

      {showJump && (
        <Pressable
          onPress={() => setWin(windowAround(markIndex, total))}
          style={{ marginBottom: 8 }}
        >
          <Text style={{ color: C.accent, fontSize: 11 }}>📍 Jump to marker</Text>
        </Pressable>
      )}

      {win.start > 0 && (
        <Btn
          label={`Show ${WINDOW} earlier`}
          kind="secondary"
          style={{ marginBottom: 8 }}
          onPress={() =>
            setWin((w) => ({ ...w, start: Math.max(0, w.start - WINDOW) }))
          }
        />
      )}

      {paragraphs.slice(win.start, win.end).map((p, i) => {
        const index = win.start + i;
        return (
          <ParagraphRow
            key={index}
            index={index}
            body={p.body}
            done={p.end <= position}
            isMark={index === markIndex}
            themeV={themeV}
            onPress={handlePress}
          />
        );
      })}

      {win.end < total && (
        <Btn
          label={`Show ${WINDOW} later`}
          kind="secondary"
          style={{ marginTop: 4 }}
          onPress={() =>
            setWin((w) => ({ ...w, end: Math.min(total, w.end + WINDOW) }))
          }
        />
      )}
    </View>
  );
}
