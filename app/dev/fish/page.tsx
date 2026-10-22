import { notFound } from 'next/navigation';
import { FishGallery } from './FishGallery';

// Dev-only contact sheet for checking split fish models (colours, orientation, animation).
export default function FishDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <FishGallery />;
}
