import { linkifyText } from "@/lib/linkify";

// Freitext mit klickbaren Links (http(s)://… und www.…), öffnet in einem neuen Tab.
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkifyText(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium break-all text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {part.value}
          </a>
        ) : (
          part.value
        ),
      )}
    </>
  );
}
