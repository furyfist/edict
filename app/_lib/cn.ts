import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The class merger.
 *
 * Every component that accepts a `className` merges it LAST, so a caller can
 * always override a default without the component having to anticipate it.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
