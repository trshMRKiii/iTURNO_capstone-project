import React from "react";
import RemittanceGapBanner from "./RemittanceGapBanner";
import WipModeBanner from "./WipModeBanner";

export default function GlobalNotices({ canViewRemittance }) {
  return (
    <>
      <RemittanceGapBanner canViewRemittance={canViewRemittance} />
      <WipModeBanner />
    </>
  );
}
