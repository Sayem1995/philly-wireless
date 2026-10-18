/**
 * Human-readable device label for a booking item.
 *
 * Model lists sometimes already include the brand family ("Apple iPad" +
 * "iPad Air"), so blindly concatenating produces "Apple iPad iPad Air". If the
 * model starts with a brand token, prepend only the vendor word instead.
 */
export function formatBookingDevice(
  brand: string | null | undefined,
  model: string,
): string {
  const cleanBrand = (brand ?? "").trim();
  const cleanModel = model.trim();
  if (!cleanBrand) return cleanModel;

  const brandTokens = cleanBrand.split(/\s+/);
  const firstModelToken = cleanModel.split(/\s+/)[0]?.toLowerCase() ?? "";
  const modelRepeatsFamily = brandTokens.some(
    (token) => token.toLowerCase() === firstModelToken,
  );

  return modelRepeatsFamily
    ? `${brandTokens[0]} ${cleanModel}`
    : `${cleanBrand} ${cleanModel}`;
}
