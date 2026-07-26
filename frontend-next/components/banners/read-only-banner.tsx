"use client";
import React from "react";
import KeepBanner from "@/components/banners/BannerBase";

const ReadOnlyBanner = () => {
  return <KeepBanner
    bannerId="read-only-banner"
    text="AlertLens is in read-only mode."
    newWindow={true}
  />
};

export default ReadOnlyBanner;
