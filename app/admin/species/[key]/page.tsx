import { SpeciesForm } from '@/components/admin/SpeciesForm';

export default async function AdminSpeciesEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <SpeciesForm speciesKey={decodeURIComponent(key)} />;
}
