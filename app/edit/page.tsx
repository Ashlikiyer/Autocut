import type { Metadata } from "next";
import { Editor } from "@/components/editor/Editor";

export const metadata: Metadata = {
  title: "Edit a video",
};

export default function EditPage() {
  return <Editor />;
}
