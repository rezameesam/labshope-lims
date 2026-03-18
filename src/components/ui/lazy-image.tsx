import { useState } from "react";
import { cn } from "@/lib/utils";

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

const LazyImage = ({ src, alt, className, ...props }: LazyImageProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={cn(
        "transition-[filter,opacity] duration-500",
        loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm",
        className,
      )}
      {...props}
    />
  );
};

export default LazyImage;
