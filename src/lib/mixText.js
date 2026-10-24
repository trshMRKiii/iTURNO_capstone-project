// "3 × ₱10.00 + 2 × ₱5.00" for a visit's breakdown (see kiosk._breakdown); empty when a
// single denomination covers the fare, since the amount alone already says it.
export const mixText = (breakdown = []) =>
  breakdown.length > 1
    ? breakdown.map(({ qty, price }) => `${qty} × ₱${Number(price).toFixed(2)}`).join(" + ")
    : "";
