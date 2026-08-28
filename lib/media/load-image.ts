"use client";

export type LoadedImage = {
  image: HTMLImageElement;
  objectUrl: string;
  convertedFromHeic: boolean;
  dispose: () => void;
};

function loadHtmlImage(objectUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This browser could not decode the photo."));
    image.src = objectUrl;
  });
}

async function tryNativeDecode(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadHtmlImage(objectUrl);
    return {
      image,
      objectUrl,
      convertedFromHeic: false,
      dispose: () => URL.revokeObjectURL(objectUrl),
    } satisfies LoadedImage;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  try {
    // Safari can decode HEIC natively. Prefer the browser's decoder whenever it
    // works so we avoid an unnecessary copy and preserve the original metadata.
    return await tryNativeDecode(file);
  } catch (nativeError) {
    const { heicTo, isHeic } = await import("heic-to");

    if (!(await isHeic(file))) throw nativeError;

    // libheif is the compatibility path for Chrome and any browser that cannot
    // decode HEIC itself. JPEG keeps the intermediate much smaller than PNG.
    const converted = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.96,
    });
    const objectUrl = URL.createObjectURL(converted);

    try {
      const image = await loadHtmlImage(objectUrl);
      return {
        image,
        objectUrl,
        convertedFromHeic: true,
        dispose: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
}
