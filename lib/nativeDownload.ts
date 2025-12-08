// File: lib/nativeDownload.ts
// Behaviour: native download helper per README-upgrade.md. Detects Capacitor-native runtime and saves PDF blobs to
// Documents/certificates/<file> via @capacitor/filesystem, then opens the system share/save sheet via @capacitor/share.
// Manual test: on device build, tap "Download certificate" and confirm a share/save dialog appears with the PDF.
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem, WriteFileResult } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  return !!Capacitor.isNativePlatform?.() && Capacitor.isNativePlatform();
}

export async function savePdfToDevice(fileName: string, blob: Blob): Promise<void> {
  // Convert blob -> base64 for Filesystem.
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const path = `certificates/${fileName}`;
  const result: WriteFileResult = await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });

  const fileUri =
    result.uri ||
    (
      await Filesystem.getUri({
        path,
        directory: Directory.Documents,
      })
    ).uri;

  await Share.share({
    title: "KDS Certificate",
    text: "Your KDS Learning certificate",
    url: fileUri,
    dialogTitle: "Share or save your certificate",
  });
}
