export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function generateUniqueSlug(
  baseName: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const baseSlug = slugify(baseName) || "organization";
  let slug = baseSlug;
  let suffix = 0;

  while (await isTaken(slug)) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return slug;
}
