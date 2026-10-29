import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy" updated="October 27, 2026">
      <p>AutoCut is built so your video file never leaves your device. In plain English:</p>

      <h2>Your video</h2>
      <ul>
        <li>Your video is processed only inside your browser. It is never uploaded to AutoCut.</li>
        <li>It is cleared from memory when you start a new video or close the tab.</li>
      </ul>

      <h2>Your audio and transcript</h2>
      <ul>
        <li>
          To find what you said, a small compressed copy of your audio is sent through our server to{" "}
          <a href="https://groq.com/privacy-policy/" target="_blank" rel="noreferrer">Groq</a> for transcription.
          AutoCut does not store it. Groq&apos;s own data policy applies.
        </li>
        <li>The transcript stays in your browser&apos;s memory for this session only.</li>
      </ul>

      <h2>Snapshots (AI auto-edit)</h2>
      <ul>
        <li>
          When you choose &quot;Let AI edit everything&quot; with &quot;Let AI see the video&quot; switched on, AutoCut
          sends one small, low-resolution contact sheet (6 still frames from your video), along with the transcript, through our
          server to an AI model on Groq so it can decide how to edit.
        </li>
        <li>AutoCut does not store these snapshots. Groq&apos;s own data policy applies.</li>
        <li>Switch &quot;Let AI see the video&quot; off and only the audio is ever sent.</li>
      </ul>

      <h2>What we store</h2>
      <ul>
        <li>One usage record per video: its length, the style you picked, whether it finished, and the time.</li>
        <li>
          A one-way hash of your IP address (SHA-256 with a secret salt), used only to apply the daily
          free limit. We never store your raw IP address.
        </li>
        <li>
          One cookie, <code>ac_vid</code>: a random ID with no personal information, so the free videos are
          counted per browser and people sharing a Wi-Fi don&apos;t use up each other&apos;s videos. We store
          only a salted hash of it. It isn&apos;t used for ads or tracking, and clearing your cookies removes it.
        </li>
        <li>Ratings and comments you choose to send.</li>
      </ul>

      <h2>Questions</h2>
      <p>Contact the project owner through the repository or the site&apos;s social links.</p>
    </Prose>
  );
}
