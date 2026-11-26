function shouldNormalizeToTextPlain(mime: string): boolean {
  if (!mime) return false

  const lowerMime = mime.toLowerCase()

  if (lowerMime.startsWith("text/") && lowerMime !== "text/plain") {
    return true
  }

  const textBasedTypes = [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-yaml",
    "application/yaml",
    "application/toml",
    "application/x-sh",
    "application/x-shellscript",
    "application/octet-stream",
    "image/svg+xml",
  ]

  return textBasedTypes.includes(lowerMime)
}

function isHeicMime(mime: string): boolean {
  if (!mime) return false
  const lowerMime = mime.toLowerCase()
  return lowerMime === "image/heic" || lowerMime === "image/heif"
}

async function convertHeicToJpeg(file: { mime: string; filename?: string; url: string }): Promise<{ mime: string; filename?: string; url: string }> {
  try {
    const heic2any = (await import("heic2any")).default

    const commaIndex = file.url.indexOf(",")
    if (commaIndex === -1) return file

    const base64Data = file.url.substring(commaIndex + 1)
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const heicBlob = new Blob([bytes], { type: file.mime })

    const jpegBlob = (await heic2any({
      blob: heicBlob,
      toType: "image/jpeg",
      quality: 0.9,
    })) as Blob

    const jpegDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(jpegBlob)
    })

    let newFilename = file.filename
    if (newFilename) {
      newFilename = newFilename.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg")
    }

    return {
      mime: "image/jpeg",
      filename: newFilename,
      url: jpegDataUrl,
    }
  } catch (error) {
    console.warn("Failed to convert HEIC to JPEG:", error)
    return file
  }
}

export async function normalizeFilePart(file: { mime: string; filename?: string; url: string }): Promise<{ mime: string; filename?: string; url: string }> {
  if (isHeicMime(file.mime)) {
    return convertHeicToJpeg(file)
  }

  if (!shouldNormalizeToTextPlain(file.mime)) {
    return file
  }

  let normalizedUrl = file.url

  if (file.url.startsWith("data:")) {
    const commaIndex = file.url.indexOf(",")
    if (commaIndex !== -1) {
      const meta = file.url.substring(5, commaIndex)
      const content = file.url.substring(commaIndex)

      const newMeta = meta.replace(/^[^;,]+/, "text/plain")
      normalizedUrl = `data:${newMeta}${content}`
    }
  }

  return {
    mime: "text/plain",
    filename: file.filename,
    url: normalizedUrl,
  }
}

