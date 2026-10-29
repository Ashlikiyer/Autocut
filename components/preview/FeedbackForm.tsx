"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendFeedback } from "@/lib/client";
import { Button } from "@/components/ui/button";

export function FeedbackForm({ usageId }: { usageId: number }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (usageId <= 0) return null;
  if (status === "sent") {
    return <p className="text-center text-sm text-muted-foreground">Thanks for the feedback!</p>;
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-[10px] border border-white/[.07] bg-[#111113] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return;
        setStatus("sending");
        try {
          await sendFeedback(usageId, rating, comment.trim() || undefined);
          setStatus("sent");
        } catch {
          setStatus("error");
        }
      }}
    >
      <p className="text-sm font-medium">How did AutoCut do?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={cn(
                "size-6",
                n <= rating ? "fill-primary text-primary" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="What felt wrong? (optional)"
            className="resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button type="submit" variant="secondary" disabled={status === "sending"}>
            Send feedback
          </Button>
          {status === "error" && (
            <p className="text-xs text-destructive">Couldn&apos;t send that. Try again?</p>
          )}
        </>
      )}
    </form>
  );
}
