import { supabase } from "@/integrations/supabase/client";

export const BH_BUCKET = "bh-brand-files";

/** Upload a file to the Brands Hub bucket and return its storage path. */
export async function uploadBhFile(file: File, folder: string): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BH_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}
