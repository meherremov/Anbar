import { Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getStationeryImage } from '../utils/stationeryAssets';

interface ProductThumbProps {
  name: string;
  category?: string;
  icon?: string;
  sizeClassName?: string;
  imgClassName?: string;
}

export function ProductThumb({
  name,
  category = '',
  icon,
  sizeClassName = 'w-10 h-10',
  imgClassName = 'w-8 h-8',
}: ProductThumbProps) {
  const [failed, setFailed] = useState(false);
  const { src, alt } = getStationeryImage(name, category, icon);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className={`${sizeClassName} rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 inline-flex items-center justify-center shrink-0 overflow-hidden`}
    >
      {failed ? (
        <Package className="w-4 h-4 text-[#1976F3] dark:text-blue-400" />
      ) : (
        <img
          src={src}
          alt={alt}
          className={`${imgClassName} object-contain select-none`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
