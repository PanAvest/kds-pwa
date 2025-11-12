export function cn(...cls: (string | undefined | null | false)[]) {
  return cls.filter(Boolean).join(" ")
}
