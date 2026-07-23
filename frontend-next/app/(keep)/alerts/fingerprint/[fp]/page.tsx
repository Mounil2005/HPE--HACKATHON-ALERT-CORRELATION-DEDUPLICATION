import { AlertFingerprintPage } from "./ui/alert-fingerprint-page";

type PageProps = {
  params: Promise<{ fp: string }>;
};

export default async function Page({ params }: PageProps) {
  const { fp } = await params;
  return <AlertFingerprintPage fingerprint={fp} />;
}

export async function generateMetadata({ params }: PageProps) {
  const { fp } = await params;
  return {
    title: `Alert ${fp} | AlertLens`,
    description: "View alert details",
  };
}
