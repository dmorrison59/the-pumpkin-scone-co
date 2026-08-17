export function getLaunchConfig() {
  const pickupLocation = process.env.PICKUP_LOCATION?.trim() || "";
  const contactEmail = process.env.CONTACT_EMAIL?.trim() || "";
  const contactPhone = process.env.CONTACT_PHONE?.trim() || "";
  const allergenNotice = process.env.ALLERGEN_NOTICE?.trim() || "";

  return {
    pickupLocation,
    contactEmail,
    contactPhone,
    allergenNotice,
    hasPickupLocation: Boolean(pickupLocation),
    hasContactEmail: Boolean(contactEmail),
    hasContactPhone: Boolean(contactPhone),
    hasAllergenNotice: Boolean(allergenNotice),
  };
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (normalized.length !== 10) return value;
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}
