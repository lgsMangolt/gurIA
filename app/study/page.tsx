import { StudyApp } from '@/components/study/StudyApp';
import './study.css';
import './nexo-layouts.css';
export const metadata = {
  title: 'gurIA · Aprenda conectando ideias',
  icons: { icon: '/study/gurIA-icon.svg' },
};
export default function StudyPage() {
  return <StudyApp />;
}
