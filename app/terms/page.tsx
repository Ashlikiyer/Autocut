import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <Prose title="Terms" updated="October 27, 2026">
      <p>By using AutoCut you agree to these terms.</p>

      <h2>Your content</h2>
      <ul>
        <li>You must own, or have the rights to, every video you edit with AutoCut.</li>
        <li>
          Videos are processed in your browser and never reach our servers, so AutoCut does not host or
          distribute your content. You are responsible for what you create and post.
        </li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>AutoCut is free with a daily limit. Don&apos;t try to get around the limit or overload the service.</li>
        <li>Don&apos;t use AutoCut for anything illegal.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        AutoCut is a free project provided as is. We do our best, but we can&apos;t promise it will always be
        available or that every edit will be perfect. Keep your original video.
      </p>
    </Prose>
  );
}
