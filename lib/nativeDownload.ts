import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, WriteFileResult } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const isNative = (): boolean =>
  typeof window !== "undefined" && Boolean(Capacitor.isNativePlatform?.());

export async function savePdfToDevice(fileName: string, blob: Blob): Promise<void> {
  if (!isNative()) {
    throw new Error("savePdfToDevice can only run on native platforms");
  }

  const base64 = await blobToBase64(blob);
  const path = `certificates/${fileName}`;

  let writeResult: WriteFileResult;
  try {
    const writeResult: WriteFileResult = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    console.log("Native PDF saved:", writeResult.uri);
  } catch (err) {
    console.error("Native PDF save failed", err);
    throw err;
  }

  try {
    const uriResult = await Filesystem.getUri({
      directory: Directory.Documents,
      path,
    });

    if (uriResult.uri) {
      await Share.share({
        title: "KDS Certificate",
        text: "Your KDS Learning certificate is ready",
        url: uriResult.uri,
      });
      return;
    }
  } catch (err) {
    console.error("Native share failed", err);
  }

  if (typeof window !== "undefined") {
    window.alert("Your certificate PDF is saved on the device. Open Files to share it.");
  }
}

export default {
  isNative,
  savePdfToDevice,
};
