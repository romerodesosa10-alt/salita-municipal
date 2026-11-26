import { useLayoutEffect, useState } from 'react';

const sizes = [100, 110, 125, 140];
const storageKey = 'salita:text-size';

function readSize() {
  try {
    return Math.max(0, sizes.indexOf(Number(localStorage.getItem(storageKey))));
  } catch {
    return 0;
  }
}

export default function TextSizeControl() {
  const [index, setIndex] = useState(readSize);
  const size = sizes[index];

  useLayoutEffect(() => {
    document.documentElement.dataset.textSize = String(size);
    try { localStorage.setItem(storageKey, String(size)); } catch { /* El ajuste sigue activo en esta página. */ }
  }, [size]);

  return <div className="text-size-control" role="group" aria-label="Tamaño de letra">
    <button type="button" aria-label="Achicar letra" title="Achicar letra" disabled={index === 0}
      onClick={() => setIndex(value => Math.max(0, value - 1))}>A−</button>
    <output aria-label="Tamaño de letra actual">{size}%</output>
    <button type="button" aria-label="Agrandar letra" title="Agrandar letra" disabled={index === sizes.length - 1}
      onClick={() => setIndex(value => Math.min(sizes.length - 1, value + 1))}>A+</button>
  </div>;
}
