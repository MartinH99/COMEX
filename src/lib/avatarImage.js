const SIZE = 400;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const canvasToBlob = (canvas, type, quality) =>
  new Promise(resolve => canvas.toBlob(resolve, type, quality));

// Recorta al centro en un cuadrado chico. Redibujarla también descarta los metadatos,
// como la ubicación que guardan muchos celulares.
export async function prepareAvatar(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Elegí una imagen JPG, PNG o WebP.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('La imagen supera el máximo de 15 MB.');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('No se pudo leer esa imagen.');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d').drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE
  );
  bitmap.close();

  const webp = await canvasToBlob(canvas, 'image/webp', 0.85);
  // Algunos navegadores no generan WebP y devuelven otro formato
  const blob = webp?.type === 'image/webp' ? webp : await canvasToBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return blob;
}
